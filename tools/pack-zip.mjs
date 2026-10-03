#!/usr/bin/env node
// Build dist/passport-plugin.zip for claude.ai "Upload a plugin"
// (Organization settings > Plugins & skills > Add > Upload a plugin).
//
// claude.ai accepts a zip of the plugin folder or of its contents as long as
// it holds exactly one .claude-plugin/plugin.json, with no top-level bin/, up
// to 5,000 files and 200 MB (claude.com/docs/plugins/overview, org-sync,
// platform-support). This zip holds the contents of plugins/passport at its
// root. It is reproducible: sorted entries, fixed timestamps, Unix modes kept
// so scripts/passport-hook.sh stays executable.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
export const PLUGIN_DIR = join(ROOT, "plugins", "passport");
export const ZIP_PATH = join(ROOT, "dist", "passport-plugin.zip");
const SKIP = new Set([".DS_Store", "Thumbs.db"]);
// 1980-01-01 00:00, the zip epoch: the same bytes on every machine.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function pluginFiles(dir = PLUGIN_DIR) {
  const files = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  walk(dir);
  return files
    .map((path) => ({ path, name: relative(dir, path).split(sep).join("/") }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function buildZip(dir = PLUGIN_DIR) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { path, name } of pluginFiles(dir)) {
    const data = readFileSync(path);
    const executable = (statSync(path).mode & 0o111) !== 0;
    const mode = 0o100000 | (executable ? 0o755 : 0o644);
    const compressed = deflateRawSync(data, { level: 9 });
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, so the mode below is read
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE((mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += 30 + nameBytes.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const zip = buildZip();
  mkdirSync(join(ZIP_PATH, ".."), { recursive: true });
  writeFileSync(ZIP_PATH, zip);
  console.log(`Wrote ${relative(process.cwd(), ZIP_PATH)} (${pluginFiles().length} files, ${zip.length} bytes)`);
}
