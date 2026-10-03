// The claude.ai "Upload a plugin" zip: what `npm run pack:zip` builds and the
// release workflow attaches as passport-plugin.zip.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";
import { buildZip, pluginFiles, PLUGIN_DIR } from "../tools/pack-zip.mjs";
import { PIN, ROOT } from "./helpers.mjs";

/** Entries from the central directory: name, Unix mode, and contents. */
function readZip(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, "end of central directory");
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(zip.readUInt32LE(cursor), 0x02014b50);
    const method = zip.readUInt16LE(cursor + 10);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const mode = zip.readUInt32LE(cursor + 38) >>> 16;
    const local = zip.readUInt32LE(cursor + 42);
    const name = zip.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressed = zip.readUInt32LE(cursor + 24);
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    assert.equal(data.length, uncompressed, name);
    entries.push({ name, mode, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const zip = buildZip();
const entries = readZip(zip);
const names = entries.map((entry) => entry.name);

test("holds exactly one .claude-plugin/plugin.json, at the zip root, for this version", () => {
  assert.deepEqual(names.filter((name) => name.endsWith(".claude-plugin/plugin.json")), [".claude-plugin/plugin.json"]);
  const manifest = JSON.parse(entries.find((entry) => entry.name === ".claude-plugin/plugin.json").data);
  assert.equal(manifest.name, "passport");
  assert.equal(manifest.version, PIN);
});

test("contains the whole plugin byte for byte, and nothing else", () => {
  assert.deepEqual(names, pluginFiles().map((file) => file.name));
  for (const required of [".mcp.json", "hooks/hooks.json", "scripts/passport-hook.sh", "skills/passport/SKILL.md"]) {
    assert.ok(names.includes(required), required);
  }
  for (const entry of entries) assert.deepEqual(entry.data, readFileSync(join(PLUGIN_DIR, entry.name)), entry.name);
  assert.ok(!names.some((name) => name.startsWith("tests/") || name.startsWith("node_modules/") || name.includes(".DS_Store")));
});

test("meets claude.ai upload rules: no top-level bin/, under 5,000 files and 200 MB", () => {
  assert.ok(!names.some((name) => name === "bin" || name.startsWith("bin/")));
  assert.ok(entries.length < 5000);
  assert.ok(zip.length < 200 * 1024 * 1024);
});

test("keeps the hook script executable", () => {
  assert.equal(entries.find((entry) => entry.name === "scripts/passport-hook.sh").mode & 0o777, 0o755);
  assert.equal(entries.find((entry) => entry.name === "hooks/hooks.json").mode & 0o777, 0o644);
});

test("is reproducible", () => {
  assert.deepEqual(buildZip(), zip);
});

test("npm run pack:zip writes the same zip to dist/passport-plugin.zip", () => {
  const result = spawnSync("npm", ["run", "--silent", "pack:zip"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(join(ROOT, "dist", "passport-plugin.zip")), zip);
});

const has = (bin) => spawnSync("sh", ["-c", `command -v ${bin}`]).status === 0;

test("unzip extracts it and claude plugin validate accepts the result", { skip: !(has("unzip") && has("claude")) && "unzip or Claude Code CLI not installed" }, () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "passport-plugin-zip-")));
  try {
    const file = join(dir, "passport-plugin.zip");
    const out = join(dir, "plugin");
    const home = join(dir, "home");
    mkdirSync(home);
    writeFileSync(file, zip);
    assert.equal(spawnSync("unzip", ["-q", file, "-d", out]).status, 0);
    const result = spawnSync("claude", ["plugin", "validate", "--strict", out], {
      env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude"), DISABLE_AUTOUPDATER: "1" },
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /Validation passed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the release workflow publishes this zip on v* tags as the latest release", () => {
  const workflow = readFileSync(join(ROOT, ".github", "workflows", "release.yml"), "utf8");
  assert.match(workflow, /tags: \["v\*"\]/);
  assert.match(workflow, /npm run pack:zip/);
  assert.match(workflow, /gh release create "\$GITHUB_REF_NAME" dist\/passport-plugin\.zip/);
  assert.match(workflow, /--latest/);
  assert.match(workflow, /contents: write/);
});
