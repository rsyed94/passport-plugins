---
name: passport
description: How to work when Passport governs this agent. Use before touching production or shared systems (deploys, databases, cloud consoles), before running vendor CLIs (gh, git push, railway, supabase, wrangler, kubectl, terraform, npm publish), when a command returns a Passport message such as "Blocked by your company's Passport policy", or when unsure whether an action is allowed.
---

# Working with Passport

Passport decides, from your company's rules, whether each consequential action may run, and records it. Commands run with this person's own sign-in: Passport never hands you a credential. Most actions are allowed; some are blocked.

## How commands are decided

- Passport's hook checks each shell command before it runs. Run CLIs as you normally would (`gh pr merge 12`, `git push`, `railway up`); there is no wrapper to use.
- A blocked command is refused before it runs, with Passport's reason. Nothing ran.
- Don't hide a command from the check (a script, `sh -c`, an alias, another CLI or a raw API call) to get around a block.

## Production goes through Passport

- Use the Passport tools (the `passport` MCP server) for work apps such as GitHub, Railway and Supabase rather than calling their APIs with keys you found.
- To debug production, start with `prod_overview`, then `prod_logs`, `prod_deploys`, `prod_metrics` or `prod_query` (read-only SQL).
- Never paste, print or write API keys, tokens or passwords into commands, files, prompts or commit messages. If something needs access you don't have, say so and ask the person, or use `passport request <app>`.
- An environment Passport can't place counts as Production.

## When Passport answers

- **Ran**: carry on.
- **Blocked** (`Blocked by your company's Passport policy: <action> on <resource> (rule: <rule>)…`): don't retry or try another route. Tell the person what you were trying to do; they can see why at the link in the message.
- **Unreachable** (`Passport couldn't be reached`): what a cached Block rule covers is refused; anything else runs and is recorded once Passport is back. Never look for a key on disk instead.
- **A vendor CLI says it isn't logged in**: ask the person to sign in to that CLI, then retry.

## When unsure

- `passport status` shows whether this computer is signed in and the hook is on.
- `passport doctor` explains a failing setup.
- Read-only checks (`--help`, `--dry-run`, listing, logs) are never blocked.

## If `passport` isn't found

- Try `~/.passport/cli/bin/passport`. The plugin installs the CLI in the background on first use, so it can take a minute to appear.
- Otherwise tell the person to run `npx passport-bridge@latest init`. Don't install it yourself without asking.

## Cloud and CI

With no hook, a script asks Passport by piping the hook's own JSON to `passport hook guard` before a command and to `passport hook` after it. With `PASSPORT_AGENT_KEY` and `PASSPORT_ENDPOINT` set, decisions are the agent's, under its owner's rules.
