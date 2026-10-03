// Sandboxes for running the hook scripts. Every run gets its own HOME,
// PASSPORT_HOME, agent config folders, and a PATH holding only the tools the
// test puts there, so nothing ever reads or writes the real home folder.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PLUGIN = join(ROOT, "plugins", "passport");
export const HOOK_SH = join(PLUGIN, "scripts", "passport-hook.sh");
export const FIXTURES = join(ROOT, "tests", "fixtures");
export const PIN = "0.14.0";

/** POSIX shells to run the script under: always sh, plus dash/bash when present. */
export const SHELLS = ["sh", "dash", "bash"].filter((shell) => spawnSync("sh", ["-c", `command -v ${shell}`]).status === 0);

const SYSTEM_PATH = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];

export function sandbox({ node = true, npm = false } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "passport-plugin-test-")));
  const home = join(dir, "home");
  const bin = join(dir, "bin");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  if (node) symlinkSync(process.execPath, join(bin, "node"));
  if (npm) {
    cpSync(join(FIXTURES, "fake-npm.sh"), join(bin, "npm"));
  }
  const env = {
    HOME: home,
    USERPROFILE: home,
    PASSPORT_HOME: join(home, ".passport"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    CODEX_HOME: join(home, ".codex"),
    PASSPORT_CURSOR_HOME: join(home, ".cursor"),
    PATH: [bin, ...SYSTEM_PATH].join(":"),
    // Don't probe Homebrew, nvm, or Volta on the machine running the tests.
    PASSPORT_PLUGIN_NODE_SEARCH: "",
    FAKE_CLI_RECORD: join(dir, "cli-calls.jsonl"),
    FAKE_NPM_LOG: join(dir, "npm-calls.log"),
    FAKE_NPM_PACKAGE: join(FIXTURES, "fake-cli"),
    TMPDIR: dir,
    LANG: "C"
  };
  return {
    dir,
    home,
    bin,
    env,
    passportHome: env.PASSPORT_HOME,
    cliRoot: join(env.PASSPORT_HOME, "cli"),
    logFile: join(env.PASSPORT_HOME, "logs", "plugin-install.log"),
    calls() {
      return existsSync(env.FAKE_CLI_RECORD)
        ? readFileSync(env.FAKE_CLI_RECORD, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
        : [];
    },
    npmCalls() {
      return existsSync(env.FAKE_NPM_LOG) ? readFileSync(env.FAKE_NPM_LOG, "utf8").trim().split("\n").filter(Boolean) : [];
    },
    cleanup() {
      // A background install may still be finishing; let it release its lock.
      const lock = join(env.PASSPORT_HOME, "cli", ".plugin-install.lock");
      const end = Date.now() + 15_000;
      while (existsSync(lock) && Date.now() < end) spawnSync("sleep", ["0.1"]);
      spawnSync("sleep", ["0.2"]);
      rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  };
}

/** Put the fake CLI where `passport init` (or the plugin) installs it. */
export function installPinned(box, version = PIN, { marker = true } = {}) {
  const target = join(box.cliRoot, version);
  cpSync(join(FIXTURES, "fake-cli", "package"), target, { recursive: true });
  if (marker) writeFileSync(join(target, ".passport-install.json"), `${JSON.stringify({ version, installedAt: Date.now() })}\n`);
  return target;
}

/** A `passport init` shim: exec '<node>' '<entry>' "$@" */
export function writeShim(box, entry, node = join(box.bin, "node")) {
  const binDir = join(box.cliRoot, "bin");
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, "passport"), `#!/bin/sh\nexec '${node}' '${entry}' "$@"\n`, { mode: 0o755 });
}

/** A `passport` executable on PATH that runs the fake CLI. */
export function pathPassport(box, folder = box.bin) {
  mkdirSync(folder, { recursive: true });
  const entry = join(FIXTURES, "fake-cli", "package", "dist", "passport.js");
  writeFileSync(join(folder, "passport"), `#!/bin/sh\nexec '${process.execPath}' '${entry}' "$@"\n`, { mode: 0o755 });
}

export function runHook(box, args, { input = "", env = {}, shell = "sh" } = {}) {
  const started = process.hrtime.bigint();
  const result = spawnSync(shell, [HOOK_SH, ...args], {
    input,
    env: { ...box.env, ...env },
    cwd: box.home,
    encoding: "utf8",
    timeout: 20_000
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, ms };
}

export function runHookAsync(box, args, { input = "", env = {}, shell = "sh" } = {}) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const child = spawn(shell, [HOOK_SH, ...args], { env: { ...box.env, ...env }, cwd: box.home });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolve({ status, stdout, stderr, ms: Number(process.hrtime.bigint() - started) / 1e6 }));
    child.stdin.end(input);
  });
}

export async function waitFor(check, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return check();
}

export const CLAUDE_PRE = JSON.stringify({
  session_id: "s-1",
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_use_id: "toolu_1",
  tool_input: { command: "railway redeploy --environment production" },
  cwd: "/work/app"
});

export const CODEX_PRE = JSON.stringify({
  session_id: "thr_1",
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_use_id: "call_1",
  turn_id: "turn_1",
  tool_input: { command: "railway volume delete data" },
  cwd: "/work/app"
});

export const CURSOR_BEFORE = JSON.stringify({
  conversation_id: "c-1",
  generation_id: "g-1",
  hook_event_name: "beforeShellExecution",
  cursor_version: "3.1.0",
  command: "vercel deploy --prod",
  cwd: "/work/app",
  workspace_roots: ["/work/app"]
});
