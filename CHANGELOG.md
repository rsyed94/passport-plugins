# Changelog

The plugin version always equals the `passport-bridge` version it installs.

## 0.28.0

- Installs `passport-bridge@0.28.0`. The guard follows two new Passport controls:
  - An irreversible command (for example `rm -rf ~/` or a force push to the default branch) goes to Passport for approval, where a passkey or emailed code confirms it, instead of the agent's own prompt. If Passport can't be reached, it is blocked.
  - When someone ends a session in Passport, the guard refuses that session's commands with the reason. It checks at most every 15 seconds and never waits longer than 300 ms.

## 0.27.0

- Installs `passport-bridge@0.27.0`. The Rules page's "Not checked" list shrinks and says why:
  - Assignment prefixes and `export` are neutral unless they change what runs or look like a secret, `sed` scripts are read, `awk` and `perl -pi -e` are classified, and git recognizes sibling worktrees and more forms.
  - One-liners passed to python, node, perl, and ruby are scanned for side effects before they count as not checked.
  - Commands Passport can't read now report what they are (inline code, a script of yours, or an unknown program), so Rules shows your scripts apart from what Passport can't read yet.

## 0.26.0

- Installs `passport-bridge@0.26.0`. Late approvals reach the agent:
  - Approve a request after the agent stopped waiting, up to a day later, and it runs the next time the agent tries that command in that session.
  - Claude Code hears about it at session start or on your next prompt: what was approved, by whom, and when.
  - New hooks: `UserPromptSubmit`, plus an audit hook at `SessionStart`. A prompt checks a local marker first, so it adds about 5 ms when nothing is waiting.

## 0.25.0

- Installs `passport-bridge@0.25.0`. Updates are one click, and deletes come with a backup:
  - `passport update` moves the CLI to the version Passport names, so **Update** on Agents works.
  - Hands-off file deletes go to a local trash and `git reset`/`git clean` take a git snapshot first; `passport undo --local` restores them. Deletes Passport can't back up ask first.
  - `passport request` asks your admin for access, `passport changes` lists production changes with repeats folded, and `passport sessions --project` filters to one project.
  - `passport run` output stays byte-exact when piped.

## 0.24.0

- Installs `passport-bridge@0.24.0`. Sessions read like work, and keys stay in Passport:
  - Sessions group into work items (branch or PR) with a Production changes ledger; `passport sessions` matches.
  - Optional step descriptions and per-session token totals, redacted on the computer before anything is sent.
  - CLI keys stay in Passport: logins are intercepted and moved back with consent.
  - Each risky action reports its safety outcome, and scans also check Composer's `auth.json` for tokens.

## 0.22.0

- Installs `passport-bridge@0.22.0`:
  - Commands Passport doesn't recognize show their real subcommand (or "command not recognized") instead of a made-up "invoke".
  - The speed line says how long Passport adds per action.
  - Agents' last-used time includes guard activity, so a busy agent is never flagged as idle.

## 0.21.0

- Installs `passport-bridge@0.21.0`. Sessions are organized by project:
  - The guard reports each session's project (the repo name, so worktrees join their repo) and branch, read locally from git.
  - Sessions groups running sessions by project, and Home shows one row per project.
  - `passport sessions` groups running sessions the same way.

## 0.20.0

- Installs `passport-bridge@0.20.0`. One policy decision on every surface:
  - The guard, `passport exec`, the gateway, and Rules › Test all decide the same way, in one order: app access first, then exceptions, team rules, and your preset.
  - Rules › Test shows when app access decided, with a **See access** link to the app's Access tab.
  - Force pushes (`git push --force`, `-f`, `--delete`, `--mirror`) are reported as Irreversible, and Activity names the exact form.
  - `passport exec` with an agent token is held to both the agent's access and its owner's access.

## 0.19.0

- Installs `passport-bridge@0.19.0`. Approvals continue from your phone:
  - When a rule asks and nobody is at the keyboard, the guard waits briefly for a decision; approve it in Passport and the agent's command runs with no retry.
  - `passport wait` waits until someone decides or the request expires, and says who approved it, the person's note on a decline, or when it expired.
  - A retry that only differs in quoting or a trailing pipe matches the same request.
  - Older guards get a one-line notice to run `passport hook install --apply`.

## 0.18.0

- Installs `passport-bridge@0.18.0`. Since 0.16.14:
  - Agents sign in with agent tokens (the new name for agent keys), shown that way across the CLI.
  - One risk vocabulary: every action is Read, Change, Delete, or Irreversible, and the CLI says what it does in plain words, like "deletes data".
  - `passport init --org <key> --yes` sets up a company computer; `setup --org` still works as an alias for one release.
  - `discover` is part of `scan` now, which also sends the inventory when you're signed in.
  - `init` moves MCP entries that point at `/w/<workspace>/mcp` to the single `/mcp` URL.

## 0.16.14

- Installs `passport-bridge@0.16.14`: CLI output that wraps cleanly at any width, one way to show commands to run, clearer help and errors, and fixes for `setup list`, `wait`, and `login`.

## 0.16.13

- Installs `passport-bridge@0.16.13`: when Passport can't be reached, every environment now asks by default and never loosens a team rule; app access applies to CLI commands too; blocked actions name their cause.

## 0.16.12

- Installs `passport-bridge@0.16.12`: "Did you mean" for typos, help that starts with examples, one question style, clearer wording, and background report sending that always finishes within a few seconds, one at a time.

## 0.16.10

- Installs `passport-bridge@0.16.10`: a clearer CLI that fits any terminal width, `init` that shows its plan before changing anything, a one-screen `passport status`, live approval waiting, vendor CLIs that keep working after their key moves into Passport, secrets hidden from agent output, and one sign-in flow.

## 0.16.8

- Installs `passport-bridge@0.16.8`: guard health and coverage, locked hooks for managed rollouts, script reading (shell scripts, make targets, npm scripts), project scripts, and the agent/computer/key wording used across Passport.

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
