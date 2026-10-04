// Behaviour of plugins/passport/scripts/passport-hook.sh with fixture inputs,
// each run in a sandboxed HOME.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  CLAUDE_PRE,
  CODEX_PRE,
  CURSOR_BEFORE,
  NEWER,
  NEWER_PATCH,
  OLDER,
  PIN,
  SHELLS,
  installPinned,
  pathPassport,
  runHook,
  runHookAsync,
  sandbox,
  waitFor,
  writeShim
} from "./helpers.mjs";

const ASK = JSON.stringify({
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: "Passport: test" }
});

function withBox(options, fn) {
  return async () => {
    const box = sandbox(options);
    try {
      await fn(box);
    } finally {
      box.cleanup();
    }
  };
}

for (const shell of SHELLS) {
  describe(`passport-hook.sh under ${shell}: CLI installed`, () => {
    test(
      "guard passes stdin through to `passport hook guard` and returns its answer (Claude Code)",
      withBox({}, (box) => {
        installPinned(box);
        const result = runHook(box, ["guard", "claude-code"], { input: CLAUDE_PRE, env: { FAKE_CLI_STDOUT: ASK }, shell });
        assert.equal(result.status, 0);
        assert.equal(result.stderr, "");
        assert.equal(result.stdout, `${ASK}\n`);
        const [call] = box.calls();
        assert.deepEqual(call.argv, ["hook", "guard"]);
        assert.equal(call.stdin, CLAUDE_PRE);
        assert.equal(call.via, "plugin");
      })
    );

    test(
      "client names map to the same commands `passport hook install` registers",
      withBox({}, (box) => {
        installPinned(box);
        const cases = [
          [["guard", "codex"], CODEX_PRE, ["hook", "guard", "--client", "codex"]],
          [["audit", "codex"], CODEX_PRE, ["hook", "--client", "codex"]],
          [["guard", "cursor"], CURSOR_BEFORE, ["hook", "guard", "--client", "cursor"]],
          [["audit", "cursor"], CURSOR_BEFORE, ["hook", "--client", "cursor"]],
          [["audit", "claude-code"], CLAUDE_PRE, ["hook"]]
        ];
        for (const [args, input] of cases) {
          const result = runHook(box, args, { input, shell });
          assert.equal(result.status, 0);
          assert.equal(result.stdout, "");
        }
        assert.deepEqual(
          box.calls().map((call) => call.argv),
          cases.map(([, , argv]) => argv)
        );
        assert.deepEqual(
          box.calls().map((call) => call.stdin),
          cases.map(([, input]) => input)
        );
      })
    );

    test(
      "the `passport init` shim wins over the pinned copy",
      withBox({}, (box) => {
        installPinned(box);
        const newer = installPinned(box, NEWER);
        writeShim(box, join(newer, "dist", "passport.js"));
        runHook(box, ["guard", "claude-code"], { input: CLAUDE_PRE, shell });
        assert.match(box.calls()[0].entry, new RegExp(`/cli/${NEWER.replaceAll(".", "\\.")}/dist/passport\\.js$`));
      })
    );

    test(
      "a shim pointing at a removed copy is skipped for the pinned copy",
      withBox({}, (box) => {
        installPinned(box);
        writeShim(box, join(box.cliRoot, "0.9.0", "dist", "passport.js"));
        runHook(box, ["guard", "claude-code"], { input: CLAUDE_PRE, shell });
        assert.match(box.calls()[0].entry, new RegExp(`/cli/${PIN.replaceAll(".", "\\.")}/dist/passport\\.js$`));
      })
    );

    test(
      "a `passport` on PATH is used when nothing is installed under ~/.passport",
      withBox({}, (box) => {
        pathPassport(box);
        const result = runHook(box, ["guard", "codex"], { input: CODEX_PRE, shell });
        assert.equal(result.status, 0);
        assert.deepEqual(box.calls()[0].argv, ["hook", "guard", "--client", "codex"]);
      })
    );

    test(
      "a `passport` in npm's npx cache is never used",
      withBox({}, (box) => {
        const cache = join(box.dir, ".npm", "_npx", "abc", "node_modules", ".bin");
        pathPassport(box, cache);
        const result = runHook(box, ["guard", "claude-code"], {
          input: CLAUDE_PRE,
          env: { PATH: `${cache}:${box.env.PATH}` },
          shell
        });
        assert.equal(result.stdout, "");
        assert.equal(box.calls().length, 0);
      })
    );

    test(
      "a CLI that fails or prints something other than one JSON object reaches the agent as nothing",
      withBox({}, (box) => {
        installPinned(box);
        for (const env of [
          { FAKE_CLI_EXIT: "1", FAKE_CLI_STDOUT: ASK },
          { FAKE_CLI_STDOUT: "Passport: something went wrong" },
          { FAKE_CLI_STDOUT: "[1,2]" },
          { FAKE_CLI_STDERR: "TypeError: boom", FAKE_CLI_EXIT: "3" }
        ]) {
          const result = runHook(box, ["guard", "claude-code"], { input: CLAUDE_PRE, env, shell });
          assert.equal(result.status, 0);
          assert.equal(result.stdout, "");
          assert.equal(result.stderr, "");
        }
      })
    );

    test(
      "the script never answers on its own: an allow comes only from the CLI",
      withBox({}, (box) => {
        installPinned(box);
        const quiet = runHook(box, ["guard", "cursor"], { input: CURSOR_BEFORE, shell });
        assert.equal(quiet.stdout, "");
        const allow = JSON.stringify({ permission: "allow" });
        const decided = runHook(box, ["guard", "cursor"], { input: CURSOR_BEFORE, env: { FAKE_CLI_STDOUT: allow }, shell });
        assert.equal(decided.stdout, `${allow}\n`);
      })
    );

    test(
      "PASSPORT_HOOK_DISABLED=1 skips the CLI entirely",
      withBox({}, (box) => {
        installPinned(box);
        const result = runHook(box, ["guard", "claude-code"], { input: CLAUDE_PRE, env: { PASSPORT_HOOK_DISABLED: "1" }, shell });
        assert.equal(result.stdout, "");
        assert.equal(box.calls().length, 0);
      })
    );

    test(
      "stays quiet for a kind the agent's own settings already run, and only that kind",
      withBox({}, (box) => {
        installPinned(box);
        mkdirSync(box.env.CLAUDE_CONFIG_DIR, { recursive: true });
        writeFileSync(
          join(box.env.CLAUDE_CONFIG_DIR, "settings.json"),
          JSON.stringify(
            {
              hooks: {
                PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "passport hook guard", timeout: 5 }] }]
              }
            },
            null,
            2
          )
        );
        runHook(box, ["guard", "claude-code"], { input: CLAUDE_PRE, shell });
        assert.equal(box.calls().length, 0, "guard already registered in settings");
        runHook(box, ["audit", "claude-code"], { input: CLAUDE_PRE, shell });
        assert.equal(box.calls().length, 1, "audit is not, so the plugin's audit runs");
      })
    );

    test(
      "recognises the absolute `node <entry> hook --client codex` form `passport init` writes",
      withBox({}, (box) => {
        installPinned(box);
        mkdirSync(box.env.CODEX_HOME, { recursive: true });
        const command = `"/usr/local/bin/node" "${box.cliRoot}/0.13.2/dist/passport.js" hook --client codex`;
        writeFileSync(
          join(box.env.CODEX_HOME, "hooks.json"),
          JSON.stringify({ hooks: { PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command, timeout: 5 }] }] } })
        );
        runHook(box, ["audit", "codex"], { input: CODEX_PRE, shell });
        assert.equal(box.calls().length, 0, "audit already registered");
        runHook(box, ["guard", "codex"], { input: CODEX_PRE, shell });
        assert.equal(box.calls().length, 1, "guard is not registered");
      })
    );

    test(
      "an unknown client or mode does nothing",
      withBox({}, (box) => {
        installPinned(box);
        for (const args of [["guard", "gemini"], ["allow", "claude-code"], []]) {
          const result = runHook(box, args, { input: CLAUDE_PRE, shell });
          assert.equal(result.status, 0);
          assert.equal(result.stdout, "");
        }
        assert.equal(box.calls().length, 0);
      })
    );
  });

  describe(`passport-hook.sh under ${shell}: CLI absent`, () => {
    test(
      "guard and audit are silent no-ops for every client",
      withBox({}, (box) => {
        for (const [args, input] of [
          [["guard", "claude-code"], CLAUDE_PRE],
          [["audit", "claude-code"], CLAUDE_PRE],
          [["guard", "codex"], CODEX_PRE],
          [["audit", "codex"], CODEX_PRE],
          [["guard", "cursor"], CURSOR_BEFORE],
          [["audit", "cursor"], CURSOR_BEFORE]
        ]) {
          const result = runHook(box, args, { input, shell });
          assert.deepEqual([result.status, result.stdout, result.stderr], [0, "", ""], args.join(" "));
        }
        assert.equal(existsSync(box.passportHome), false, "a hook call creates nothing");
      })
    );

    test(
      "a pinned copy without Node.js available is a silent no-op",
      withBox({ node: false }, (box) => {
        installPinned(box);
        const result = runHook(box, ["guard", "claude-code"], { input: CLAUDE_PRE, shell });
        assert.deepEqual([result.status, result.stdout, result.stderr], [0, "", ""]);
      })
    );
  });
}

describe("session-start: ensure the CLI", () => {
  test(
    "installs the pinned CLI once, in the background, without printing or blocking",
    withBox({ npm: true }, async (box) => {
      const started = runHook(box, ["session-start", "claude-code"], {
        input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }),
        env: { FAKE_NPM_DELAY: "2" }
      });
      assert.deepEqual([started.status, started.stdout, started.stderr], [0, "", ""]);
      assert.ok(started.ms < 1500, `returned in ${started.ms} ms while npm takes 2 s`);

      const version = join(box.cliRoot, PIN);
      assert.ok(await waitFor(() => existsSync(join(version, ".passport-install.json"))), "install finished");
      const marker = JSON.parse(readFileSync(join(version, ".passport-install.json"), "utf8"));
      assert.equal(marker.version, PIN);
      assert.ok(existsSync(join(version, "dist", "passport.js")));
      assert.ok(existsSync(join(version, "node_modules", "@modelcontextprotocol", "sdk", "package.json")));
      assert.ok(await waitFor(() => !existsSync(join(box.cliRoot, ".plugin-install.lock"))), "lock released");

      // Same layout and shims as `passport init`.
      const shim = readFileSync(join(box.cliRoot, "bin", "passport"), "utf8");
      assert.equal(shim, `#!/bin/sh\nexec '${join(box.bin, "node")}' '${join(version, "dist", "passport.js")}' "$@"\n`);
      assert.equal(statSync(join(box.cliRoot, "bin", "passport")).mode & 0o777, 0o755);
      assert.equal(statSync(box.passportHome).mode & 0o777, 0o700);

      const npm = box.npmCalls();
      assert.equal(npm.filter((line) => line.startsWith("pack ")).length, 1);
      assert.match(npm[0], new RegExp(`^pack passport-bridge@${PIN.replaceAll(".", "\\.")} `));
      assert.ok(npm.some((line) => line.startsWith("ci --omit=dev --ignore-scripts")));
      assert.match(readFileSync(box.logFile, "utf8"), new RegExp(`Installed passport-bridge@${PIN.replaceAll(".", "\\.")}`));

      // Ran once: later sessions see the install and start nothing.
      const again = runHook(box, ["session-start", "codex"]);
      assert.deepEqual([again.status, again.stdout], [0, ""]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(box.npmCalls().length, npm.length);

      // And the hook now reaches the installed CLI.
      runHook(box, ["guard", "claude-code"], { input: CLAUDE_PRE });
      assert.deepEqual(box.calls()[0].argv, ["hook", "guard"]);
    })
  );

  test(
    "parallel session starts install once",
    withBox({ npm: true }, async (box) => {
      const runs = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          runHookAsync(box, ["session-start", index % 2 ? "codex" : "cursor"], { env: { FAKE_NPM_DELAY: "1" } })
        )
      );
      for (const run of runs) assert.deepEqual([run.status, run.stdout], [0, ""]);
      assert.ok(await waitFor(() => existsSync(join(box.cliRoot, PIN, ".passport-install.json"))));
      assert.ok(await waitFor(() => !existsSync(join(box.cliRoot, ".plugin-install.lock"))));
      assert.equal(box.npmCalls().filter((line) => line.startsWith("pack ")).length, 1);
    })
  );

  test(
    "does nothing when a usable CLI is already installed",
    withBox({ npm: true }, async (box) => {
      const newer = installPinned(box, NEWER);
      writeShim(box, join(newer, "dist", "passport.js"));
      const result = runHook(box, ["session-start", "cursor"]);
      assert.deepEqual([result.status, result.stdout], [0, ""]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(box.npmCalls().length, 0);
      assert.equal(existsSync(join(box.cliRoot, PIN)), false);
    })
  );

  test(
    "a global passport-bridge at the pinned version or newer counts as installed",
    withBox({ npm: true }, async (box) => {
      const prefix = join(box.dir, "global");
      const pkg = join(prefix, "lib", "node_modules", "passport-bridge");
      mkdirSync(join(pkg, "dist"), { recursive: true });
      writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "passport-bridge", version: NEWER_PATCH }, null, 2));
      writeFileSync(join(pkg, "dist", "passport.js"), "");
      mkdirSync(join(prefix, "bin"), { recursive: true });
      const { symlinkSync } = await import("node:fs");
      symlinkSync("../lib/node_modules/passport-bridge/dist/passport.js", join(prefix, "bin", "passport"));
      const { chmodSync } = await import("node:fs");
      chmodSync(join(pkg, "dist", "passport.js"), 0o755);
      const env = { PATH: `${join(prefix, "bin")}:${box.env.PATH}` };
      runHook(box, ["session-start", "claude-code"], { env });
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(box.npmCalls().length, 0);

      // An older global install doesn't count: the pinned copy is installed.
      writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "passport-bridge", version: OLDER }, null, 2));
      runHook(box, ["session-start", "claude-code"], { env });
      assert.ok(await waitFor(() => existsSync(join(box.cliRoot, PIN, ".passport-install.json"))));
    })
  );

  test(
    "without Node.js: prints nothing, leaves one hint in the log, once",
    withBox({ node: false, npm: true }, async (box) => {
      for (let index = 0; index < 3; index += 1) {
        const result = runHook(box, ["session-start", "claude-code"]);
        assert.deepEqual([result.status, result.stdout, result.stderr], [0, "", ""]);
      }
      const lines = readFileSync(box.logFile, "utf8").trim().split("\n");
      assert.equal(lines.length, 1);
      assert.match(lines[0], /Node\.js 20 or newer wasn't found/);
      assert.equal(box.npmCalls().length, 0);
    })
  );

  test(
    "a Node.js older than 20 counts as missing",
    withBox({ node: false, npm: true }, async (box) => {
      writeFileSync(join(box.bin, "node"), "#!/bin/sh\necho v18.19.0\n", { mode: 0o755 });
      const result = runHook(box, ["session-start", "codex"]);
      assert.deepEqual([result.status, result.stdout], [0, ""]);
      assert.match(readFileSync(box.logFile, "utf8"), /Node\.js 20 or newer wasn't found/);
    })
  );

  test(
    "a failed install is logged without secrets and not retried for an hour",
    withBox({ npm: true }, async (box) => {
      runHook(box, ["session-start", "claude-code"], { env: { FAKE_NPM_FAIL: "deps" } });
      assert.ok(await waitFor(() => existsSync(join(box.cliRoot, ".plugin-install-failed"))));
      assert.ok(await waitFor(() => !existsSync(join(box.cliRoot, ".plugin-install.lock"))));
      const log = readFileSync(box.logFile, "utf8");
      assert.match(log, new RegExp(`Couldn\'t install passport-bridge@${PIN.replaceAll(".", "\\.")}`));
      assert.doesNotMatch(log, /secret-value/);
      assert.equal(existsSync(join(box.cliRoot, PIN)), false, "no half-installed copy");

      const before = box.npmCalls().length;
      runHook(box, ["session-start", "claude-code"]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(box.npmCalls().length, before, "backed off");

      // An hour later it tries again.
      const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
      utimesSync(join(box.cliRoot, ".plugin-install-failed"), old, old);
      runHook(box, ["session-start", "claude-code"]);
      assert.ok(await waitFor(() => existsSync(join(box.cliRoot, PIN, ".passport-install.json"))));
      assert.ok(await waitFor(() => !existsSync(join(box.cliRoot, ".plugin-install-failed"))));
    })
  );

  test(
    "a stale lock from a crashed install doesn't block forever",
    withBox({ npm: true }, async (box) => {
      const lock = join(box.cliRoot, ".plugin-install.lock");
      mkdirSync(lock, { recursive: true });
      runHook(box, ["session-start", "claude-code"]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(box.npmCalls().length, 0, "a fresh lock means an install is running");
      const old = new Date(Date.now() - 30 * 60 * 1000);
      utimesSync(lock, old, old);
      runHook(box, ["session-start", "claude-code"]);
      assert.ok(await waitFor(() => existsSync(join(box.cliRoot, PIN, ".passport-install.json"))));
    })
  );

  test(
    "PASSPORT_PLUGIN_AUTO_INSTALL=0 turns the install off",
    withBox({ npm: true }, async (box) => {
      runHook(box, ["session-start", "claude-code"], { env: { PASSPORT_PLUGIN_AUTO_INSTALL: "0" } });
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(box.npmCalls().length, 0);
    })
  );

  test(
    "Claude Code: puts ~/.passport/cli/bin on the session PATH so the agent can run `passport wait`",
    withBox({ npm: true }, async (box) => {
      const envFile = join(box.dir, "claude-env.sh");
      writeFileSync(envFile, "");
      for (let index = 0; index < 2; index += 1) {
        runHook(box, ["session-start", "claude-code"], { env: { CLAUDE_ENV_FILE: envFile, PASSPORT_PLUGIN_AUTO_INSTALL: "0" } });
      }
      assert.equal(readFileSync(envFile, "utf8"), `export PATH="$PATH:${join(box.cliRoot, "bin")}"\n`);
    })
  );
});
