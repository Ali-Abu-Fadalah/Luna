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
const visibleControlValues = new Map();
let finishDelayedWrite;
let delayNextWrite = false;
const context = {
  clearTimeout,
  setTimeout,
  console,
  URL,
  Intl,
  Date,
  document: documentStub,
  LunaControls: {
    sync(input) {
      visibleControlValues.set(input, input.value);
    },
    closeAll() {}
  },
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
          if (delayNextWrite) {
            delayNextWrite = false;
            await new Promise((resolve) => {
              finishDelayedWrite = resolve;
            });
          }
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
  "src/services/ayshei/ayshei-core.js",
  "src/features/work-queue/vehicle-detail-core.js",
  "src/services/ai/groq-core.js"
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
  element("queue-go-number").value = "1";
  element("queue-go").fire("click");
  assert.equal(element("queue-listed-make-model").value, "Sample Car");
  assert.equal(visibleControlValues.get(element("queue-listed-color")), "Black");
  delayNextWrite = true;
  const saving = element("queue-mark-listed").fire("click");
  assert.equal(
    element("queue-progress-title").textContent,
    "Ad 2 of 4",
    "Next ad must render before a slow storage write finishes"
  );
  for (const name of ["category", "make-model", "trim", "color", "specs", "transmission"]) {
    const field = element(`queue-listed-${name}`);
    assert.equal(field.value, "", `${name} must show the current empty ad, not the completed ad`);
    assert.equal(visibleControlValues.get(field), "", `${name} styled control must also reset`);
  }
  assert.equal(element("queue-listed-trim-copy").value, "");
  assert.equal(element("queue-color-swatch").dataset.hasColor, "false");
  assert.equal(element("queue-source-preview").hidden, true);
  element("queue-listed-color").value = "White";
  element("queue-listed-color").fire("input");
  finishDelayedWrite();
  await saving;
  await new Promise((resolve) => setTimeout(resolve, 220));
  const savedQueue = writes.at(-1)["luna.workQueue.v1"];
  assert.equal(savedQueue.ads[0].listed.makeModel, "Sample Car", "Completed data stays saved");
  assert.equal(savedQueue.ads[0].listed.color, "Black");
  assert.equal(
    savedQueue.ads[1].listed.makeModel,
    "",
    "Next draft cannot inherit the previous model"
  );
  assert.equal(savedQueue.ads[1].listed.color, "White", "New edits belong only to the next ad");
  await element("queue-undo").fire("click");
  assert.equal(element("queue-listed-make-model").value, "Sample Car");
  assert.equal(
    visibleControlValues.get(element("queue-listed-color")),
    "Black",
    "Undo must restore the correct ad's own saved values"
  );
  // Drive the real Auto Fill controller using the reported ad's extracted
  // identity and synthetic Golf catalog codes. The answer must not depend on AI.
  const golf = JSON.parse(read("tests/fixtures/volkswagen-golf-gti.json"));
  context.chrome.tabs = { query: async () => [{ id: 77, url: golf.capture.sourceUrl }] };
  context.chrome.scripting = { executeScript: async () => [{ result: golf.capture }] };
  context.LunaAyshei = {
    searchModels: async () => ({ models: golf.models }),
    fetchTrims: async (makeCode, modelCode) => {
      assert.equal(makeCode, 112);
      assert.equal(modelCode, 113, "Trim lookup must use Golf, never Volkswagen Other");
      return { trims: golf.trims };
    }
  };
  let aiCalls = 0;
  context.LunaGroq = {
    analyze: async () => {
      aiCalls++;
      throw new Error("AI unavailable");
    }
  };
  element("queue-import-text").value =
    `10/19/2026\tMotors\tDemo Vendor\tGolf GTI\tAgent\t${golf.capture.sourceUrl}`;
  element("queue-start").fire("click");
  await element("queue-confirm-import").fire("click");
  await element("queue-auto-fill").fire("click");
  assert.equal(element("queue-listed-make-model").value, "Volkswagen Golf");
  assert.equal(element("queue-listed-trim").value, "GTI");
  assert.equal(element("queue-listed-specs").value, "American");
  assert.equal(element("queue-listed-transmission").value, "MANUAL");
  assert.equal(aiCalls, 0, "Clear catalog evidence must resolve without an AI guess");
  const golfSaved = writes.at(-1)["luna.workQueue.v1"].ads[0];
  assert.equal(golfSaved.listed.modelCode, 113);
  assert.equal(golfSaved.listed.trimCode, 118);
  assert.equal(golfSaved.status, "pending", "Auto Fill must not save as listed");
  context.LunaWorkQueue.applyManualDraft({
    sourceUrl: golf.capture.sourceUrl,
    makeModel: "Volkswagen Other",
    makeCode: 112,
    modelCode: 0,
    trim: "Other",
    trimCode: 0
  });
  assert.equal(element("queue-listed-make-model").value, "Volkswagen Other");
  await element("queue-auto-fill").fire("click");
  assert.equal(
    element("queue-listed-make-model").value,
    "Volkswagen Golf",
    "Retrying Auto Fill must repair an already-saved incorrect Other draft"
  );
  assert.equal(element("queue-listed-trim").value, "GTI");
  const gls = JSON.parse(read("tests/fixtures/mercedes-gls450.json"));
  context.chrome.tabs.query = async () => [{ id: 78, url: gls.capture.sourceUrl }];
  context.chrome.scripting.executeScript = async () => [{ result: gls.capture }];
  const glsSearches = [];
  let activeModelSearches = 0;
  let peakModelSearches = 0;
  context.LunaAyshei.searchModels = async (keyword) => {
    glsSearches.push(keyword);
    activeModelSearches++;
    peakModelSearches = Math.max(peakModelSearches, activeModelSearches);
    await new Promise((resolve) => setImmediate(resolve));
    activeModelSearches--;
    return {
      models:
        keyword === "Mercedes GLS450" || keyword.toLowerCase() === "mercedes gls"
          ? gls.models
          : keyword === "Mercedes"
            ? [gls.unrelated]
            : []
    };
  };
  context.LunaAyshei.fetchTrims = async (makeCode, modelCode) => {
    assert.equal(makeCode, 100);
    assert.equal(modelCode, 106);
    return { trims: gls.trims };
  };
  element("queue-import-text").value =
    `10/19/2026\tMotors\tDemo Vendor\tMercedes GLS 450\tAgent\t${gls.capture.sourceUrl}`;
  element("queue-start").fire("click");
  await element("queue-confirm-import").fire("click");
  await element("queue-auto-fill").fire("click");
  assert.ok(glsSearches.includes("Mercedes GLS450"));
  assert.ok(glsSearches.includes("Mercedes GLS 450"));
  assert.equal(
    peakModelSearches,
    3,
    "Independent model-name variants run in bounded parallel batches"
  );
  assert.equal(element("queue-listed-make-model").value, "Mercedes GLS450");
  assert.equal(element("queue-listed-trim").value, "4MATIC");
  assert.equal(aiCalls, 0, "Exact GLS450/4MATIC evidence needs no AI guess");
  const missingModelSearches = [];
  context.LunaAyshei.searchModels = async (keyword) => {
    missingModelSearches.push(keyword);
    return { models: [gls.unrelated] };
  };
  await element("queue-auto-fill").fire("click");
  assert.deepEqual(
    missingModelSearches,
    glsSearches,
    "An absent model requires completing every planned name-variant query"
  );
  assert.equal(
    element("queue-listed-make-model").value,
    "",
    "If the catalog omits GLS entirely, do not substitute EQB from the same make"
  );
  assert.equal(aiCalls, 0, "Unrelated models must not be offered to AI");
  const xt6 = JSON.parse(read("tests/fixtures/xt6-black-edition.json"));
  context.chrome.tabs.query = async () => [{ id: 79, url: xt6.capture.sourceUrl }];
  context.chrome.scripting.executeScript = async () => [{ result: xt6.capture }];
  context.LunaAyshei.searchModels = async () => ({ models: xt6.models });
  context.LunaAyshei.fetchTrims = async () => ({ trims: xt6.trims });
  context.LunaGroq.analyze = async (input) => {
    assert.equal(input.task, "trim");
    assert.equal(input.facts.trim, "Black Edition");
    assert.equal(input.facts.specs, "Korean Specs");
    assert.equal(input.facts.cylinders, "6");
    assert.doesNotMatch(input.facts.context, /Escalade|Platinum/);
    aiCalls++;
    return context.LunaGroqCore.parseAnalysis(
      {
        model: "qwen/qwen3.8-27b",
        analysis: {
          candidateId: "122",
          confidence: "high",
          confidenceScore: 0.99,
          exact: true,
          riskFlags: [],
          reason: "First catalog choice"
        }
      },
      input
    );
  };
  element("queue-import-text").value =
    `10/19/2026\tMotors\tDemo Vendor\tXT6 Black Edition\tAgent\t${xt6.capture.sourceUrl}`;
  element("queue-start").fire("click");
  await element("queue-confirm-import").fire("click");
  context.LunaWorkQueue.applyManualDraft({
    sourceUrl: xt6.capture.sourceUrl,
    makeModel: "Cadillac XT6",
    makeCode: 120,
    modelCode: 121,
    trim: "LUXURY",
    trimCode: 122
  });
  await element("queue-auto-fill").fire("click");
  assert.equal(element("queue-listed-make-model").value, "Cadillac XT6");
  assert.equal(
    element("queue-listed-trim").value,
    "",
    "An unsupported old Luxury guess must be cleared"
  );
  assert.equal(writes.at(-1)["luna.workQueue.v1"].ads[0].listed.trimCode, null);
  assert.match(element("queue-auto-fill-message").textContent, /Review: Trim/);
  assert.equal(aiCalls, 1, "Unavailable editions must be sent to AI instead of text fallback");
  context.LunaGroq.analyze = async (input) =>
    context.LunaGroqCore.parseAnalysis(
      {
        model: "qwen/qwen3.8-27b",
        analysis: {
          candidateId: "125",
          confidence: "low",
          confidenceScore: 0.45,
          trimComparison: {
            basis: "vehicle-specification",
            matchedSpecifications: [],
            materialDifferences: [],
            uncertainties: ["Actual Black Edition equipment requires verification"],
            explanation:
              "Test comparison only: this supplied grade is the closest configuration in this simulated response."
          }
        }
      },
      input
    );
  await element("queue-auto-fill").fire("click");
  assert.equal(element("queue-listed-trim").value, "SPORT");
  assert.match(
    element("queue-auto-fill-message").textContent,
    /AI trim: SPORT.*low confidence.*Review before saving/
  );
  assert.equal(
    writes.at(-1)["luna.workQueue.v1"].ads[0].extractionEvidence.trimComparison.uncertainties[0],
    "Actual Black Edition equipment requires verification"
  );
  assert.equal(
    writes.at(-1)["luna.workQueue.v1"].ads[0].extractionEvidence.nearestTrimRecommendation,
    true
  );
  assert.equal(
    writes.at(-1)["luna.workQueue.v1"].ads[0].extractionEvidence.trimResolution.candidateId,
    "125"
  );
  for (const answer of [
    {
      candidateId: null,
      expected: "SPORT",
      reason:
        "Page facts.trim is 'Black Edition'. While not an exact match to the candidates, 'Black Edition' is a styling package typically associated with the 'SPORT' trim in Cadillac's lineup."
    },
    {
      candidateId: "123",
      expected: "PREMIUM LUXURY",
      reason:
        "Simulated alternative comparison recommends PREMIUM LUXURY based on the supplied equipment; SPORT remains an uncertain alternative."
    }
  ]) {
    context.LunaGroq.analyze = async (input) =>
      context.LunaGroqCore.parseAnalysis(
        {
          model: "qwen/qwen3.8-27b",
          imageUsed: true,
          analysis: {
            candidateId: answer.candidateId,
            confidence: "medium",
            confidenceScore: 0.6,
            reason: answer.reason
          }
        },
        input
      );
    await element("queue-auto-fill").fire("click");
    assert.equal(element("queue-listed-trim").value, answer.expected);
    assert.ok(
      element("queue-auto-fill-message").textContent.includes(`AI trim: ${answer.expected}`)
    );
    assert.equal(
      writes.at(-1)["luna.workQueue.v1"].ads[0].extractionEvidence.trimResolution.reason,
      answer.reason
    );
    assert.doesNotMatch(element("queue-auto-fill-message").textContent, /Missing: Trim/);
  }
  context.LunaGroq.analyze = async () => {
    throw new Error("Groq quota exhausted");
  };
  await element("queue-auto-fill").fire("click");
  assert.equal(
    element("queue-listed-trim").value,
    "",
    "API failure must not select first/STD/textually similar trim"
  );
  assert.match(element("queue-auto-fill-message").textContent, /Groq quota exhausted/);
  console.log(
    "Work Queue interface tests passed: personal reasons, replacement search, canonical results, navigation, notes and persistence."
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
