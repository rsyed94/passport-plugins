---
name: passport
description: How to work when Passport governs this agent. Use before touching production or shared systems (deploys, databases, cloud consoles, payment or email apps), before running vendor CLIs (railway, gh, vercel, wrangler, supabase, stripe, aws, neonctl, flyctl), when one of those CLIs says it isn't logged in, when a command or tool returns a Passport message such as "Waiting for approval" or "Blocked by Passport", or when unsure whether an action is allowed.
---

# Working with Passport

Passport holds the credentials for this person's work apps and decides, from their rules, what you may do. Most actions run without a prompt. Some ask a person first, and some are blocked.

## Production goes through Passport

- Use the Passport tools (the `passport` MCP server) for work apps such as Railway, Vercel, Supabase, GitHub, and Stripe, rather than pasting credentials or calling their APIs with keys you found.
- To debug production, start with `prod_overview`, then `prod_logs`, `prod_errors`, `prod_deploys`, `prod_metrics`, or `prod_query` (read-only SQL). They work the same across Railway, Vercel, Supabase, Neon, and Sentry.
- Never paste, print, or write API keys, tokens, or passwords into commands, files, prompts, or commit messages. If something needs a key you don't have, say so and ask the person to connect the app in Passport.
- An environment Passport can't place counts as Production.

## Vendor CLIs: use `passport exec`

Passport can hold the keys for some CLIs. A key moved into Passport is no longer on this computer, so the CLI on its own says "not logged in". Run those CLIs through Passport:

    passport exec -- railway up -e staging
    passport exec -- gh pr create --fill

- Everything after `--` is the CLI's own command, unchanged. The output and exit code are the CLI's.
- In Claude Code, Passport rewrites these commands for you, so you may see `passport exec` in the command that ran. Leave it.
- Don't wrap it or work around it: `sh -c`, `env`, `printenv`, `railway run`, `gh auth token`, `aws configure`, and paths like `./railway` are refused. Never print, copy, or save a key.

## When Passport answers

- **Ran**: carry on.
- **Asked** (an approval prompt in this session): wait for the person's answer. Don't retry with a different command to get around it.
- **Waiting for approval** (exit 4, for example `Waiting for approval from Maya. Run passport wait <id>`): run `passport wait <id>` (up to 100 seconds; exit 0 means approved), then run the same command again with the same arguments. Or keep going on work that doesn't depend on it and come back later. Don't retry in a loop.
- **Declined** (exit 5, `Declined by <name>: <note>`): stop that action. Read the person's note and follow it.
- **Blocked** (exit 5, for example `Blocked by Passport: Team rule, no deletes in Production.`): don't try another route (a script, alias, other CLI, or raw API call). Tell the person what was blocked and why, and suggest they run it themselves or request an exception in Passport.
- **No key** (exit 3, `No <app> key in Passport…` or `Your <app> key in Passport stopped working.`): tell the person. They fix it in Passport → Apps, or with `passport keys move` on their computer.
- **Unreachable** (exit 1, `Passport couldn't be reached`): nothing ran. Try again later. Never look for a key on disk instead.
- **Expired**: the approval timed out. Ask again only if the work still needs it.

## When unsure

- Run `passport rules test "<command>"` to see what Passport would decide and why, before running anything that changes or deletes production data.
- `passport status` shows the current rules and whether this computer is signed in.
- Read-only checks (`--help`, `--dry-run`, listing, logs) never ask.

## If `passport` isn't found

- Try `~/.passport/cli/bin/passport`. The plugin installs the CLI in the background on first use, so it can take a minute to appear.
- Otherwise tell the person to run `npx passport-bridge@latest init`. Don't install it yourself without asking.

## Cloud and CI

With `PASSPORT_AGENT_KEY` and `PASSPORT_ENDPOINT` set, the same commands work. Approvals go to the person who owns the agent.

Codex note: Codex can't show Passport's approval prompt, so Passport records and blocks there, and Codex's own approvals apply to the rest.
