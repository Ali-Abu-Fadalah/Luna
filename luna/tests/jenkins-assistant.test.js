const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extensionRoot = path.resolve(__dirname, "..");
const readExtensionFile = (fileName) => fs.readFileSync(path.join(extensionRoot, fileName), "utf8");
const coreSource = readExtensionFile("src/features/jenkins/jenkins-core.js");
const pageSource = readExtensionFile("src/features/jenkins/jenkins-page.js");
const assistantSource = readExtensionFile("src/features/jenkins/jenkins-assistant.js");
const html = readExtensionFile("sidepanel.html");
const css = readExtensionFile("src/features/jenkins/jenkins-assistant.css");
const manifest = JSON.parse(readExtensionFile("manifest.json"));

class MockElement {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.listeners = new Map();
    this.readOnly = false;
    this.rows = 0;
    this.spellcheck = true;
    this.textContent = "";
    this.value = "";
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute() {}
}

const selectors = [
  ".jenkins-assistant-view",
  "#jenkins-type",
  "#jenkins-paste",
  "#jenkins-prepare",
  "#jenkins-clear",
  "#jenkins-fill",
  "#jenkins-status",
  "#jenkins-message",
  "#jenkins-preview",
  "#jenkins-preview-fields",
  "#jenkins-row-count",
  "#jenkins-field-count"
];
const elements = Object.fromEntries(selectors.map((selector) => [selector, new MockElement()]));
elements["#jenkins-type"].value = "dubicars";

let injectedBatch = null;
let injectedFunction = null;
let injectedTarget = null;
const context = {
  chrome: {
    scripting: {
      executeScript: async (options) => {
        injectedBatch = options.args[0];
        injectedFunction = options.func;
        injectedTarget = options.target;
        return [
          {
            result: {
              filledFields: injectedBatch.columns.length,
              jobName: "approved-test-job",
              ok: true,
              rowCount: injectedBatch.rowCount
            }
          }
        ];
      }
    },
    tabs: { query: async () => [{ id: 303 }] }
  },
  document: {
    createElement: () => new MockElement(),
    querySelector: (selector) => elements[selector] || null
  },
  Error,
  Map,
  Number,
  Object,
  Promise,
  Set,
  String,
  URL
};
context.globalThis = context;
vm.runInNewContext(coreSource, context);
vm.runInNewContext(pageSource, context);
vm.runInNewContext(assistantSource, context);

const validDubicars = [
  "https://www.dubicars.com/one\tUSED\tBMW 840Ci\tM SPORT\tBlack\tVERY_GOOD",
  "https://www.dubicars.com/two\tEXPORT\tToyota Camry\tOther\tWhite\tEXCELLENT"
].join("\n");
const prepare = elements["#jenkins-prepare"].listeners.get("click");
const fill = elements["#jenkins-fill"].listeners.get("click");

(async () => {
  elements["#jenkins-paste"].value = validDubicars;
  prepare();
  assert.equal(elements["#jenkins-status"].textContent, "Review ready");
  assert.equal(elements["#jenkins-preview"].hidden, false);
  assert.equal(elements["#jenkins-row-count"].textContent, "2");
  assert.equal(elements["#jenkins-field-count"].textContent, "6");
  assert.equal(elements["#jenkins-preview-fields"].children.length, 6);
  assert.equal(elements["#jenkins-fill"].disabled, false);

  await fill();
  assert.equal(injectedBatch.type, "dubicars");
  assert.equal(injectedBatch.rowCount, 2);
  assert.equal(injectedBatch.fields.CATEGORIES, "USED\nEXPORT");
  assert.equal(injectedFunction, context.LunaJenkinsPage.fillJenkinsPage);
  assert.deepEqual(JSON.parse(JSON.stringify(injectedTarget)), { tabId: 303 });
  assert.equal(elements["#jenkins-status"].textContent, "Fields filled");
  assert.match(elements["#jenkins-message"].textContent, /credentials yourself.*Build manually/i);
  assert.equal(elements["#jenkins-fill"].disabled, false);

  elements["#jenkins-paste"].value = `${validDubicars}\nhttps://www.dubicars.com/bad\tUSED`;
  elements["#jenkins-paste"].listeners.get("input")();
  assert.equal(elements["#jenkins-preview"].hidden, true);
  assert.equal(elements["#jenkins-fill"].disabled, true);
  prepare();
  assert.equal(elements["#jenkins-status"].textContent, "Needs correction");
  assert.match(
    elements["#jenkins-message"].textContent,
    /Row 3 has 2 columns.*same number of complete lines/
  );

  elements["#jenkins-type"].value = "dubizzle";
  elements["#jenkins-paste"].value =
    "https://dubai.dubizzle.com/one\tUSED\tBMW 840Ci\tM SPORT\tBlack\tVERY_GOOD\tGCC\tAUTOMATIC";
  prepare();
  assert.equal(elements["#jenkins-field-count"].textContent, "8");
  assert.equal(elements["#jenkins-preview-fields"].children.length, 8);
  assert.equal(elements["#jenkins-fill"].disabled, false);

  elements["#jenkins-type"].value = "noon";
  elements["#jenkins-paste"].value = [
    "https://www.noon.com/uae-en/watch/N1/p/\tELECTRONICS\tACCESSORIES\tWEARABLE_TECHNOLOGY\tNEW_WITH_TAGS",
    "https://www.noon.com/uae-en/makeup/N2/p/\tLIFESTYLE\tBEAUTY_HEALTH\tMAKEUP\tNEW_WITH_TAGS"
  ].join("\n");
  prepare();
  assert.equal(elements["#jenkins-status"].textContent, "Review ready");
  assert.equal(elements["#jenkins-field-count"].textContent, "5");
  assert.equal(elements["#jenkins-preview-fields"].children.length, 5);
  assert.equal(elements["#jenkins-fill"].disabled, false);
  await fill();
  assert.equal(injectedBatch.type, "noon");
  assert.equal(injectedBatch.rowCount, 2);
  assert.equal(injectedBatch.fields.CATEGORIES, "ELECTRONICS\nLIFESTYLE");
  assert.equal(injectedBatch.fields.SUB_CATEGORIES, "ACCESSORIES\nBEAUTY_HEALTH");
  assert.equal(injectedBatch.fields.SUB_SUB_CATEGORIES, "WEARABLE_TECHNOLOGY\nMAKEUP");
  assert.equal(injectedBatch.fields.CONDITIONS, "NEW_WITH_TAGS\nNEW_WITH_TAGS");

  console.log("Jenkins Assistant UI tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

assert.match(html, /class="[^"]*\bjenkins-assistant-view\b/);
assert.match(html, /DubiCars · P:U · 6 fields/);
assert.match(html, /Dubizzle · P:W · 8 fields/);
assert.match(html, /Noon · 5 fields · URL \+ taxonomy/);
const fillCardMarkup = html.match(
  /<article\b[^>]*class="[^"]*\bjenkins-fill-card\b[^>]*>[\s\S]*?<\/article>/
)?.[0];
assert.ok(fillCardMarkup, "Jenkins must retain the explicit fill action card.");
assert.match(fillCardMarkup, /credentials/i);
assert.match(fillCardMarkup, /\bBuild\b/);
assert.match(fillCardMarkup, /manual/i);
assert.match(html, /jenkins-core\.js/);
assert.match(html, /jenkins-page\.js/);
assert.match(html, /jenkins-assistant\.js/);
assert.match(css, /\.jenkins-preview-fields/);
assert.match(css, /overflow-wrap:\s*anywhere/);
assert.match(css, /@media \(max-width: 340px\)/);
assert.doesNotMatch(css, /cursor:\s*(?:wait|not-allowed)/);
assert.equal(manifest.version, "2.0.0");
assert.ok(manifest.host_permissions.every((origin) => !origin.includes("example.invalid")));
assert.equal(manifest.permissions.includes("cookies"), false);
assert.equal(manifest.permissions.includes("webRequest"), false);
assert.doesNotMatch(assistantSource, /chrome\.storage|localStorage|sessionStorage/);
assert.doesNotMatch(assistantSource, /\.click\s*\(|fetch\s*\(|XMLHttpRequest/);
