const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const extension = path.resolve(__dirname, "..");
const flags = ["--preserve-symlinks-main", "--preserve-symlinks"];
const cases = [
  "auction.xlsx",
  "export.CSV",
  "export.tsv",
  "book.xlsm",
  "book.xlsb",
  "book.ODS",
  "book.numbers",
  "sheet.gsheet",
  "auction.xlsx.backup"
];

const withFixture = (check) => {
  const tempRoot = path.resolve(os.tmpdir());
  const folder = fs.mkdtempSync(path.join(tempRoot, "luna-worksheet-guard-"));
  try {
    for (const name of [
      "scripts/security-check.mjs",
      "manifest.json",
      "src/shared/config.js",
      "src/background/background.js",
      "src/features/auctions/auction-republish-api.js",
      "src/features/auctions/auction-republish-core.js",
      "src/features/images/image-scraper-fill.js"
    ]) {
      const target = path.join(folder, "luna", name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(extension, name), target);
    }
    const run = () =>
      spawnSync(
        process.execPath,
        [...flags, path.join(folder, "luna/scripts/security-check.mjs")],
        { encoding: "utf8" }
      );
    assert.equal(run().status, 0, "The isolated public-source fixture starts clean.");
    check(folder, run);
  } finally {
    const resolved = path.resolve(folder);
    if (
      !resolved.startsWith(tempRoot + path.sep) ||
      !path.basename(resolved).startsWith("luna-worksheet-guard-")
    )
      throw new Error("Refusing to remove a folder outside this test's temporary directory.");
    fs.rmSync(resolved, { recursive: true, force: true });
  }
};

test("publication rejects worksheet files and backups even if they were force-added", () => {
  withFixture((folder, run) => {
    for (const name of cases) {
      const file = path.join(folder, name);
      fs.writeFileSync(file, "Synthetic privacy-test marker; no worksheet data.");
      const result = run();
      assert.equal(result.status, 1, name);
      assert.match(result.stderr, /worksheet or spreadsheet export must not be published/);
      fs.unlinkSync(file);
    }
  });
});

test("publication rejects ordinary, published and redirected online worksheet references", () => {
  withFixture((folder, run) => {
    const fakeId = "S".repeat(40);
    const urls = [
      `https://docs.google.com/spreadsheets/d/${fakeId}/edit`,
      `https://docs.google.com/spreadsheets/u/0/d/${fakeId}/edit`,
      `https://docs.google.com/spreadsheets/d/e/${fakeId}/pub?output=csv`,
      `https://docs.google.com/open?id=${fakeId}`,
      `https://drive.google.com/file/d/${fakeId}/view`
    ];
    for (const url of urls) {
      const file = path.join(folder, "synthetic-reference.txt");
      fs.writeFileSync(file, url);
      const result = run();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /spreadsheet link|online sheet\/file link/);
      fs.unlinkSync(file);
    }
  });
});

test("Git itself ignores worksheet formats, case variants and backup copies", () => {
  const paths = cases
    .map((name) => `local-data/${name}`)
    .concat(cases.map((name) => `fixtures/${name}`));
  const result = spawnSync("git", ["check-ignore", "--stdin"], {
    cwd: path.resolve(extension, ".."),
    input: paths.join("\n") + "\n",
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/).sort(), paths.sort());
});
