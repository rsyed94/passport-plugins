// Each client's own validator or installer, when that client is installed on
// this machine. Every run uses a sandboxed HOME and config folder, works only on
// local files, and never connects to Passport. Skipped when the CLI is missing.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PLUGIN, ROOT } from "./helpers.mjs";

const has = (bin) => spawnSync("sh", ["-c", `command -v ${bin}`]).status === 0;

function isolated() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "passport-plugin-validate-")));
  const home = join(dir, "home");
  mkdirSync(home, { recursive: true });
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    CODEX_HOME: join(home, ".codex"),
    PASSPORT_HOME: join(home, ".passport"),
    DISABLE_AUTOUPDATER: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    GEMINI_CLI_DISABLE_AUTO_UPDATE: "true"
  };
  mkdirSync(env.CODEX_HOME, { recursive: true });
  return { dir, env, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function run(bin, args, env) {
  const result = spawnSync(bin, args, { env, cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test("claude plugin validate --strict: plugin and marketplace", { skip: !has("claude") && "Claude Code CLI not installed" }, () => {
  const box = isolated();
  try {
    for (const target of [PLUGIN, ROOT]) {
      const { status, output } = run("claude", ["plugin", "validate", "--strict", target], box.env);
      assert.equal(status, 0, output);
      assert.match(output, /Validation passed/);
      assert.doesNotMatch(output, /warning/i);
    }
  } finally {
    box.cleanup();
  }
});

test("claude: installs from the local marketplace with 4 hooks, 1 skill, 1 MCP server", { skip: !has("claude") && "Claude Code CLI not installed" }, () => {
  const box = isolated();
  try {
    assert.equal(run("claude", ["plugin", "marketplace", "add", ROOT], box.env).status, 0);
    const install = run("claude", ["plugin", "install", "passport@passport-plugins"], box.env);
    assert.equal(install.status, 0, install.output);
    const details = run("claude", ["plugin", "details", "passport@passport-plugins"], box.env).output;
    assert.match(details, /Skills \(1\)\s+passport/);
    assert.match(details, /Hooks \(4\)\s+SessionStart, PreToolUse, PostToolUse, PostToolUseFailure/);
    assert.match(details, /MCP servers \(1\)\s+passport/);
  } finally {
    box.cleanup();
  }
});

test("codex: adds the marketplace and installs the plugin", { skip: !has("codex") && "Codex CLI not installed" }, () => {
  const box = isolated();
  try {
    assert.equal(run("codex", ["plugin", "marketplace", "add", ROOT], box.env).status, 0);
    const add = run("codex", ["plugin", "add", "passport@passport-plugins"], box.env);
    assert.equal(add.status, 0, add.output);
    assert.match(run("codex", ["plugin", "list"], box.env).output, /passport@passport-plugins\s+installed, enabled\s+0\.14\.0/);
    assert.match(run("codex", ["mcp", "list"], box.env).output, /passport\s+https:\/\/passportmcp\.com\/mcp/);
  } finally {
    box.cleanup();
  }
});

test("gemini extensions validate", { skip: !has("gemini") && "Gemini CLI not installed" }, () => {
  const box = isolated();
  try {
    const { status, output } = run("gemini", ["extensions", "validate", ROOT], box.env);
    assert.equal(status, 0, output);
    assert.match(output, /successfully validated/);
  } finally {
    box.cleanup();
  }
});
