const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extensionRoot = path.resolve(__dirname, "..");
const readExtensionFile = (fileName) => fs.readFileSync(path.join(extensionRoot, fileName), "utf8");
const coreSource = readExtensionFile("src/features/inventory/inventory-core.js");
const captureSource = readExtensionFile("src/features/inventory/inventory-capture.js");
const uiSource = readExtensionFile("src/features/inventory/inventory-checker.js");
const css = readExtensionFile("src/features/inventory/inventory-checker.css");
const html = readExtensionFile("sidepanel.html");
const manifest = JSON.parse(readExtensionFile("manifest.json"));
const context = {
  Date,
  Error,
  Map,
  Math,
  Number,
  Object,
  Set,
  String
};
context.globalThis = context;
vm.runInNewContext(coreSource, context);

const captureListeners = [];
const captureContext = {
  Date,
  Error,
  Set,
  String,
  URL,
  chrome: {
    runtime: {
      id: "luna-test",
      onMessage: {
        addListener(listener) {
          captureListeners.push(listener);
        }
      }
    }
  },
  document: {},
  getComputedStyle() {
    return { display: "block", visibility: "visible" };
  }
};
captureContext.globalThis = captureContext;
vm.runInNewContext(captureSource, captureContext);
vm.runInNewContext(captureSource, captureContext);
assert.equal(captureListeners.length, 1);

const {
  addCapturedPage,
  compareInventory,
  makeEmptySheetData,
  makeEmptyState,
  makePastePayload,
  normalizeName,
  parsePastedText,
  parseAdNamesText,
  sanitizeSheetData,
  sheetDataToQueueAds
} = context.LunaInventoryCore;

assert.equal(
  normalizeName("  Toyota   Camry GL 2010 GCC Specs  "),
  "toyota camry gl 2010 gcc specs"
);
assert.notEqual(normalizeName("Toyota-Camry"), normalizeName("Toyota Camry"));

let state = addCapturedPage(makeEmptyState(), {
  accountLabel: "Zone Used Cars Trading",
  key: "/v-shop/dashboard/inventory?offset=0",
  label: "Page 1",
  names: [" Toyota Camry GL 2010 GCC Specs ", "Honda Civic EX 2018", "Repeated Inventory Name"],
  source: "automatic",
  url: "https://marketplace.example.invalid/v-shop/dashboard/inventory?offset=0"
});
state = addCapturedPage(state, {
  accountLabel: "zone used cars trading",
  key: "/v-shop/dashboard/inventory?offset=10",
  label: "Page 2",
  names: [
    "repeated   inventory name",
    "Nissan Patrol Platinum 2023",
    "Toyota Camry GL 2010 GCC Spec"
  ],
  source: "automatic",
  url: "https://marketplace.example.invalid/v-shop/dashboard/inventory?offset=10"
});

assert.equal(state.pages.length, 2);
assert.equal(state.pages[0].names.length, 3);
assert.equal(state.pages[1].names.length, 3);

const recaptured = addCapturedPage(state, {
  accountLabel: "Zone Used Cars Trading",
  key: "/v-shop/dashboard/inventory?offset=0",
  label: "Page 1",
  names: ["Replacement Page Name"],
  source: "automatic"
});
assert.equal(recaptured.pages.length, 2);
assert.deepEqual(JSON.parse(JSON.stringify(recaptured.pages[0].names)), ["Replacement Page Name"]);
assert.equal(recaptured.pages[1].names.length, 3);

assert.throws(
  () =>
    addCapturedPage(state, {
      accountLabel: "Another Vendor",
      key: "/v-shop/dashboard/inventory?offset=20",
      label: "Page 3",
      names: ["Another Name"],
      source: "automatic"
    }),
  /Clear the captured inventory/
);

const tablePaste = [
  "ID\tProduct Name\tCategory\tPrice (AED)\tStatus",
  "#123456789\tPasted Toyota Camry\tUsed\t20,000\tPublished",
  "#987654321\tPasted Nissan Patrol\tUsed\t30,000\tPending approval"
].join("\n");
assert.deepEqual(JSON.parse(JSON.stringify(parsePastedText(tablePaste).names)), [
  "Pasted Toyota Camry",
  "Pasted Nissan Patrol"
]);
assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      parsePastedText("Product Name\nToyota Camry GL 2010\n#123456789\nHonda Civic 2018").names
    )
  ),
  ["Toyota Camry GL 2010", "Honda Civic 2018"]
);

const manualSheetData = parseAdNamesText("Toyota Camry GL 2010 GCC Specs\nHonda Civic EX 2018");
assert.deepEqual(JSON.parse(JSON.stringify(manualSheetData.names)), [
  "Toyota Camry GL 2010 GCC Specs",
  "Honda Civic EX 2018"
]);
assert.deepEqual(
  JSON.parse(JSON.stringify(parseAdNamesText("Advertisement\nNissan Patrol").names)),
  ["Nissan Patrol"]
);
assert.equal(sheetDataToQueueAds(manualSheetData)[1].source.adName, "Honda Civic EX 2018");
assert.deepEqual(
  JSON.parse(JSON.stringify(sanitizeSheetData({ version: 2, names: ["Unsafe"] }))),
  JSON.parse(JSON.stringify(makeEmptySheetData()))
);
assert.throws(() => parseAdNamesText("Advertisement"), /one advertisement name/);
assert.throws(
  () => parseAdNamesText("Date\tCategory\tVendor\tAdvertisement"),
  /Copy only the advertisement-name column/
);

const pastePayload = makePastePayload("Pasted Name One\nPasted Name Two", 1);
let pasteState = addCapturedPage(makeEmptyState(), pastePayload);
pasteState = addCapturedPage(pasteState, makePastePayload("Pasted Name One\nPasted Name Two", 2));
assert.equal(pasteState.pages.length, 1);
assert.equal(pasteState.pages[0].label, "Pasted page 2");

const queueAds = [
  {
    id: 1,
    source: { adName: "toyota   camry gl 2010 gcc specs" }
  },
  {
    id: 2,
    source: { adName: "Repeated Inventory Name" }
  },
  {
    id: 3,
    source: { adName: "Nissan Patrol Platinum 2024" }
  },
  {
    id: 4,
    source: { adName: "Completely Missing Vehicle" }
  }
];
const comparison = compareInventory(queueAds, state);

assert.equal(comparison.totals.matched, 2);
assert.equal(comparison.totals.missing, 2);
assert.equal(comparison.totals.repeated, 1);
assert.equal(comparison.totals.repeatedSheetOccurrences, 1);
assert.equal(comparison.totals.checked, 4);
assert.equal(comparison.totals.possible, 1);
assert.equal("extra" in comparison, false);
assert.equal(comparison.repeated[0].name, "Repeated Inventory Name");
assert.equal(comparison.repeated[0].inventoryCount, 2);
assert.equal(comparison.possible[0].queueAdNumber, 3);
assert.equal(comparison.possible[0].inventoryName, "Nissan Patrol Platinum 2023");
assert.equal(
  comparison.missing.some((entry) => entry.name === "Nissan Patrol Platinum 2024"),
  true
);

const duplicateState = addCapturedPage(makeEmptyState(), {
  accountLabel: "Car dealer account",
  key: "car dealer account|/v-shop/dashboard/inventory?offset=0&tab=all",
  label: "Inventory offset 0",
  names: ["Duplicate Sheet Vehicle", "Inventory Only"],
  source: "automatic"
});
const duplicateComparison = compareInventory(
  [
    { id: 7, source: { adName: "Duplicate Sheet Vehicle" } },
    { id: 8, source: { adName: "duplicate   sheet vehicle" } }
  ],
  duplicateState
);
assert.equal(duplicateComparison.totals.matched, 1);
assert.equal(duplicateComparison.totals.missing, 1);
assert.equal(duplicateComparison.missing[0].adNumber, 8);
assert.equal(duplicateComparison.totals.checked, 2);
assert.equal(duplicateComparison.repeated[0].sheetCount, 2);
assert.equal(duplicateComparison.repeated[0].inventoryCount, 1);

const excessInventory = addCapturedPage(makeEmptyState(), {
  accountLabel: "Car dealer account",
  key: "car dealer account|/v-shop/dashboard/inventory?offset=20&tab=all",
  label: "Inventory offset 20",
  names: ["Duplicate Inventory Vehicle", "duplicate inventory vehicle"]
});
const excessComparison = compareInventory(
  [{ id: 9, source: { adName: "Duplicate Inventory Vehicle" } }],
  excessInventory
);
assert.equal(excessComparison.totals.matched, 1);
assert.equal(excessComparison.totals.missing, 0);
assert.equal(excessComparison.repeated[0].sheetCount, 1);
assert.equal(excessComparison.repeated[0].inventoryCount, 2);

const hundredNameState = addCapturedPage(makeEmptyState(), {
  accountLabel: "Large inventory account",
  key: "large-inventory|offset=0",
  label: "All 100 inventory ads",
  names: [
    ...Array.from({ length: 98 }, (_value, index) => `Inventory Ad ${index + 1}`),
    "Shared Duplicate",
    "shared   duplicate"
  ]
});
const twentyFivePastedNames = [
  ...Array.from({ length: 20 }, (_value, index) => ({
    id: index + 1,
    source: { adName: `Inventory Ad ${index + 1}` }
  })),
  ...Array.from({ length: 3 }, (_value, index) => ({
    id: index + 21,
    source: { adName: "Shared Duplicate" }
  })),
  { id: 24, source: { adName: "Completely Unrelated Alpha" } },
  { id: 25, source: { adName: "Completely Unrelated Beta" } }
];
const coverageComparison = compareInventory(twentyFivePastedNames, hundredNameState);
assert.equal(coverageComparison.totals.checked, 25);
assert.equal(coverageComparison.totals.matched, 22);
assert.equal(coverageComparison.totals.missing, 3);
assert.equal(
  coverageComparison.totals.matched + coverageComparison.totals.missing,
  coverageComparison.totals.checked
);
assert.equal(coverageComparison.repeated[0].sheetCount, 3);
assert.equal(coverageComparison.repeated[0].inventoryCount, 2);
assert.equal(coverageComparison.repeated[0].matchedCount, 2);
assert.equal(coverageComparison.repeated[0].missingCount, 1);
assert.equal("extra" in coverageComparison, false);
assert.equal(
  coverageComparison.missing.some((entry) => entry.name === "Inventory Ad 21"),
  false
);

[
  "inventory-capture-page",
  "inventory-clear",
  "inventory-compare",
  "inventory-copy-missing",
  "inventory-copy-repeated",
  "inventory-list-matched",
  "inventory-list-missing",
  "inventory-list-repeated",
  "inventory-list-possible",
  "inventory-paste-text",
  "inventory-add-paste",
  "inventory-sheet-text",
  "inventory-use-sheet-data",
  "inventory-clear-sheet-data",
  "inventory-comparison-source"
].forEach((id) => assert.ok(html.includes(`id="${id}"`), `Missing inventory control ${id}`));
assert.ok(html.includes('id="inventory-view-select"'));
assert.ok(html.includes('data-luna-select-tabs="inventory"'));
assert.match(uiSource, /viewSelect\.value = "inventory-capture"/);
const inventoryDetails = [
  ...html.matchAll(/<details\b([^>]*\bclass="[^"]*\binventory-result-card\b[^>]*)>/g)
];
assert.equal(inventoryDetails.length, 4);
assert.deepEqual(
  inventoryDetails.map(([, attributes]) => /data-result="([^"]+)"/.exec(attributes)?.[1]).sort(),
  ["matched", "missing", "possible", "repeated"].sort()
);
assert.ok(uiSource.includes("Only pasted names can be missing"));
assert.ok(uiSource.includes("Other inventory ads were ignored"));
assert.doesNotMatch(
  uiSource,
  /comparison\.extra|totals\.extra|inventory-total-extra|inventory-list-extra/
);

assert.equal(manifest.version, "2.0.3");
assert.deepEqual(
  manifest.permissions.sort(),
  ["activeTab", "scripting", "sidePanel", "storage"].sort()
);
assert.deepEqual(manifest.content_scripts, []);
assert.ok(captureSource.includes("Product Name"));
assert.ok(captureSource.includes("isLoading"));
assert.ok(captureSource.includes("makeCaptureKey"));
assert.ok(captureSource.includes("textContent"));
assert.ok(captureSource.includes("__lunaInventoryCaptureInstalled"));
assert.ok(captureSource.includes("sender?.id !== chrome.runtime.id"));
assert.ok(uiSource.includes("luna.inventoryChecker.v1"));
assert.ok(uiSource.includes("luna.inventorySheetData.v1"));
assert.ok(uiSource.includes("chrome.tabs.sendMessage"));
assert.ok(uiSource.includes("chrome.scripting.executeScript"));
assert.ok(uiSource.includes("parseAdNamesText"));
assert.ok(uiSource.includes("sheetDataToQueueAds"));
assert.doesNotMatch(uiSource, /queueStorageKey|luna\.workQueue\.v1/);
assert.match(
  css,
  /\.inventory-result-card ul\s*\{[\s\S]*max-height:\s*180px[\s\S]*overflow-y:\s*auto/
);
assert.match(uiSource, /receiving end does not exist/i);
assert.match(css, /#inventory-compare:disabled\s*\{[\s\S]*cursor:\s*default/);
assert.doesNotMatch(
  captureSource,
  /\.(click|remove|submit)\s*\(|fetch\s*\(|XMLHttpRequest|localStorage/
);
assert.doesNotMatch(
  `${captureSource}\n${uiSource}`,
  /password|credential|cookie|token|delete\s+ad|publish\s+ad/i
);

console.log("Inventory Checker tests passed.");
