const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/services/ayshei/ayshei-core.js"),
  "utf8"
);
const context = { Date, Intl, Number, Object, Set, String };
context.globalThis = context;
vm.runInNewContext(source, context);

const core = context.LunaAysheiCore;
const models = core.extractModels({
  car: [
    { make: "BMW", makeCode: 7, model: "850Ci", modelCode: 75 },
    { make: "BMW", makeCode: 7, model: "840i", modelCode: 876 },
    { make: "BMW", makeCode: 7, model: "840Ci", modelCode: 877 },
    { make: "BMW", makeCode: 7, model: "840Ci duplicate", modelCode: 877 }
  ]
});

assert.deepEqual(JSON.parse(JSON.stringify(models)), [
  { label: "BMW 840Ci", make: "BMW", makeCode: 7, model: "840Ci", modelCode: 877 },
  { label: "BMW 840i", make: "BMW", makeCode: 7, model: "840i", modelCode: 876 },
  { label: "BMW 850Ci", make: "BMW", makeCode: 7, model: "850Ci", modelCode: 75 }
]);

const trims = core.extractTrims({
  car: [
    { trim: "STD", trimCode: 2988 },
    { trim: "oThEr", trimCode: 1000001 },
    { trim: "M SPORT", trimCode: 5767 }
  ]
});
assert.deepEqual(JSON.parse(JSON.stringify(trims)), [
  { label: "M SPORT", trimCode: 5767 },
  { label: "STD", trimCode: 2988 },
  { label: "oThEr", trimCode: 1000001 }
]);

assert.equal(
  core.extractYearCode(
    {
      car: [
        { type: "year", year: "2025", yearCode: 76 },
        { type: "year", year: "2026", yearCode: 77 }
      ]
    },
    "2026"
  ),
  77
);
assert.throws(() => core.extractYearCode({ car: [] }, "2026"), /does not list/);

assert.equal(core.validateKeyword("  BMW  "), "BMW");
assert.throws(() => core.validateKeyword("b"), /2 to 80/);
assert.throws(() => core.validateCode(-1), /invalid vehicle code/);
assert.throws(() => core.validateYearCode(0), /invalid year code/);
assert.throws(() => core.validateCatalogPayload({ car: null }), /invalid catalog/);
assert.match(core.formatUaeTime("2026-07-28T08:00:00.000Z"), /28 Jul 2026/);

console.log("Ayshei core tests passed.");
