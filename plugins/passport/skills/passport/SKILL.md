---
name: passport
description: How to work when Passport governs this agent. Use before touching production or shared systems (deploys, databases, cloud consoles, payment or email apps), when a command or tool returns a Passport message such as "Waiting for approval" or "Blocked by Passport", or when unsure whether an action is allowed.
---

# Working with Passport

Passport holds the credentials for this person's work apps and decides, from their rules, what you may do. Most actions run without a prompt. Some ask a person first, and some are blocked.

## Production goes through Passport

- Use the Passport tools (the `passport` MCP server) for work apps such as Railway, Vercel, Supabase, GitHub, and Stripe, rather than pasting credentials or calling their APIs with keys you found.
- Never paste, print, or write API keys, tokens, or passwords into commands, files, prompts, or commit messages. If something needs a key you don't have, say so and ask the person to connect the app in Passport.
- An environment Passport can't place counts as Production.

## When Passport answers

- **Ran**: carry on.
- **Asked** (an approval prompt in this session): wait for the person's answer. Don't retry with a different command to get around it.
- **Waiting for approval** (for example `Waiting for approval from Maya. Run passport wait <id> to wait, or continue with other work.`): either run `passport wait <id>` to wait for the decision, or keep going on work that doesn't depend on it and come back later. Once approved, run the same command again with the same arguments.
- **Declined**: stop that action. Read the person's note and follow it.
- **Blocked** (for example `Blocked by Passport: Team rule, no deletes in Production.`): don't try another route (a script, alias, other CLI, or raw API call). Tell the person what was blocked and why, and suggest they run it themselves or request an exception in Passport.
- **Expired**: the approval timed out. Ask again only if the work still needs it.

## When unsure

- Run `passport rules test "<command>"` to see what Passport would decide and why, before running anything that changes or deletes production data.
- `passport status` shows the current rules and whether this computer is signed in.
- Read-only checks (`--help`, `--dry-run`, listing, logs) never ask.

## If `passport` isn't found

- Try `~/.passport/cli/bin/passport`. The plugin installs the CLI in the background on first use, so it can take a minute to appear.
- Otherwise tell the person to run `npx passport-bridge@latest init`. Don't install it yourself without asking.

Codex note: Codex can't show Passport's approval prompt, so Passport records and blocks there, and Codex's own approvals apply to the rest.
