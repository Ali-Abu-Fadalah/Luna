import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flags = ["--preserve-symlinks-main", "--preserve-symlinks"];
const files = (folder, suffix) =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(folder, entry.name), suffix)
      : entry.name.endsWith(suffix)
        ? [join(folder, entry.name)]
        : []
  );
for (const file of files(join(root, "src"), ".js")) {
  const result = spawnSync(process.execPath, [...flags, "--check", "--input-type=commonjs"], {
    input: readFileSync(file, "utf8"),
    encoding: "utf8"
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    process.exit(1);
  }
}
const result = spawnSync(
  process.execPath,
  [
    ...flags,
    "--test",
    ...files(join(root, "tests"), ".test.js").map((file) => relative(root, file))
  ],
  { cwd: root, stdio: "inherit" }
);
process.exit(result.status ?? 1);
