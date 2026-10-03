// Every manifest validates against its client's format, they agree with each
// other, and the hooks match what `passport hook install` registers.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import Ajv from "ajv";
import { PIN, PLUGIN, ROOT } from "./helpers.mjs";
import * as schemas from "./schemas.mjs";

const MCP_URL = "https://passportmcp.com/mcp";
const ajv = new Ajv({ allErrors: true, strict: true });
ajv.addFormat("uri", (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
});

const read = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const P = "plugins/passport";

const MANIFESTS = {
  ".claude-plugin/marketplace.json": schemas.claudeMarketplace,
  [`${P}/.claude-plugin/plugin.json`]: schemas.claudePlugin,
  [`${P}/hooks/hooks.json`]: schemas.claudeHooks,
  [`${P}/.mcp.json`]: schemas.claudeMcp,
  ".agents/plugins/marketplace.json": schemas.codexMarketplace,
  [`${P}/.codex-plugin/plugin.json`]: schemas.codexPlugin,
  [`${P}/hooks/codex-hooks.json`]: schemas.codexHooks,
  ".cursor-plugin/marketplace.json": schemas.cursorMarketplace,
  [`${P}/.cursor-plugin/plugin.json`]: schemas.cursorPlugin,
  [`${P}/hooks/cursor-hooks.json`]: schemas.cursorHooks,
  "gemini-extension.json": schemas.geminiExtension
};

for (const [path, schema] of Object.entries(MANIFESTS)) {
  test(`${path} matches its client's format`, () => {
    const validate = ajv.compile(schema);
    const ok = validate(read(path));
    assert.ok(ok, `${path}: ${ajv.errorsText(validate.errors, { separator: "\n" })}`);
  });
}

test("one version everywhere, and it is the pinned CLI version", () => {
  const versions = {
    "package.json": read("package.json").version,
    "claude plugin": read(`${P}/.claude-plugin/plugin.json`).version,
    "codex plugin": read(`${P}/.codex-plugin/plugin.json`).version,
    "cursor plugin": read(`${P}/.cursor-plugin/plugin.json`).version,
    "cursor marketplace": read(".cursor-plugin/marketplace.json").metadata.version,
    gemini: read("gemini-extension.json").version
  };
  for (const script of ["passport-hook.sh", "passport-hook.ps1"]) {
    const text = readFileSync(join(PLUGIN, "scripts", script), "utf8");
    versions[script] = /(?:PASSPORT_CLI_VERSION=|\$PassportCliVersion = )["']([^"']+)["']/.exec(text)?.[1];
  }
  versions.changelog = /^## (\d+\.\d+\.\d+)/m.exec(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"))?.[1];
  versions.readme = /passport-bridge@(\d+\.\d+\.\d+)/.exec(readFileSync(join(ROOT, "README.md"), "utf8"))?.[1];
  for (const [where, version] of Object.entries(versions)) assert.equal(version, PIN, where);
});

test("every client connects to the one Passport URL", () => {
  assert.deepEqual(read(`${P}/.mcp.json`).mcpServers, { passport: { type: "http", url: MCP_URL } });
  assert.deepEqual(read(`${P}/.cursor-plugin/plugin.json`).mcpServers, { passport: { url: MCP_URL } });
  assert.deepEqual(read("gemini-extension.json").mcpServers, { passport: { httpUrl: MCP_URL } });
  assert.equal(read(`${P}/.codex-plugin/plugin.json`).mcpServers, "./.mcp.json");
});

test("all three marketplaces list the one plugin at the same path", () => {
  assert.equal(read(".claude-plugin/marketplace.json").plugins[0].source, `./${P}`);
  assert.equal(read(".cursor-plugin/marketplace.json").plugins[0].source, `./${P}`);
  assert.equal(read(".agents/plugins/marketplace.json").plugins[0].source.path, `./${P}`);
  for (const path of [".claude-plugin/marketplace.json", ".cursor-plugin/marketplace.json", ".agents/plugins/marketplace.json"]) {
    const marketplace = read(path);
    assert.equal(marketplace.name, "passport-plugins", path);
    assert.deepEqual(marketplace.plugins.map((plugin) => plugin.name), ["passport"], path);
  }
});

/** event → [matcher, mode] for each client's hooks file. */
function hookTable(hooks, client) {
  const table = {};
  for (const [event, entries] of Object.entries(hooks.hooks)) {
    for (const entry of entries) {
      const handlers = entry.hooks ?? [entry];
      for (const handler of handlers) {
        const match = /passport-hook\.sh"? (guard|audit|session-start) ([a-z-]+)$/.exec(handler.command);
        assert.ok(match, `${event}: ${handler.command}`);
        assert.equal(match[2], client, `${event} names its client`);
        table[event] = [entry.matcher ?? null, match[1], handler.timeout];
      }
    }
  }
  return table;
}

test("hook events and matchers mirror `passport hook install` (bridge/src/cliHookInstall.ts)", () => {
  assert.deepEqual(hookTable(read(`${P}/hooks/hooks.json`), "claude-code"), {
    SessionStart: [null, "session-start", 10],
    PreToolUse: ["Bash", "guard", 5],
    PostToolUse: ["Bash", "audit", 5],
    PostToolUseFailure: ["Bash", "audit", 5]
  });
  assert.deepEqual(hookTable(read(`${P}/hooks/codex-hooks.json`), "codex"), {
    SessionStart: ["startup|resume", "session-start", 10],
    PreToolUse: ["Bash", "guard", 5],
    PostToolUse: ["Bash", "audit", 5]
  });
  assert.deepEqual(hookTable(read(`${P}/hooks/cursor-hooks.json`), "cursor"), {
    sessionStart: [null, "session-start", 10],
    beforeShellExecution: [null, "guard", 5],
    afterShellExecution: [null, "audit", 5]
  });
});

test("Codex has a Windows command for every hook, pointing at the PowerShell script", () => {
  for (const entries of Object.values(read(`${P}/hooks/codex-hooks.json`).hooks)) {
    for (const handler of entries.flatMap((entry) => entry.hooks)) {
      const unix = /passport-hook\.sh" (.+)$/.exec(handler.command)[1];
      assert.match(handler.commandWindows, /^powershell -NoProfile -ExecutionPolicy Bypass -File "\$\{PLUGIN_ROOT\}\\scripts\\passport-hook\.ps1" /);
      assert.ok(handler.commandWindows.endsWith(` ${unix}`));
    }
  }
});

test("hook commands quote the plugin root and run the script through sh", () => {
  for (const handler of read(`${P}/hooks/hooks.json`).hooks.PreToolUse[0].hooks) {
    assert.match(handler.command, /^sh "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/passport-hook\.sh" /);
  }
  for (const handler of read(`${P}/hooks/codex-hooks.json`).hooks.PreToolUse[0].hooks) {
    assert.match(handler.command, /^sh "\$\{PLUGIN_ROOT\}\/scripts\/passport-hook\.sh" /);
  }
});

test("every path a manifest names exists inside the plugin", () => {
  const codex = read(`${P}/.codex-plugin/plugin.json`);
  const cursor = read(`${P}/.cursor-plugin/plugin.json`);
  for (const relative of [codex.skills, codex.mcpServers, codex.hooks, cursor.hooks]) {
    assert.ok(existsSync(join(PLUGIN, relative)), relative);
  }
  assert.ok(existsSync(join(ROOT, read("gemini-extension.json").contextFileName)));
  assert.ok(statSync(join(PLUGIN, "scripts", "passport-hook.sh")).mode & 0o111, "hook script is executable");
});

test("no top-level bin/ anywhere (claude.ai organization sync rejects it)", () => {
  assert.equal(existsSync(join(ROOT, "bin")), false);
  assert.equal(existsSync(join(PLUGIN, "bin")), false);
});

test("no root Agent Plugins plugin.json: it turns off Codex plugin hooks (see README)", () => {
  assert.equal(existsSync(join(PLUGIN, "plugin.json")), false);
});

test("the skill is short, named for its folder, and has a description", () => {
  const text = readFileSync(join(PLUGIN, "skills", "passport", "SKILL.md"), "utf8");
  const front = /^---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---\n/.exec(text);
  assert.ok(front, "frontmatter");
  assert.equal(front[1], "passport");
  assert.ok(front[2].length > 40 && front[2].length < 1024);
  assert.ok(text.split("\n").length <= 60, "under ~60 lines");
  assert.match(text, /passport wait <id>/);
  assert.match(text, /passport rules test/);
});

test("nothing in the repo carries a token or credential-shaped value", () => {
  const skip = new Set([".git", "node_modules"]);
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(ROOT);
  const pattern = /(?:pp_|pat_|sk-|ghp_|xox[bp]-)[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY/;
  for (const file of files) {
    if (file.endsWith(".tgz")) continue;
    assert.doesNotMatch(readFileSync(file, "utf8"), pattern, file);
  }
});
