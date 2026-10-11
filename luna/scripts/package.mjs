import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const extension = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.dirname(extension);
const checked = spawnSync(
  process.execPath,
  [
    "--preserve-symlinks-main",
    "--preserve-symlinks",
    path.join(extension, "scripts/security-check.mjs")
  ],
  { stdio: "inherit" }
);
if (checked.status !== 0) process.exit(1);
const entries = [];
function collect(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (entry.isFile())
      entries.push({
        name: "luna/" + path.relative(extension, file).replaceAll("\\", "/"),
        data: readFileSync(file)
      });
  }
}
for (const folder of ["src", "styles", "assets", "vendor"]) collect(path.join(extension, folder));
for (const name of ["manifest.json", "sidepanel.html"])
  entries.push({ name: "luna/" + name, data: readFileSync(path.join(extension, name)) });
for (const name of ["README.md", "PRIVACY.md", "SECURITY.md", "THIRD_PARTY_NOTICES.md"])
  entries.push({ name, data: readFileSync(path.join(repo, name)) });
entries.sort((a, b) => a.name.localeCompare(b.name));
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
const parts = [],
  directory = [];
let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name),
    crc = crc32(entry.data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0x21, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(entry.data.length, 18);
  local.writeUInt32LE(entry.data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(entry.data.length, 20);
  central.writeUInt32LE(entry.data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  parts.push(local, name, entry.data);
  directory.push(central, name);
  offset += local.length + name.length + entry.data.length;
}
const central = Buffer.concat(directory),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...parts, central, end]);
const dist = path.join(repo, "dist");
mkdirSync(dist, { recursive: true });
const filename = "Luna-2.0.2-public.zip";
writeFileSync(path.join(dist, filename), zip);
writeFileSync(
  path.join(dist, filename + ".sha256"),
  createHash("sha256").update(zip).digest("hex") + "  " + filename + "\n"
);
console.log(`Packaged ${entries.length} reviewed runtime files and notices into ${filename}.`);
