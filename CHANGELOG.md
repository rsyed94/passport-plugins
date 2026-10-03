# Changelog

The plugin version always equals the `passport-bridge` version it installs.

## 0.14.0

First release.

- One plugin for Claude Code, Codex, Cursor, VS Code, and Gemini CLI, with marketplaces for Claude Code, Codex, and Cursor.
- Connects to Passport at `https://passportmcp.com/mcp`. The agent's own sign-in picks the workspace.
- Guard before each shell command and audit after it, through `passport hook guard` and `passport hook` (Claude Code, Codex, Cursor). Silent until the CLI is installed.
- Installs `passport-bridge@0.14.0` into `~/.passport/cli/0.14.0/` in the background on the first session, once, when Node.js 20 or newer is available.
- A `passport` skill: what to do when Passport asks, waits for approval, or blocks.
- `passport-plugin.zip` on each GitHub release for claude.ai's Upload a plugin.
