# Passport plugin

[Passport](https://passportmcp.com) connects coding agents to work apps. It holds the credentials, decides from your rules what an agent may do, and records what it did. This repository is a plugin marketplace with one plugin, `passport`, for Claude Code, Codex, Cursor, VS Code, and Gemini CLI.

## What it installs

| | Claude Code | Codex | Cursor | VS Code | Gemini CLI |
| --- | --- | --- | --- | --- | --- |
| Passport app connection (`https://passportmcp.com/mcp`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `passport` skill (how to work with approvals and blocks) | ✓ | ✓ | ✓ | ✓ | as context |
| Guard before shell commands, audit after | ✓ | ✓ (blocks only) | ✓ | | |
| Installs the Passport CLI in the background | ✓ | ✓ | ✓ | ✓ | |

- **Sign-in:** the first time the agent uses Passport, its own sign-in opens Passport in your browser, where you pick the workspace. No token is stored in the plugin.
- **Guard and audit:** each shell command goes to the Passport CLI's `passport hook guard` before it runs and `passport hook` after. The CLI decides; the plugin only passes the agent's input through and returns the CLI's answer. Codex can't show Passport's prompt, so there Passport records and blocks, and Codex's own approvals cover the rest.
- **CLI install:** on the first session, if no Passport CLI is installed, the plugin installs `passport-bridge@0.16.2` into `~/.passport/cli/<version>/` in the background with npm (Node.js 20 or newer), the same layout `passport init` uses. It runs once, never blocks the session, and never prints into it. Progress and problems go to `~/.passport/logs/plugin-install.log`. Until it finishes, the hooks do nothing and the app connection already works.
- To finish setup for your terminal (Autopilot presets, apps, environments), run `npx passport-bridge@latest init`.

## Install

Replace `rsyed94/passport-plugins` with this repository if you use a fork.

**Claude Code**

```sh
claude plugin marketplace add rsyed94/passport-plugins
claude plugin install passport@passport-plugins
```

Or in a session: `/plugin install passport --marketplace rsyed94/passport-plugins`.

**Codex**

```sh
codex plugin marketplace add rsyed94/passport-plugins
codex plugin add passport@passport-plugins
```

Then open Codex and trust Passport's hooks in `/hooks`. Codex runs plugin hooks only after you trust them.

**Cursor:** Teams and Enterprise admins import this repository as a team marketplace (Dashboard → Plugins & MCPs → Add Marketplace → Import from Repo). For one computer, copy `plugins/passport` to `~/.cursor/plugins/local/passport` and reload Cursor.

**VS Code:** add the marketplace to your settings, then install Passport from the Extensions view (search `@agentPlugins`).

```json
"chat.plugins.marketplaces": ["rsyed94/passport-plugins"]
```

**Gemini CLI**

```sh
gemini extensions install https://github.com/rsyed94/passport-plugins
```

## Company rollout

The Rollout page in Passport (admins) has these snippets pre-filled with your enrollment key.

- **claude.ai organization:** organization sync only reads private or internal repositories, so upload the plugin instead: download [passport-plugin.zip](https://github.com/rsyed94/passport-plugins/releases/latest/download/passport-plugin.zip), then Organization settings → Plugins & skills → Add → Upload a plugin, and set Passport to Required. For a new release, open Passport there and choose Upload new version. (An organization that mirrors this repository privately can use Sync from GitHub instead.) The plugin has no top-level `bin/`, which claude.ai requires.
- **Claude Code through MDM:** in `managed-settings.json`,

  ```json
  {
    "extraKnownMarketplaces": {
      "passport-plugins": { "source": { "source": "github", "repo": "rsyed94/passport-plugins" } }
    },
    "enabledPlugins": { "passport@passport-plugins": true }
  }
  ```

- **Cursor:** import the repository as a team marketplace and set Passport to Required.
- **Codex:** add the marketplace in managed configuration. Plugin hooks need each person to trust them, so to enforce the guard, deliver it as managed hooks in `requirements.toml` instead (the Rollout page has the snippet).
- **Any agent, by script:** `npx passport-bridge@latest setup --org pek_… --yes` sets up every agent it finds, including the hooks, without prompts.

## Uninstall

| Agent | Command |
| --- | --- |
| Claude Code | `claude plugin uninstall passport@passport-plugins` |
| Codex | `codex plugin remove passport@passport-plugins` |
| Cursor | Customize → Plugins → Passport → Uninstall, or delete `~/.cursor/plugins/local/passport` |
| VS Code | Extensions → Agent Plugins - Installed → Passport → Uninstall |
| Gemini CLI | `gemini extensions uninstall passport` |

The Passport CLI copy stays in `~/.passport/cli/` for `passport` itself. To remove it too, delete `~/.passport/cli/<version>` and `~/.passport/cli/bin`.

Settings:

- `PASSPORT_PLUGIN_AUTO_INSTALL=0`: don't install the CLI in the background.
- `PASSPORT_HOOK_DISABLED=1`: hooks do nothing in this shell (also honored by the CLI).

## How the hooks behave

| Agent | Before a shell command | After | Session start |
| --- | --- | --- | --- |
| Claude Code | `PreToolUse` (`Bash`) → `passport hook guard` | `PostToolUse` and `PostToolUseFailure` (`Bash`) → `passport hook` | `SessionStart` → install check |
| Codex | `PreToolUse` (`Bash`) → `passport hook guard --client codex` | `PostToolUse` (`Bash`) → `passport hook --client codex` | `SessionStart` (`startup\|resume`) → install check |
| Cursor | `beforeShellExecution` → `passport hook guard --client cursor` | `afterShellExecution` → `passport hook --client cursor` | `sessionStart` → install check |

These are the same events, matchers, and commands that `passport hook install` writes into the agent's own settings. If those settings already run a Passport hook of the same kind, the plugin's copy stays quiet so nothing is recorded or asked twice.

The plugin finds the CLI in this order: the `passport init` launcher in `~/.passport/cli/bin/`, `~/.passport/cli/current/`, the pinned copy in `~/.passport/cli/<version>/`, then `passport` on PATH. Copies in npm's npx cache are never used. With none found, or if the CLI fails, the hook exits 0 and prints nothing, so the agent's own permission rules apply. Only a single JSON object from the CLI is passed back to the agent.

In Claude Code, the plugin also adds `~/.passport/cli/bin` to the end of the session's PATH (through `CLAUDE_ENV_FILE`) so the agent can run `passport wait <id>`.

**Windows:** Claude Code and Cursor run the POSIX script, which needs Git for Windows (`sh`). Claude Code without Git Bash has no Bash tool, so there is nothing to guard. Codex uses `scripts/passport-hook.ps1` through its `commandWindows` field.

## Versions

The plugin version always equals the `passport-bridge` version it installs, and the pin moves with each bridge release: run `npm run set-version -- <version>`, add a CHANGELOG entry, and run `npm test`. Agents that cache plugins by version (Claude Code, Codex) pick up the new pin on update.

To release, push a tag that matches the version, such as `v0.14.0`. The Release workflow runs the tests, builds `passport-plugin.zip` (the contents of `plugins/passport`, with `.claude-plugin/plugin.json` at the zip root, as claude.ai's Upload a plugin expects), and attaches it and its SHA-256 to a GitHub release marked latest. `npm run pack:zip` builds the same zip locally into `dist/`.

## Formats

| File | Read by | Source |
| --- | --- | --- |
| `.claude-plugin/marketplace.json` | Claude Code, VS Code, claude.ai | [code.claude.com/docs/en/plugins/marketplace-reference](https://code.claude.com/docs/en/plugins/marketplace-reference) |
| `plugins/passport/.claude-plugin/plugin.json`, `.mcp.json`, `hooks/hooks.json`, `skills/` | Claude Code, VS Code | [manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference), [hooks](https://code.claude.com/docs/en/hooks), [VS Code agent plugins](https://code.visualstudio.com/docs/copilot/customization/agent-plugins) |
| `.agents/plugins/marketplace.json`, `plugins/passport/.codex-plugin/plugin.json`, `hooks/codex-hooks.json` | Codex | [developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build), [hooks](https://learn.chatgpt.com/docs/hooks) |
| `.cursor-plugin/marketplace.json`, `plugins/passport/.cursor-plugin/plugin.json`, `hooks/cursor-hooks.json` | Cursor | [cursor.com/docs/reference/plugins](https://cursor.com/docs/reference/plugins), [hooks](https://cursor.com/docs/hooks) |
| `gemini-extension.json` | Gemini CLI | [geminicli.com/docs/extensions/reference](https://geminicli.com/docs/extensions/reference) |

There is deliberately no root Agent Plugins `plugin.json`. With one present, Codex (0.146 through 0.160) loads the plugin as an Agent Plugin and skips its hooks, and VS Code already reads the Claude format.

## Development

```sh
npm ci
npm test        # manifests, hook script behavior in a sandboxed HOME, and local validators
npm run lint    # shellcheck
```

Tests never use your home folder, never install the real CLI, and never contact Passport: they run the hook against a stub `passport` and a stub `npm` in a temporary HOME and PATH. `claude plugin validate`, `codex plugin add`, and `gemini extensions validate` run too when those CLIs are installed.

## License

MIT
