const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "src/features/jenkins/jenkins-core.js"),
  "utf8"
);
const context = { Error, Object, Set, String, URL };
context.globalThis = context;
vm.runInNewContext(source, context);

const { parseBatch, TYPE_CONFIG } = context.LunaJenkinsCore;
assert.equal(TYPE_CONFIG.dubicars.columnCount, 6);
assert.equal(TYPE_CONFIG.dubizzle.columnCount, 8);
assert.equal(TYPE_CONFIG.noon.columnCount, 5);

const dubicarsText = [
  [
    "https://www.dubicars.com/2024-bmw-840-111",
    "USED",
    "BMW 840Ci",
    "M SPORT",
    "Black",
    "VERY_GOOD"
  ].join("\t"),
  [
    "https://uae.dubicars.com/2023-toyota-camry-222",
    "EXPORT",
    "Toyota Camry",
    "Other",
    "White Pearl",
    "EXCELLENT"
  ].join("\t")
].join("\r\n");
const dubicars = parseBatch(`\n${dubicarsText}\r\n`, "dubicars");
assert.equal(dubicars.type, "dubicars");
assert.equal(dubicars.displayName, "DubiCars");
assert.equal(dubicars.rowCount, 2);
assert.equal(dubicars.columns.length, 6);
assert.equal(
  dubicars.fields.SCRAPED_URLS,
  [
    "https://www.dubicars.com/2024-bmw-840-111",
    "https://uae.dubicars.com/2023-toyota-camry-222"
  ].join("\n")
);
assert.equal(dubicars.fields.CATEGORIES, "USED\nEXPORT");
assert.equal(dubicars.fields.MAKES_MODELS, "BMW 840Ci\nToyota Camry");
assert.equal(dubicars.fields.TRIMS, "M SPORT\nOther");
assert.equal(dubicars.fields.COLORS, "Black\nWhite Pearl");
assert.equal(dubicars.fields.CONDITIONS, "VERY_GOOD\nEXCELLENT");
assert.equal(Object.hasOwn(dubicars.fields, "SPECS"), false);

const dubizzleText = [
  [
    "https://dubai.dubizzle.com/motors/used-cars/bmw/840/2024/1/1/one-2-123",
    "USED",
    "BMW 840Ci",
    "M SPORT",
    "Blueberry",
    "VERY_GOOD",
    "GCC",
    "AUTOMATIC"
  ].join("\t"),
  [
    "https://abudhabi.dubizzle.com/motors/used-cars/audi/a8/2023/2/2/two-3-456",
    "NEW",
    "Audi A8",
    "other",
    "Other",
    "EXCELLENT",
    "American",
    "MANUAL"
  ].join("\t")
].join("\n");
const dubizzle = parseBatch(dubizzleText, "dubizzle");
assert.equal(dubizzle.rowCount, 2);
assert.equal(dubizzle.columns.length, 8);
assert.equal(dubizzle.fields.TRIMS, "M SPORT\nother");
assert.equal(dubizzle.fields.COLORS, "Blueberry\nOther");
assert.equal(dubizzle.fields.SPECS, "GCC\nAmerican");
assert.equal(dubizzle.fields.TRANSMISSION_TYPES, "AUTOMATIC\nMANUAL");
assert.deepEqual(
  JSON.parse(JSON.stringify(dubizzle.columns.map((column) => column.lineCount))),
  [2, 2, 2, 2, 2, 2, 2, 2]
);

const noonText = [
  [
    "https://www.noon.com/uae-en/the-hume-band-2-0/N70395452V/p/?o=one",
    "ELECTRONICS",
    "ACCESSORIES",
    "WEARABLE_TECHNOLOGY",
    "NEW_WITH_TAGS"
  ].join("\t"),
  [
    "https://www.noon.com/uae-en/mattifying-fixing-spray/Z218F9E4D2672F39E0012Z/p/?o=two",
    "LIFESTYLE",
    "BEAUTY_HEALTH",
    "MAKEUP",
    "NEW_WITH_TAGS"
  ].join("\t")
].join("\n");
const noon = parseBatch(noonText, "noon");
assert.equal(noon.type, "noon");
assert.equal(noon.displayName, "Noon");
assert.equal(noon.rowCount, 2);
assert.equal(noon.columns.length, 5);
assert.equal(noon.fields.CATEGORIES, "ELECTRONICS\nLIFESTYLE");
assert.equal(noon.fields.SUB_CATEGORIES, "ACCESSORIES\nBEAUTY_HEALTH");
assert.equal(noon.fields.SUB_SUB_CATEGORIES, "WEARABLE_TECHNOLOGY\nMAKEUP");
assert.equal(noon.fields.CONDITIONS, "NEW_WITH_TAGS\nNEW_WITH_TAGS");
assert.deepEqual(JSON.parse(JSON.stringify(noon.columns.map((column) => column.key))), [
  "SCRAPED_URLS",
  "CATEGORIES",
  "SUB_CATEGORIES",
  "SUB_SUB_CATEGORIES",
  "CONDITIONS"
]);

assert.throws(() => parseBatch("", "dubicars"), /Paste complete DubiCars rows/);
assert.throws(
  () => parseBatch(dubicarsText, "unknown"),
  /Choose DubiCars P:U, Dubizzle P:W, or Noon 5 fields/
);
assert.throws(
  () => parseBatch(dubicarsText.split("\n")[0], "dubizzle"),
  /Row 1 has 6 columns; Dubizzle requires exactly 8.*same number of complete lines/
);
assert.throws(
  () => parseBatch("https://www.dubicars.com/one\tUSED\tBMW 840Ci\t\tBlack\tVERY_GOOD", "dubicars"),
  /Row 1 is incomplete: S Trims is blank.*same number of complete lines/
);
assert.throws(
  () =>
    parseBatch("https://example.com/one\tUSED\tBMW 840Ci\tM SPORT\tBlack\tVERY_GOOD", "dubicars"),
  /not a DubiCars advertisement URL/
);
assert.throws(
  () => parseBatch(`${dubicarsText.split("\n")[0]}\n\t\t\t\t\t`, "dubicars"),
  /Row 2 is incomplete.*P URLs.*same number of complete lines/
);
assert.throws(() => parseBatch(dubizzleText, "dubicars"), /requires exactly 6/);
assert.throws(
  () =>
    parseBatch(
      "https://www.noon.com/uae-en/product/N1/p/\tELECTRONICS\tACCESSORIES\tWEARABLE_TECHNOLOGY\tNEW_WITHOUT_TAGS",
      "noon"
    ),
  /CONDITIONS must be exactly NEW_WITH_TAGS; received NEW_WITHOUT_TAGS/
);
assert.throws(
  () =>
    parseBatch(
      "https://example.com/product/N1/p/\tELECTRONICS\tACCESSORIES\tWEARABLE_TECHNOLOGY\tNEW_WITH_TAGS",
      "noon"
    ),
  /not a Noon advertisement URL/
);

console.log("Jenkins core tests passed.");
