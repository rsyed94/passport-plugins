// Windows test double for npm (see fake-npm.sh): `pack` writes the fake
// passport-bridge tarball, `ci`/`install` create node_modules.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
if (process.env.FAKE_NPM_LOG) appendFileSync(process.env.FAKE_NPM_LOG, `${args.join(" ")}\n`);
if (args[0] === "pack") {
  execFileSync("tar", ["-czf", "passport-bridge-0.16.0.tgz", "-C", process.env.FAKE_NPM_PACKAGE, "package"]);
} else if (args[0] === "ci" || args[0] === "install") {
  mkdirSync("node_modules/@modelcontextprotocol/sdk", { recursive: true });
  writeFileSync("node_modules/@modelcontextprotocol/sdk/package.json", '{"name":"@modelcontextprotocol/sdk"}');
}
