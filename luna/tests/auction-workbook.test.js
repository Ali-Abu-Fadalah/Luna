const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const XLSX = require("../vendor/xlsx-0.20.3.full.min.js");
const fflate = require("../vendor/fflate-0.8.3.min.js");
const source = fs.readFileSync(
  path.join(__dirname, "../src/features/auctions/auction-workbook.js"),
  "utf8"
);
const bundle = fs.readFileSync(path.join(__dirname, "../vendor/xlsx-0.20.3.full.min.js"), "utf8");
const zipBundle = fs.readFileSync(path.join(__dirname, "../vendor/fflate-0.8.3.min.js"), "utf8");
const localUrl = (resource) => `chrome-extension://luna-test/${resource}`;

const fixture = ({ date1904 = false, manyRows = false, wide = false } = {}) => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    [
      "Model + Title",
      "Brand",
      "Blank",
      "Start Price",
      "Reserve Price",
      "Start Date",
      "Descale Photoes"
    ],
    ["Example gold bar 10 g", "Example", null, 1, 5500, date1904 ? 44857 : 46319, "Open originals"]
  ]);
  sheet.F2.z = "yyyy-mm-dd";
  sheet.G2.l = { Target: "https://example-my.sharepoint.com/folder/originals" };
  sheet["!cols"] = [{}, {}, { hidden: true }, {}, {}, {}, {}];
  sheet.H1 = { t: "s", v: "Cached formula" };
  sheet.H2 = { t: "n", v: 6050, f: "E2*1.1" };
  sheet.I1 = { t: "s", v: "Formula without cache" };
  sheet.I2 = { t: "n", f: "1+1" };
  sheet.J1 = { t: "s", v: "Unsafe hyperlink" };
  sheet.J2 = { t: "s", v: "Label", l: { Target: "javascript:alert(1)" } };
  sheet["!ref"] = "A1:J2";
  if (manyRows) {
    sheet.A5001 = { t: "s", v: "Too many rows" };
    sheet["!ref"] = "A1:J5001";
  }
  if (wide) {
    sheet.IX1 = { t: "s", v: "Too many columns" };
    sheet["!ref"] = "A1:IX2";
  }
  XLSX.utils.book_append_sheet(workbook, sheet, "Auctions");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Other tab"], ["Separate"]]),
    "Other"
  );
  workbook.Workbook = { WBProps: { date1904 } };
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return {
    name: "synthetic-auctions.xlsx",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes
  };
};

const setup = ({ worker = false, lazy = false } = {}) => {
  const loads = [];
  let terminated = 0;
  const context = {
    URL,
    Uint8Array,
    setTimeout,
    clearTimeout,
    XLSX: lazy ? undefined : XLSX,
    fflate: lazy ? undefined : fflate,
    chrome: { runtime: { getURL: localUrl } },
    document: {
      createElement: () => ({}),
      head: {
        append: (script) => {
          loads.push(script.src);
          context.XLSX = XLSX;
          context.fflate = fflate;
          script.onload();
        }
      }
    }
  };
  if (worker)
    context.Worker = class {
      constructor(url) {
        assert.equal(url, localUrl("src/features/auctions/auction-workbook.js"));
        const workerContext = {
          URL,
          Uint8Array,
          location: { href: url },
          importScripts: (...libraryUrls) => {
            for (const libraryUrl of libraryUrls) {
              loads.push(libraryUrl);
              assert.ok(
                [
                  localUrl("vendor/xlsx-0.20.3.full.min.js"),
                  localUrl("vendor/fflate-0.8.3.min.js")
                ].includes(libraryUrl)
              );
              vm.runInContext(libraryUrl.includes("fflate") ? zipBundle : bundle, this.context);
            }
          },
          postMessage: (data) => this.onmessage({ data })
        };
        this.context = vm.createContext(workerContext);
        vm.runInContext(source, this.context);
      }
      postMessage(data) {
        queueMicrotask(() => this.context.onmessage({ data }));
      }
      terminate() {
        terminated++;
      }
    };
  vm.runInNewContext(source, context);
  return {
    open: context.LunaAuctionWorkbook.open,
    loads,
    get terminated() {
      return terminated;
    }
  };
};

test("local workbook import preserves columns, numbers, cached values and actual HTTPS hyperlink targets", async () => {
  const app = setup();
  const workbook = await app.open(fixture());
  assert.deepEqual(
    Array.from(workbook.sheets, (sheet) => sheet.name),
    ["Auctions", "Other"]
  );
  const rows = await workbook.readSheet("0");
  assert.equal(rows[1][0].text, "Example gold bar 10 g");
  assert.equal(
    rows[1][2].text,
    "",
    "Internal blanks and hidden columns must retain their position."
  );
  assert.equal(rows[1][3].text, "1");
  assert.equal(rows[1][4].text, "5500");
  assert.equal(rows[1][5].text, "2026-10-24");
  assert.equal(rows[1][6].url, "https://example-my.sharepoint.com/folder/originals");
  assert.equal(
    rows[1][7].text,
    "6050",
    "Use the stored cached formula result without recalculation."
  );
  assert.equal(rows[1][8].text, "", "Do not execute formulas without a cached value.");
  assert.equal(rows[1][9].url, "", "Unsafe links must never become navigable URLs.");
  assert.equal((await workbook.readSheet("Other"))[1][0].text, "Separate");
  assert.throws(() => workbook.readSheet("Missing"), /available worksheet/);
  assert.equal(app.loads.length, 0);
  workbook.close();
  assert.throws(() => workbook.readSheet("0"), /Reopen/);
});

test("1904 and 1900 workbook date epochs yield the same calendar dates", async () => {
  const app = setup();
  const workbook = await app.open(fixture({ date1904: true }));
  assert.equal((await workbook.readSheet("Auctions"))[1][5].text, "2026-10-24");
});

test("worksheet matrix indices preserve physical row numbers even before the first used cell", async () => {
  const app = setup();
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    { A5: { t: "s", v: "Model + Title" }, A6: { t: "s", v: "Example" }, "!ref": "A5:A6" },
    "Rows"
  );
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
  const reader = await app.open({
    name: "rows.xlsx",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes
  });
  const rows = await reader.readSheet("0");
  assert.equal(rows.length, 6);
  assert.equal(rows[0][0].text, "");
  assert.equal(rows[4][0].text, "Model + Title");
  assert.equal(rows[5][0].text, "Example");
});

test("the spreadsheet library loads lazily from the extension package only", async () => {
  const app = setup({ lazy: true });
  assert.equal(app.loads.length, 0);
  const workbook = await app.open(fixture());
  assert.equal(workbook.sheets.length, 2);
  assert.deepEqual(app.loads, [
    localUrl("vendor/fflate-0.8.3.min.js"),
    localUrl("vendor/xlsx-0.20.3.full.min.js")
  ]);
});

test("worker import reads only the chosen sheet and closes the worker", async () => {
  const app = setup({ worker: true });
  assert.equal(app.loads.length, 0);
  const workbook = await app.open(fixture());
  assert.equal(workbook.sheets.length, 2);
  assert.equal((await workbook.readSheet("Other"))[1][0].text, "Separate");
  assert.equal((await workbook.readSheet("0"))[1][4].text, "5500");
  assert.deepEqual(app.loads, [
    localUrl("vendor/fflate-0.8.3.min.js"),
    localUrl("vendor/xlsx-0.20.3.full.min.js")
  ]);
  workbook.close();
  assert.equal(app.terminated, 1);
  await assert.rejects(() => workbook.readSheet("0"), /Reopen/);
});

test("file and worksheet bounds reject oversized imports without silently truncating rows", async () => {
  const app = setup();
  await assert.rejects(
    () =>
      app.open({
        name: "source.xlsx",
        size: 101 * 1024 * 1024,
        arrayBuffer: async () => {
          throw new Error("must not read oversized bytes");
        }
      }),
    /100 MB/
  );
  await assert.rejects(
    () => app.open({ name: "source.xlsm", size: 8, arrayBuffer: async () => new ArrayBuffer(8) }),
    /xlsx/
  );
  await assert.rejects(
    () => app.open({ name: "source.xlsx", size: 8, arrayBuffer: async () => new ArrayBuffer(8) }),
    /Excel .xlsx/
  );
  const large = await app.open(fixture({ manyRows: true }));
  assert.throws(() => large.readSheet("0"), /exceeds 5,000 rows/);
  const wide = await app.open(fixture({ wide: true }));
  assert.throws(() => wide.readSheet("0"), /too large/);
});
