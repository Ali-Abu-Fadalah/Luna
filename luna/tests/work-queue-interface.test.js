const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
const controller = read("src/features/work-queue/work-queue.js");

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.style = {};
    this.value = "";
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.classList = { toggle() {} };
  }
  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = children;
  }
  setAttribute(name, value) {
    this[name] = value;
  }
  removeAttribute(name) {
    delete this[name];
  }
  focus() {
    documentStub.activeElement = this;
  }
  select() {}
  fire(type, detail = {}) {
    return this.listeners.get(type)?.({ preventDefault() {}, ...detail });
  }
}

const selectors = [
  ...new Set(
    [...controller.matchAll(/document\.querySelector\(\s*"([^"]+)"/g)].map((match) => match[1])
  )
];
const elements = Object.fromEntries(selectors.map((selector) => [selector, new Element()]));
const tabs = ["review", "listed", "unlisted", "later", "pending"].map((name) => {
  const tab = new Element();
  tab.dataset.queuePanel = name;
  return tab;
});
const panels = tabs.map((tab) => {
  const panel = new Element();
  panel.dataset.queuePanelView = tab.dataset.queuePanel;
  return panel;
});
const noteEvents = [];
const documentStub = {
  activeElement: null,
  createElement() {
    return new Element();
  },
  querySelector(selector) {
    assert.ok(elements[selector], selector);
    return elements[selector];
  },
  querySelectorAll(selector) {
    if (selector === ".queue-view-tab") return tabs;
    if (selector === "[data-queue-panel-view]") return panels;
    throw new Error(`Unexpected selector: ${selector}`);
  },
  dispatchEvent(event) {
    noteEvents.push(event);
  },
  execCommand() {
    return true;
  }
};
let subscription;
let stored;
const copied = [];
const writes = [];
const savedStatuses = [];
const selectedPanels = [];
const context = {
  clearTimeout,
  setTimeout,
  console,
  URL,
  Intl,
  Date,
  document: documentStub,
  LunaUI: {
    queueSaved(status) {
      savedStatuses.push(status);
    },
    queuePanelSelected(panel) {
      selectedPanels.push(panel);
    }
  },
  CustomEvent: class {
    constructor(type, options) {
      this.type = type;
      this.detail = options.detail;
    }
  },
  navigator: {
    clipboard: {
      async writeText(text) {
        copied.push(text);
      }
    }
  },
  chrome: {
    storage: {
      local: {
        async get(defaults) {
          return { ...defaults, "luna.workQueue.v1": stored };
        },
        async set(value) {
          writes.push(JSON.parse(JSON.stringify(value)));
        }
      }
    }
  },
  LunaConnection: {
    isDataState(state) {
      return ["connected", "cached", "refreshing"].includes(state);
    },
    subscribe(listener) {
      subscription = listener;
      listener({ state: "connected", payload: { rows: [] } });
    }
  }
};
context.globalThis = context;
for (const file of [
  "src/shared/foundation.js",
  "src/features/work-queue/work-queue-core.js",
  "src/services/ayshei/ayshei-core.js"
])
  vm.runInNewContext(read(file), context);
const core = context.LunaWorkQueueCore;
const ads = core.parseCopiedRows(
  [
    "10/5/2026\tMotors\tSample Vendor\tFirst car\tSample Agent\thttps://dubai.dubizzle.com/first",
    "10/5/2026\tMotors\tSample Vendor\tSecond car\tSample Agent\thttps://www.dubicars.com/second",
    "10/5/2026\tMotors\tSample Vendor\tThird car\tSample Agent\thttps://dubai.dubizzle.com/third",
    "10/5/2026\tProducts\tSample Vendor\tFourth product\tSample Agent\thttps://www.noon.com/fourth"
  ].join("\n")
).ads;
ads[0].status = "listed";
Object.assign(ads[0].listed, {
  category: "USED",
  makeModel: "Sample Car",
  trim: "Standard",
  color: "Silver",
  specs: "GCC",
  transmission: "AUTOMATIC",
  makeCode: 1,
  modelCode: 2,
  trimCode: 3
});
ads[1].status = "unlisted";
ads[1].unlisted = { date: "10/5/2026", reason: "Local-only reason" };
ads[2].status = "review_later";
ads[2].unlisted.reason = "Local-only reason";
ads[3].unlisted.reason = "Local-only reason";
stored = { version: 1, ads, currentIndex: 0, history: [] };
vm.runInNewContext(controller, context);
const element = (id) => elements[`#${id}`];
const settle = () => new Promise((resolve) => setImmediate(resolve));
const labels = (id) => element(id).children.map((child) => child.textContent);

(async () => {
  await settle();
  const sheetRows = [
    ...Array.from({ length: 5 }, (_, index) => ({
      unlistedReason: index === 1 ? " sold " : "Sold"
    })),
    ...Array.from({ length: 3 }, () => ({ unlistedReason: "Duplicate" })),
    ...Array.from({ length: 2 }, () => ({ unlistedReason: "Price on request" })),
    { unlistedReason: "Body type mismatch" },
    { unlistedReason: "" }
  ];
  subscription({ state: "connected", payload: { rows: sheetRows } });
  assert.deepEqual(labels("queue-frequent-reasons"), ["Local-only reason"]);
  assert.equal(element("queue-frequent-reasons").children[0].title, "Last used reason");
  element("queue-frequent-reasons").children[0].fire("click");
  assert.equal(element("queue-unlisted-reason").value, "Local-only reason");
  assert.equal(
    element("queue-current-status").textContent,
    "Listed",
    "Choosing a reason does not decide the ad"
  );
  assert.equal(element("queue-frequent-reasons").children[0]["aria-pressed"], "true");
  element("queue-unlisted-reason").value = "body";
  element("queue-unlisted-reason").fire("input");
  assert.equal(element("queue-frequent-reasons").hidden, true);
  assert.deepEqual(labels("queue-reason-suggestions"), ["Body type mismatch"]);
  element("queue-reason-suggestions").children[0].fire("click");
  assert.equal(element("queue-unlisted-reason").value, "Body type mismatch");
  assert.equal(element("queue-reason-suggestions").hidden, true);
  element("queue-unlisted-reason").value = "local";
  element("queue-unlisted-reason").fire("input");
  assert.deepEqual(labels("queue-reason-suggestions"), ["Local-only reason"]);
  element("queue-unlisted-reason").value = "A brand-new manual reason";
  element("queue-unlisted-reason").fire("input");
  assert.equal(element("queue-reason-suggestions").hidden, true);
  assert.equal(element("queue-reason-match-status").textContent, "New reason · Save as Unlisted");
  element("queue-unlisted-reason").fire("keydown", { key: "Enter", isComposing: true });
  assert.equal(element("queue-current-status").textContent, "Listed");
  await element("queue-unlisted-reason").fire("keydown", { key: "Enter", isComposing: false });
  await settle();
  assert.equal(
    element("queue-progress-title").textContent,
    "Ad 2 of 4",
    "Saving advances through the existing queue"
  );
  assert.match(element("queue-unlisted-output").value, /A brand-new manual reason\tSample Vendor/);
  assert.equal(element("queue-listed-output").value.split("\n")[0], "\t\t\t\t\t\t\t");
  assert.equal(element("queue-listed-output").value.split("\n")[3].split("\t").length, 5);
  await element("queue-undo").fire("click");
  await settle();
  assert.equal(element("queue-current-status").textContent, "Listed");
  assert.equal(element("queue-progress-title").textContent, "Ad 1 of 4");
  assert.deepEqual(
    savedStatuses,
    ["unlisted"],
    "Save closes its dialog once; Undo does not save again"
  );
  element("queue-listed-color").value = "Black";
  element("queue-view-select").value = "listed";
  element("queue-view-select").fire("change");
  assert.equal(
    element("queue-listed-output").value.split("\n")[0].split("\t")[4],
    "Black",
    "Results copy the latest form draft"
  );
  assert.equal(element("queue-review-output").value, "https://dubai.dubizzle.com/third");
  assert.equal(element("queue-pending-output").value, "https://www.noon.com/fourth");
  element("queue-copy-review").fire("click");
  element("queue-copy-pending").fire("click");
  await settle();
  assert.deepEqual(copied, ["https://dubai.dubizzle.com/third", "https://www.noon.com/fourth"]);
  element("queue-pending-list").children[0].fire("click");
  assert.equal(element("queue-progress-title").textContent, "Ad 4 of 4");
  assert.equal(panels[0].hidden, false);
  assert.equal(element("queue-add-note").disabled, true);
  element("queue-note-text").value = "Review this product";
  element("queue-note-text").fire("input");
  assert.equal(element("queue-add-note").disabled, false);
  element("queue-add-note").fire("click");
  assert.deepEqual(JSON.parse(JSON.stringify(noteEvents.at(-1))), {
    type: "luna:work-queue-note",
    detail: { adName: "Fourth product", note: "Review this product", vendor: "Sample Vendor" }
  });
  assert.equal(element("queue-note-text").value, "");
  assert.equal(element("queue-add-note").disabled, true);
  element("queue-view-select").value = "pending";
  element("queue-view-select").fire("change");
  assert.equal(panels[4].hidden, false);
  assert.equal(selectedPanels.at(-1), "pending");
  subscription({ state: "error", payload: { rows: sheetRows } });
  assert.equal(element("queue-frequent-reasons").hidden, false);
  assert.deepEqual(labels("queue-frequent-reasons"), [
    "A brand-new manual reason",
    "Local-only reason"
  ]);
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.ok(writes.length, "Existing Chrome local storage draft persistence still runs");
  assert.ok(writes.every((write) => Object.keys(write).join() === "luna.workQueue.v1"));
  console.log(
    "Work Queue interface tests passed: personal reasons, replacement search, canonical results, navigation, notes and persistence."
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
