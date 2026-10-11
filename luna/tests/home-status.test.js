const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/features/home/home-status.js"),
  "utf8"
);

class FakeElement {
  constructor() {
    this.dataset = {};
    this.hidden = false;
    this.listeners = new Map();
    this.textContent = "";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

const elements = Object.fromEntries(
  [
    "#header-overall-status",
    "#header-status",
    "#home-resume-work-queue",
    "#home-summary-message",
    "#home-summary-title",
    "#home-work-queue-detail",
    "#home-work-queue-status"
  ].map((selector) => [selector, new FakeElement()])
);
let storageListener;
const navigationCalls = [];
const savedQueue = {
  ads: [
    { status: "listed" },
    { status: "pending" },
    { status: "review_later" },
    { status: "unlisted" }
  ],
  currentIndex: 1,
  version: 1
};
const context = {
  LunaFoundation: {
    storageKeys: { workQueue: "luna.workQueue.v1" }
  },
  LunaNavigation: {
    async show(sectionId) {
      navigationCalls.push(sectionId);
    }
  },
  Object,
  Promise,
  String,
  chrome: {
    storage: {
      local: {
        async get(defaults) {
          return { ...defaults, "luna.workQueue.v1": savedQueue };
        }
      },
      onChanged: {
        addListener(listener) {
          storageListener = listener;
        }
      }
    }
  },
  document: {
    querySelector(selector) {
      return elements[selector] || null;
    }
  }
};
context.globalThis = context;
vm.runInNewContext(source, context);

(async () => {
  await context.LunaHomeStatus.ready;
  assert.equal(elements["#home-work-queue-status"].textContent, "2/4 completed");
  assert.equal(elements["#home-work-queue-detail"].textContent, "Ad 2 of 4 · 1 pending · 1 review");
  assert.equal(elements["#home-resume-work-queue"].hidden, false);
  assert.equal(elements["#header-overall-status"].textContent, "Checking");

  context.LunaHomeStatus.updateService("sheet", { state: "connected" });
  context.LunaHomeStatus.updateService("ayshei", { state: "connected" });
  assert.equal(elements["#header-overall-status"].textContent, "Work saved");
  assert.match(elements["#home-summary-title"].textContent, /saved Work Queue/);

  await elements["#home-resume-work-queue"].listeners.get("click")();
  assert.deepEqual(navigationCalls, ["work-queue"]);

  storageListener({ "luna.workQueue.v1": { newValue: null, oldValue: savedQueue } }, "local");
  assert.equal(elements["#home-work-queue-status"].textContent, "No saved queue");
  assert.equal(elements["#home-resume-work-queue"].hidden, true);
  assert.equal(elements["#header-overall-status"].textContent, "Available");

  context.LunaHomeStatus.updateService("ayshei", { state: "error" });
  assert.equal(elements["#header-overall-status"].textContent, "Needs attention");
  assert.match(elements["#home-summary-title"].textContent, /need attention/);
  assert.doesNotMatch(
    `${elements["#home-work-queue-status"].textContent} ${
      elements["#home-work-queue-detail"].textContent
    }`,
    /vendor|example\.com/i
  );
  console.log("Home status and Resume Work tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
