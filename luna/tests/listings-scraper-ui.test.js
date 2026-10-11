const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extensionRoot = path.resolve(__dirname, "..");
const readExtensionFile = (fileName) => fs.readFileSync(path.join(extensionRoot, fileName), "utf8");

class MockElement {
  constructor() {
    this.checked = false;
    this.children = [];
    this.classList = { add() {}, toggle() {} };
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.listeners = new Map();
    this.textContent = "";
    this.value = "";
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  append(...children) {
    this.children.push(...children);
  }

  focus() {}

  replaceChildren(...children) {
    this.children = children;
  }

  select() {}

  setAttribute() {}
}

const selectors = [
  ".listings-scraper-view",
  "#scraper-start",
  "#scraper-collect-more",
  "#scraper-stop",
  "#scraper-enable-other-sites",
  "#scraper-other-sites-status",
  "#scraper-status",
  "#scraper-mode",
  "#scraper-message",
  "#scraper-last-send",
  "#scraper-last-send-summary",
  "#scraper-preview",
  "#scraper-generic-warning",
  "#scraper-accepted-list",
  "#scraper-select-all",
  "#scraper-unselect-all",
  "#scraper-send-selected",
  "#scraper-filter-duplicates",
  "#scraper-duplicate-note",
  "#scraper-add-separator",
  "#scraper-selected-count",
  "#scraper-unlisted-output",
  "#scraper-copy-unlisted",
  "#scraper-unlisted-count",
  "#scraper-total-accepted",
  "#scraper-total-detected",
  "#scraper-total-excluded"
];
const elements = Object.fromEntries(selectors.map((selector) => [selector, new MockElement()]));
elements["#scraper-add-separator"].checked = true;
elements["#scraper-filter-duplicates"].checked = true;

let scrapeCount = 0;
let sendCount = 0;
let lastSignal = null;
const requestIds = [];
const storageWrites = [];
const makeWriterResponse = (request, duplicateRequest = false) => ({
  appendedRange: `A4:D${request.items.length + 3}`,
  duplicateRequest,
  formattingCompleted: true,
  idempotencyApplied: true,
  inserted: request.items.length,
  missingPrices: 0,
  ok: true,
  outcome: duplicateRequest ? "already_completed" : "completed",
  received: request.items.length,
  requestId: request.clientRequestId,
  separatorAdded: true
});
const context = {
  AbortController,
  Array,
  Boolean,
  clearTimeout,
  crypto: {
    randomUUID: () => "11111111-1111-4111-8111-111111111111"
  },
  document: {
    createElement: () => new MockElement(),
    execCommand: () => true,
    querySelector: (selector) => elements[selector] || null
  },
  Error,
  fetch: async (_url, options) => {
    sendCount += 1;
    lastSignal = options.signal;
    const request = JSON.parse(options.body);
    requestIds.push(request.clientRequestId);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(makeWriterResponse(request))
    };
  },
  JSON,
  Map,
  Math,
  navigator: { clipboard: { writeText: async () => {} } },
  Number,
  Object,
  Promise,
  Set,
  setTimeout,
  String,
  URL
};
context.chrome = {
  permissions: {
    contains: async () => false,
    request: async () => false
  },
  scripting: {
    executeScript: async () => {
      scrapeCount += 1;
      return [
        {
          result: {
            accepted: [
              {
                id: `vehicle-${scrapeCount}`,
                price: "AED 100,000",
                title: `Test Vehicle ${scrapeCount}`,
                url: `https://www.dubicars.com/test-${scrapeCount}`
              }
            ],
            detected: 1,
            excluded: [],
            mode: "adapter",
            pageTitle: "Test inventory",
            pageUrl: "https://www.dubicars.com/dealers/test",
            site: "DubiCars",
            unlisted: []
          }
        }
      ];
    }
  },
  storage: {
    local: {
      get: async () => ({}),
      set: async (value) => storageWrites.push(value)
    }
  },
  tabs: { query: async () => [{ id: 101 }] }
};
context.LunaConfig = {
  rawDataWriterEndpoint: "https://script.google.com/macros/s/TEST_DEPLOYMENT/exec"
};
context.globalThis = context;

vm.runInNewContext(readExtensionFile("src/features/listings/scraper-core.js"), context);
vm.runInNewContext(readExtensionFile("src/features/listings/listings-scraper.js"), context);

(async () => {
  const scrape = elements["#scraper-start"].listeners.get("click");
  const send = elements["#scraper-send-selected"].listeners.get("click");

  await scrape();
  assert.equal(scrapeCount, 1);
  assert.equal(elements["#scraper-start"].disabled, false);
  assert.equal(elements["#scraper-send-selected"].disabled, false);
  assert.equal(elements["#scraper-selected-count"].textContent, "1");

  await scrape();
  assert.equal(scrapeCount, 2);
  assert.equal(elements["#scraper-selected-count"].textContent, "2");
  assert.equal(elements["#scraper-total-accepted"].textContent, "2");
  assert.match(elements["#scraper-message"].textContent, /across 2 pages/i);

  const successfulSend = send();
  assert.equal(elements["#scraper-start"].disabled, true);
  assert.equal(elements["#scraper-send-selected"].disabled, true);
  await successfulSend;
  assert.equal(sendCount, 1);
  assert.equal(lastSignal instanceof AbortSignal, true);
  assert.equal(elements["#scraper-status"].textContent, "Successful");
  assert.equal(elements["#scraper-start"].disabled, false);
  assert.equal(elements["#scraper-send-selected"].disabled, true);
  assert.equal(elements["#scraper-selected-count"].textContent, "0");
  assert.equal(elements["#scraper-total-accepted"].textContent, "0");
  assert.match(elements["#scraper-message"].textContent, /confirmed 2 items/);
  assert.equal(elements["#scraper-last-send"].hidden, false);
  assert.match(elements["#scraper-last-send-summary"].textContent, /2 rows.*A4:D5/);

  await scrape();
  assert.equal(scrapeCount, 3);
  assert.equal(elements["#scraper-start"].disabled, false);
  assert.equal(elements["#scraper-send-selected"].disabled, false);
  assert.equal(elements["#scraper-selected-count"].textContent, "1");
  assert.equal(elements["#scraper-total-accepted"].textContent, "1");

  context.setTimeout = (callback, delay) => {
    assert.equal(delay, 20000);
    Promise.resolve().then(callback);
    return 2020;
  };
  context.clearTimeout = () => {};
  context.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    requestIds.push(request.clientRequestId);
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  };

  await send();
  assert.equal(elements["#scraper-status"].textContent, "Failed");
  assert.equal(elements["#scraper-start"].disabled, false);
  assert.equal(elements["#scraper-send-selected"].disabled, false);
  assert.equal(elements["#scraper-selected-count"].textContent, "1");
  assert.equal(elements["#scraper-total-accepted"].textContent, "1");
  assert.match(elements["#scraper-message"].textContent, /reuse the same request ID/i);

  context.setTimeout = setTimeout;
  context.clearTimeout = clearTimeout;
  context.fetch = async (_url, options) => {
    sendCount += 1;
    const request = JSON.parse(options.body);
    requestIds.push(request.clientRequestId);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(makeWriterResponse(request, true))
    };
  };
  await send();
  assert.equal(requestIds[1], requestIds[2]);
  assert.equal(elements["#scraper-status"].textContent, "Successful");
  assert.match(elements["#scraper-message"].textContent, /Protected retry/);
  assert.equal(elements["#scraper-selected-count"].textContent, "0");
  assert.ok(storageWrites.some((value) => value["luna.rawDataSend.v1"]));

  console.log("Listings Scraper UI reset tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
