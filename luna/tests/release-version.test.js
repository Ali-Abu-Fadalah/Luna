const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("release metadata, package lock and visible footer use the same Luna version", () => {
  const root = path.resolve(__dirname, "..");
  const json = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
  const manifest = json("manifest.json"),
    packageFile = json("package.json"),
    lock = json("package-lock.json");
  assert.equal(packageFile.version, manifest.version);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[""].version, manifest.version);
  assert.equal(manifest.version_name, manifest.version.replace(/\.0$/, ""));
  assert.ok(
    fs
      .readFileSync(path.join(root, "sidepanel.html"), "utf8")
      .includes(`<footer>Luna ${manifest.version_name}</footer>`)
  );
});
