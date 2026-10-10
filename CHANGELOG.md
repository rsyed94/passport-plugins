# Changelog

The plugin version always equals the `passport-bridge` version it installs.

## 0.16.6

- Installs `passport-bridge@0.16.6`: faster guard (plain reads answered without starting Node), guard health and coverage, and Ask becomes Block in Codex with a note on how to approve.
- The plugin's hooks now run the `passport` launcher itself, so they get the same fast path as hooks `passport init` installs.

## 0.16.4

- Installs `passport-bridge@0.16.4`: agent hooks reuse a short-lived access token between runs instead of exchanging one on every command, so activity reports reach Passport within the hook's time budget. Includes MCP SDK 1.32.1.

## 0.16.4

- Installs `passport-bridge@0.16.4`. Since 0.16.2: Codex commands like project scripts and test runners are now checked, hooks run through a stable launcher that upgrades update, sessions record the program name for commands Passport can't check, and the guard stays fast when Passport is unreachable.

## 0.16.2

- Installs `passport-bridge@0.16.2`: setup ignores keys pressed before a question appears, key moves need an explicit yes and remove only the credential (project links, profiles, and other settings stay), and commands say so when Passport can't be reached instead of exiting silently.

## 0.16.0

- Installs `passport-bridge@0.16.0`: undo for deletes Passport backed up, environment detection from each tool's project link, and Production approvers.
- The `passport` skill mentions `passport env` and `passport undo`.

## 0.15.0

- Installs `passport-bridge@0.15.0`: everyday commands in the project run without asking, keys held by Passport, and `passport exec`.
- The `passport` skill covers `passport exec` for vendor CLIs, the production toolkit tools, exit codes, and cloud agents.
- `npm run set-version` also moves the test fixtures, so the tests follow the pin.

## 0.14.0

First release.

- One plugin for Claude Code, Codex, Cursor, VS Code, and Gemini CLI, with marketplaces for Claude Code, Codex, and Cursor.
- Connects to Passport at `https://passportmcp.com/mcp`. The agent's own sign-in picks the workspace.
- Guard before each shell command and audit after it, through `passport hook guard` and `passport hook` (Claude Code, Codex, Cursor). Silent until the CLI is installed.
- Installs `passport-bridge@0.14.0` into `~/.passport/cli/0.14.0/` in the background on the first session, once, when Node.js 20 or newer is available.
- A `passport` skill: what to do when Passport asks, waits for approval, or blocks.
- `passport-plugin.zip` on each GitHub release for claude.ai's Upload a plugin.
