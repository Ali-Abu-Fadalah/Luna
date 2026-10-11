const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { report } = require("./sheet-report.test.js");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/xlsx-export-core.js"),
  "utf8"
);
const context = {
  Blob,
  TextEncoder,
  Uint8Array,
  Uint32Array,
  Array,
  Math,
  Number,
  Object,
  String,
  Date
};
context.globalThis = context;
vm.runInNewContext(source, context);

const readStoredZip = (bytes) => {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map();
  let offset = 0;
  while (data.getUint32(offset, true) === 0x04034b50) {
    const length = data.getUint32(offset + 18, true);
    const nameLength = data.getUint16(offset + 26, true);
    const extraLength = data.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    entries.set(name, new TextDecoder().decode(bytes.subarray(start, start + length)));
    offset = start + length;
  }
  return entries;
};

(async () => {
  const blob = context.LunaXlsxExportCore.buildWorkbook(report);
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [80, 75, 3, 4]);
  const entries = readStoredZip(bytes);
  assert.equal(entries.size, 16);
  const workbook = entries.get("xl/workbook.xml");
  [
    "Dashboard",
    "Monthly leaderboard",
    "Agent months",
    "Daily work",
    "Vendors",
    "Recent tracker",
    "Interaction agents",
    "Interaction daily",
    "Work data",
    "Interaction data",
    "Audit"
  ].forEach((name) => assert.match(workbook, new RegExp(`name="${name}"`)));
  assert.match(workbook, /fullCalcOnLoad="1"/);
  assert.match(workbook, /definedName name="AgentChoices"/);
  const dashboard = entries.get("xl/worksheets/sheet1.xml");
  assert.match(dashboard, /dataValidations count="4"/);
  assert.match(dashboard, /COUNTIFS\(&apos;Work data&apos;!/);
  assert.match(dashboard, /SUMIFS\(&apos;Interaction data&apos;!/);
  assert.match(dashboard, /r="B15" s="7"><f>B12\+B14<\/f><v>3<\/v>/);
  assert.match(dashboard, /r="B23" s="7"><f>B20\+B22<\/f><v>3<\/v>/);
  assert.doesNotMatch([...entries.values()].join(""), /Tracker activity includes unlisted/);
  const ranking = entries.get("xl/worksheets/sheet2.xml");
  assert.match(ranking, /<autoFilter ref="A5:P8"\/>/);
  assert.match(ranking, /<pane xSplit="3" ySplit="5"/);
  assert.match(ranking, /Activity index/);
  assert.match(ranking, /1 unlisted \(not credited\)/);
  assert.match(entries.get("xl/worksheets/sheet9.xml"), /<autoFilter ref="A5:H10"\/>/);
  assert.match(entries.get("xl/worksheets/sheet10.xml"), /<autoFilter ref="A5:F8"\/>/);
  assert.match(entries.get("xl/worksheets/sheet11.xml"), /Monthly activity index/);
  assert.match(entries.get("xl/styles.xml"), /formatCode="yyyy-mm-dd"/);
  assert.doesNotMatch([...entries.values()].join(""), /Customer Secret|971501234567/);
  console.log("Full Sheet Statistics XLSX structure tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
