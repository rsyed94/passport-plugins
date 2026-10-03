#!/usr/bin/env node
// Move the plugin and its CLI pin to a new passport-bridge version:
//   npm run set-version -- 0.15.0
// Then add a CHANGELOG.md entry and run npm test.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: npm run set-version -- <major.minor.patch>");
  process.exit(1);
}
const root = join(fileURLToPath(import.meta.url), "..", "..");
const json = (path, update) => {
  const file = join(root, path);
  const data = JSON.parse(readFileSync(file, "utf8"));
  update(data);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};
const text = (path, pattern, replacement) => {
  const file = join(root, path);
  const before = readFileSync(file, "utf8");
  const after = before.replace(pattern, replacement);
  if (after === before && !before.includes(version)) throw new Error(`No version found in ${path}`);
  writeFileSync(file, after);
};

const P = "plugins/passport";
json("package.json", (data) => (data.version = version));
json("package-lock.json", (data) => {
  data.version = version;
  data.packages[""].version = version;
});
json(`${P}/.claude-plugin/plugin.json`, (data) => (data.version = version));
json(`${P}/.codex-plugin/plugin.json`, (data) => (data.version = version));
json(`${P}/.cursor-plugin/plugin.json`, (data) => (data.version = version));
json(".cursor-plugin/marketplace.json", (data) => (data.metadata.version = version));
json("gemini-extension.json", (data) => (data.version = version));
text(`${P}/scripts/passport-hook.sh`, /PASSPORT_CLI_VERSION="[^"]+"/, `PASSPORT_CLI_VERSION="${version}"`);
text(`${P}/scripts/passport-hook.ps1`, /\$PassportCliVersion = '[^']+'/, `$PassportCliVersion = '${version}'`);
text("README.md", /passport-bridge@\d+\.\d+\.\d+/g, `passport-bridge@${version}`);
console.log(`Set the plugin and CLI pin to ${version}. Add a CHANGELOG.md entry, then run npm test.`);
