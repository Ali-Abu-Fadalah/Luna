const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const context = { Array, Object, String, URL };
context.globalThis = context;
vm.runInNewContext(read("src/features/work-queue/vehicle-detail-core.js"), context);
vm.runInNewContext(read("src/features/manual-ad/manual-ad-core.js"), context);

const options = [
  { label: "ROADSTER", trimCode: 20 },
  { label: "ROADSTER (NON GCC)", trimCode: 21 }
];
const queue = context.LunaVehicleDetailCore;
assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      queue.preferGccCompatibleTrims(options, { facts: { specs: { value: "GCC Specs" } } })
    )
  ),
  [options[0]]
);
assert.equal(
  queue.preferGccCompatibleTrims([options[1]], { facts: { specs: { value: "GCC" } } })[0].trimCode,
  21
);

const manual = context.LunaManualAdCore;
assert.deepEqual(
  JSON.parse(JSON.stringify(manual.preferGccCompatibleTrims(options, "GCC Specs"))),
  [options[0]]
);
assert.equal(manual.preferGccCompatibleTrims([options[1]], "GCC")[0].trimCode, 21);
assert.equal(manual.preferGccCompatibleTrims(options, "American Specs").length, 2);

console.log("GCC trim preference tests passed.");
