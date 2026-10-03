#!/usr/bin/env node
// Test double for the Passport CLI. Records how it was called and answers with
// whatever the test asked for. Never contacts anything.
import { appendFileSync, readFileSync } from "node:fs";

const stdin = (() => {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
})();
if (process.env.FAKE_CLI_RECORD) {
  appendFileSync(
    process.env.FAKE_CLI_RECORD,
    `${JSON.stringify({ argv: process.argv.slice(2), stdin, via: process.env.PASSPORT_HOOK_VIA ?? null, entry: import.meta.url })}\n`
  );
}
if (process.env.FAKE_CLI_STDERR) process.stderr.write(process.env.FAKE_CLI_STDERR);
if (process.env.FAKE_CLI_STDOUT) process.stdout.write(`${process.env.FAKE_CLI_STDOUT}\n`);
process.exit(Number(process.env.FAKE_CLI_EXIT ?? 0));
