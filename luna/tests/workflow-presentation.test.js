const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.value = "";
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.classList = { add() {}, toggle() {} };
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
  focus() {
    this.focused = true;
  }
  select() {
    this.selected = true;
  }
  trigger(name) {
    return this.listeners.get(name)?.();
  }
}

function fixture() {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const context = {
    AbortController,
    URL,
    setTimeout,
    clearTimeout,
    document: { createElement: () => new Element(), querySelector: element },
    chrome: {
      permissions: { contains: async () => false },
      storage: { local: { get: async () => ({}), set: async () => {} } },
      tabs: { query: async () => [{ id: 101 }] },
      scripting: {}
    }
  };
  context.globalThis = context;
  const load = (file) =>
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  return { context, element, load };
}

test("Listings search keeps hidden selections in the send and excluded reasons separate", async () => {
  const { context, element, load } = fixture();
  const requests = [];
  context.crypto = { randomUUID: () => "11111111-1111-4111-8111-111111111111" };
  context.LunaConfig = {
    rawDataWriterEndpoint: "https://script.google.com/macros/s/TEST_DEPLOYMENT/exec"
  };
  context.chrome.scripting.executeScript = async () => [
    {
      result: {
        pageUrl: "https://www.dubicars.com/dealers/test",
        site: "DubiCars",
        mode: "adapter",
        accepted: [
          { title: "Alpha vehicle", price: "100 AED", url: "https://www.dubicars.com/alpha" },
          { title: "Beta vehicle", price: "200 AED", url: "https://www.dubicars.com/beta" }
        ],
        unlisted: [{ title: "Sold vehicle", url: "https://www.dubicars.com/sold", reason: "Sold" }],
        excluded: [
          {
            title: "<img src=x>",
            url: "https://www.dubicars.com/incomplete",
            reason: "Missing title"
          }
        ]
      }
    }
  ];
  // The writer is mocked; no external request occurs in this test.
  context.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          ok: true,
          outcome: "completed",
          inserted: request.items.length,
          received: request.items.length,
          requestId: request.clientRequestId,
          idempotencyApplied: true,
          formattingCompleted: true,
          appendedRange: `A4:D${request.items.length + 3}`,
          missingPrices: 0,
          separatorAdded: false
        })
    };
  };
  element("#scraper-filter-duplicates").checked = true;
  load("src/features/listings/scraper-core.js");
  load("src/features/listings/listings-scraper.js");
  await element("#scraper-start").trigger("click");
  assert.equal(element("#scraper-selected-count").textContent, "2");
  assert.equal(
    element("#scraper-total-excluded").textContent,
    "2",
    "Existing combined excluded/unlisted count is preserved."
  );
  const excluded = element("#scraper-excluded-list").children;
  assert.equal(excluded.length, 1, "Excluded details must not duplicate Unlisted rows.");
  assert.equal(excluded[0].children[0].textContent, "<img src=x>");
  assert.equal(excluded[0].children[2].textContent, "Missing title");
  element("#scraper-search").value = "  ALPHA ";
  element("#scraper-search").trigger("input");
  assert.equal(element("#scraper-accepted-list").children.length, 1);
  assert.equal(element("#scraper-selected-count").textContent, "2");
  element("#scraper-search").value = "No match";
  element("#scraper-search").trigger("input");
  assert.match(element("#scraper-accepted-list").children[0].textContent, /selection is kept/);
  await element("#scraper-send-selected").trigger("click");
  assert.equal(requests.length, 1);
  assert.deepEqual(
    requests[0].items.map((item) => item.title),
    ["Alpha vehicle", "Beta vehicle"]
  );
});

test("Jenkins field review copies the actual column while fill keeps every aligned field", async () => {
  const { context, element, load } = fixture();
  const copied = [];
  let filledBatch;
  context.navigator = { clipboard: { writeText: async (text) => copied.push(text) } };
  context.LunaJenkinsPage = { fillJenkinsPage() {} };
  context.chrome.scripting.executeScript = async ({ args }) => {
    filledBatch = args[0];
    return [
      {
        result: {
          ok: true,
          filledFields: filledBatch.columns.length,
          rowCount: filledBatch.rowCount
        }
      }
    ];
  };
  element("#jenkins-type").value = "dubicars";
  load("src/features/jenkins/jenkins-core.js");
  load("src/features/jenkins/jenkins-assistant.js");
  element("#jenkins-paste").value = [
    "https://www.dubicars.com/one\tUSED\tBMW 840Ci\tM SPORT\tBlack\tVERY_GOOD",
    "https://www.dubicars.com/two\tEXPORT\tToyota Camry\tOther\tWhite\tEXCELLENT"
  ].join("\n");
  element("#jenkins-prepare").trigger("click");
  const cards = element("#jenkins-preview-fields").children;
  assert.equal(cards.length, 6);
  assert.equal(element("#jenkins-field-select").children.length, 6);
  assert.equal(cards.filter((card) => !card.hidden).length, 1);
  element("#jenkins-field-select").value = "CATEGORIES";
  element("#jenkins-field-select").trigger("change");
  assert.equal(cards.find((card) => !card.hidden).dataset.jenkinsField, "CATEGORIES");
  await element("#jenkins-field-copy").trigger("click");
  assert.deepEqual(copied, ["USED\nEXPORT"]);
  await element("#jenkins-fill").trigger("click");
  assert.equal(filledBatch.columns.length, 6);
  assert.equal(filledBatch.fields.CATEGORIES, "USED\nEXPORT");
  element("#jenkins-paste").value += "\nchanged";
  element("#jenkins-paste").trigger("input");
  assert.equal(element("#jenkins-field-copy").disabled, true);
  assert.equal(element("#jenkins-field-select").disabled, true);
  assert.equal(element("#jenkins-field-select").children.length, 0);
  await element("#jenkins-field-copy").trigger("click");
  assert.equal(copied.length, 1, "An invalidated column must not remain copyable.");
  element("#jenkins-prepare").trigger("click");
  assert.equal(
    element("#jenkins-field-copy").disabled,
    true,
    "Malformed rows must not restore old output."
  );
});
