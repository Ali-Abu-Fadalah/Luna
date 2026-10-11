const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const coreSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/work-queue/work-queue-core.js"),
  "utf8"
);
const uiSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/work-queue/work-queue.js"),
  "utf8"
);
const aysheiCoreSource = fs.readFileSync(
  path.resolve(__dirname, "../src/services/ayshei/ayshei-core.js"),
  "utf8"
);
const vehicleCoreSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/work-queue/vehicle-detail-core.js"),
  "utf8"
);
const foundationSource = fs.readFileSync(
  path.resolve(__dirname, "../src/shared/foundation.js"),
  "utf8"
);
const groqCoreSource = fs.readFileSync(
  path.resolve(__dirname, "../src/services/ai/groq-core.js"),
  "utf8"
);

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(name, force) {
    if (force) {
      this.values.add(name);
    } else {
      this.values.delete(name);
    }
  }
}

class FakeElement {
  constructor() {
    this.children = [];
    this.classList = new FakeClassList();
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.href = "";
    this.listeners = new Map();
    this.max = "";
    this.open = false;
    this.style = {};
    this.textContent = "";
    this.value = "";
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  append(child) {
    this.children.push(child);
  }

  focus() {}

  replaceChildren(...children) {
    this.children = children;
  }

  select() {}

  setAttribute(name, value) {
    this[name] = value;
  }
}

const selectorNames = [...uiSource.matchAll(/document\.querySelector\(\s*"([^"]+)"/g)].map(
  (match) => match[1]
);
const elements = Object.fromEntries(
  [...new Set(selectorNames)].map((selector) => [selector, new FakeElement()])
);
const viewTabs = ["review", "listed", "unlisted", "later"].map((name) => {
  const element = new FakeElement();
  element.dataset.queuePanel = name;
  return element;
});
const panels = ["review", "listed", "unlisted", "later"].map((name) => {
  const element = new FakeElement();
  element.dataset.queuePanelView = name;
  return element;
});

const restoredAd = {
  id: 1,
  listed: {
    category: "USED",
    color: "Black",
    condition: "VERY_GOOD",
    makeModel: "Mercedes A220",
    specs: "American",
    transmission: "AUTOMATIC",
    trim: "Other"
  },
  source: {
    adName: "Restored Advertisement",
    agent: "Agent A",
    category: "Motors",
    date: "7/27/2026",
    url: "https://example.com/restored",
    vendor: "Restored Vendor"
  },
  status: "listed",
  unlisted: { date: "", reason: "" }
};
const storedQueue = {
  ads: [restoredAd],
  currentIndex: 0,
  history: [],
  version: 1
};
const savedValues = [];
const openedTabs = [];
const updatedTabs = [];
const sessionValues = {};
const fillUrl = "https://dubai.dubizzle.com/motors/used-cars/bmw/840ci/example/";
let groqCalls = 0;
let captureOverride = null;
let modelCatalogOverride = null;
let failModelAi = false;
let deferTrimAi = false;
let releaseTrimAi = null;
let capturedPayload = null;
const context = {
  chrome: {
    scripting: {
      async executeScript(options) {
        assert.deepEqual(JSON.parse(JSON.stringify(options)), {
          files: ["src/features/work-queue/vehicle-detail-page.js"],
          target: { tabId: 77 }
        });
        const payload = captureOverride || {
          facts: {
            category: { evidence: "Structured vehicle condition", value: "UsedCondition" },
            color: { evidence: "Structured vehicle color", value: "Green" },
            mileage: { evidence: "Structured vehicle mileage", value: "60,000" },
            make: { evidence: "Structured vehicle brand", value: "BMW" },
            model: { evidence: "Structured vehicle model", value: "840Ci" },
            specs: { evidence: "Visible specification summary", value: "GCC Specs" },
            targetMarket: { evidence: "Visible Target Market", value: "UAE (can be exported)" },
            transmission: {
              evidence: "Visible Transmission Type",
              value: "Automatic Transmission"
            },
            trim: { evidence: "Visible Trim", value: "Performance Package" }
          },
          context: "Performance package · all-wheel drive · sports seats",
          description: "UAE vehicle that may be exported; no export-only restriction.",
          imageUrl: "https://dbz-images.dubizzle.com/bmw.jpg",
          site: "dubizzle",
          sourceUrl: fillUrl,
          summary: "BMW 840Ci with a performance package",
          title: "BMW 840Ci Performance Package",
          version: 1
        };
        capturedPayload = payload;
        return [{ result: payload }];
      }
    },
    storage: {
      local: {
        async get(defaults) {
          return { ...defaults, "luna.workQueue.v1": storedQueue };
        },
        async set(value) {
          savedValues.push(JSON.parse(JSON.stringify(value)));
        }
      },
      session: {
        async get(defaults) {
          return { ...defaults, ...sessionValues };
        },
        async remove(key) {
          delete sessionValues[key];
        },
        async set(value) {
          Object.assign(sessionValues, value);
        }
      }
    },
    tabs: {
      async create(options) {
        openedTabs.push(options);
        return { id: 77 };
      },
      async update(tabId, options) {
        updatedTabs.push({ options, tabId });
        return { id: tabId };
      },
      async query(options) {
        assert.deepEqual(JSON.parse(JSON.stringify(options)), {
          active: true,
          currentWindow: true
        });
        return [{ id: 77, url: fillUrl }];
      }
    }
  },
  clearTimeout,
  console,
  Date,
  document: {
    createElement() {
      return new FakeElement();
    },
    execCommand() {
      return true;
    },
    querySelector(selector) {
      assert.ok(Object.hasOwn(elements, selector), selector);
      return elements[selector];
    },
    querySelectorAll(selector) {
      if (selector === ".queue-view-tab") {
        return viewTabs;
      }

      if (selector === "[data-queue-panel-view]") {
        return panels;
      }

      throw new Error(`Unexpected selector: ${selector}`);
    }
  },
  Intl,
  JSON,
  LunaConnection: {
    isDataState(state) {
      return ["cached", "connected", "refreshing"].includes(state);
    },
    subscribe(listener) {
      listener({ payload: { rows: [] }, state: "connected" });
    }
  },
  LunaAyshei: {
    async fetchTrims(makeCode, modelCode) {
      if (makeCode === 10 && [40, 41].includes(modelCode)) {
        return { trims: [{ label: "BASE", trimCode: 10 }] };
      }
      assert.equal(makeCode, 7);
      assert.equal(modelCode, 877);
      return {
        trims: [
          { label: "M SPORT", trimCode: 5767 },
          { label: "Other", trimCode: 1000001 },
          { label: "STD", trimCode: 2988 }
        ]
      };
    },
    async searchModels(keyword) {
      if (modelCatalogOverride) return { models: modelCatalogOverride };
      assert.ok(["BMW 840", "BMW 840Ci"].includes(keyword));
      return {
        models: [{ label: "BMW 840Ci", make: "BMW", makeCode: 7, model: "840Ci", modelCode: 877 }]
      };
    }
  },
  LunaGroq: {
    async analyze(input) {
      groqCalls += 1;
      if (input.task === "bodyType") {
        assert.equal(
          input.facts.context,
          undefined,
          "Body Type must not use page body-type/context labels"
        );
        return {
          bodyType: "Coupe",
          candidate: null,
          confidence: "high",
          imageUsed: true,
          reason: "Two-door body shape"
        };
      }
      if (input.task === "color") {
        assert.deepEqual(JSON.parse(JSON.stringify(input.candidates)), [
          { id: "dark-green", label: "Dark Green" },
          { id: "light-green", label: "Light Green" }
        ]);
        assert.equal(input.facts.color, "Green");
        assert.equal(input.imageUrl, "https://dbz-images.dubizzle.com/bmw.jpg");
        return {
          candidate: { id: "light-green", label: "Light Green" },
          confidence: "high",
          confidenceScore: 0.96,
          autoFillEligible: true,
          exact: false,
          imageUsed: true,
          reason: "The vehicle paint is visibly light green"
        };
      }
      if (input.task === "model") {
        if (failModelAi) throw new Error("Groq unavailable in test");
        assert.ok(input.candidates.every((candidate) => candidate.label.startsWith("Toyota ")));
        const candidate = input.candidates.find((item) => item.label === "Toyota Camry");
        return {
          candidate,
          confidence: "medium",
          confidenceScore: 0.73,
          autoFillEligible: false,
          exact: false,
          imageUsed: false,
          reason: "Nearest live Toyota model"
        };
      }
      assert.equal(input.task, "trim");
      if (deferTrimAi)
        await new Promise((resolve) => {
          releaseTrimAi = resolve;
        });
      assert.equal(input.imageUrl, "https://dbz-images.dubizzle.com/bmw.jpg");
      assert.match(input.facts.context, /sports seats/);
      return {
        candidate: { id: "5767", label: "M SPORT" },
        confidence: "high",
        confidenceScore: 0.95,
        autoFillEligible: true,
        exact: false,
        imageUsed: true,
        reason: "Closest live trim"
      };
    }
  },
  Math,
  navigator: {
    clipboard: {
      async writeText() {}
    }
  },
  Number,
  Object,
  open() {},
  Promise,
  setTimeout,
  String,
  URL
};
context.globalThis = context;
vm.runInNewContext(foundationSource, context);
vm.runInNewContext(coreSource, context);
vm.runInNewContext(aysheiCoreSource, context);
vm.runInNewContext(vehicleCoreSource, context);
vm.runInNewContext(groqCoreSource, context);
vm.runInNewContext(uiSource, context);

const waitForAsyncWork = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

(async () => {
  await waitForAsyncWork();

  assert.equal(elements["#queue-workspace"].hidden, false);
  assert.equal(elements["#queue-progress-title"].textContent, "Ad 1 of 1");
  assert.equal(elements["#queue-ad-vendor"].textContent, "Restored Vendor");
  assert.equal(elements["#queue-listed-make-model"].value, "Mercedes A220");
  assert.equal(elements["#queue-listed-trim-copy"].value, "Other");

  elements["#queue-open-url"].listeners.get("click")();
  await waitForAsyncWork();
  assert.deepEqual(JSON.parse(JSON.stringify(openedTabs)), [
    { active: true, url: "https://example.com/restored" }
  ]);
  assert.equal(sessionValues["luna.workQueue.adTabId"], 77);

  elements["#queue-import-text"].value = [
    ["7/28/2026", "Motors", "New Vendor", "New Advertisement", "Agent B", fillUrl].join("\t"),
    [
      "7/28/2026",
      "Motors",
      "Next Vendor",
      "Next Advertisement",
      "Agent B",
      "https://www.dubicars.com/next"
    ].join("\t"),
    [
      "7/28/2026",
      "Accessories",
      "Noon",
      "Hume Band 2.0",
      "Agent B",
      "https://www.noon.com/uae-en/the-hume-band-2-0-next-generation-smart-wearable-for-health-fitness-tracking-black/N70395452V/p/?o=eb2ee51c86e1347e"
    ].join("\t")
  ].join("\n");
  await elements["#queue-start"].listeners.get("click")();
  assert.equal(savedValues.length, 0, "Preview must not replace saved work");
  assert.equal(elements["#queue-import-preview"].hidden, false);
  await elements["#queue-confirm-import"].listeners.get("click")();

  assert.equal(savedValues.length, 1);
  const replacement = savedValues[0]["luna.workQueue.v1"];
  assert.equal(replacement.ads.length, 3);
  assert.equal(replacement.ads[0].source.vendor, "New Vendor");
  assert.equal(replacement.ads[0].status, "pending");
  assert.equal(replacement.jenkinsBatchSize, 20);
  assert.equal(elements["#queue-progress-title"].textContent, "Ad 1 of 3");
  assert.equal(elements["#queue-copy-listed"].disabled, false);
  assert.match(
    elements["#queue-listed-output"].value,
    /^https:\/\/dubai\.dubizzle\.com\/motors\/used-cars\/bmw\/840ci\/example\/\t\t\t\t\t\t\t/m
  );

  elements["#queue-open-url"].listeners.get("click")();
  await waitForAsyncWork();
  assert.equal(openedTabs.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(updatedTabs.at(-1))), {
    options: { active: true, url: fillUrl },
    tabId: 77
  });

  const tabUpdatesBeforeFill = updatedTabs.length;
  deferTrimAi = true;
  const firstFill = elements["#queue-auto-fill"].listeners.get("click")();
  for (let attempt = 0; attempt < 12 && !releaseTrimAi; attempt += 1) await waitForAsyncWork();
  assert.equal(typeof releaseTrimAi, "function", "AI trim decision should be pending");
  assert.equal(
    elements["#queue-listed-category"].value,
    "USED",
    "Page condition appears before AI finishes"
  );
  assert.equal(
    elements["#queue-listed-specs"].value,
    "GCC",
    "Page specs appear before AI finishes"
  );
  assert.equal(
    elements["#queue-listed-color"].value,
    "",
    "Unresolved plain Green must not be shown as Other"
  );
  assert.equal(elements["#queue-source-preview"].hidden, false);
  assert.match(elements["#queue-auto-fill-message"].textContent, /Vendor facts are shown first/);
  releaseTrimAi();
  deferTrimAi = false;
  await firstFill;
  await waitForAsyncWork();
  await waitForAsyncWork();
  const filledQueue = savedValues.at(-1)["luna.workQueue.v1"];
  assert.equal(filledQueue.currentIndex, 0);
  assert.equal(filledQueue.ads[0].status, "pending");
  assert.equal(filledQueue.ads[0].listed.category, "USED");
  assert.equal(filledQueue.ads[0].listed.makeModel, "BMW 840Ci");
  assert.equal(filledQueue.ads[0].listed.trim, "M SPORT");
  assert.equal(filledQueue.ads[0].listed.color, "Light Green");
  assert.equal(filledQueue.ads[0].listed.specs, "GCC");
  assert.equal(filledQueue.ads[0].listed.transmission, "AUTOMATIC");
  assert.equal(
    updatedTabs.length,
    tabUpdatesBeforeFill,
    "Safe fill must not navigate or update tabs"
  );
  assert.match(
    elements["#queue-auto-fill-message"].textContent,
    /AI matched trim, green shade using page text and the car image/
  );
  assert.match(
    elements["#queue-auto-fill-message"].textContent,
    /Status remains Pending; Luna did not save, move to Next, or run a page action/
  );

  captureOverride = { ...capturedPayload, context: `${capturedPayload.context} · second read` };
  deferTrimAi = true;
  releaseTrimAi = null;
  const editedFill = elements["#queue-auto-fill"].listeners.get("click")();
  for (let attempt = 0; attempt < 12 && !releaseTrimAi; attempt += 1) await waitForAsyncWork();
  assert.equal(typeof releaseTrimAi, "function");
  elements["#queue-listed-color"].value = "Red";
  releaseTrimAi();
  deferTrimAi = false;
  await editedFill;
  assert.equal(
    savedValues.at(-1)["luna.workQueue.v1"].ads[0].listed.color,
    "Red",
    "A user edit while AI runs must win"
  );

  captureOverride = { ...capturedPayload, facts: { ...capturedPayload.facts } };
  delete captureOverride.facts.specs;
  elements["#queue-listed-specs"].value = "";
  await elements["#queue-auto-fill"].listeners.get("click")();
  const missingSpecsAd = savedValues.at(-1)["luna.workQueue.v1"].ads[0];
  assert.equal(
    missingSpecsAd.listed.specs,
    "Other",
    "A missing vendor regional spec defaults to Other in Work Queue"
  );
  assert.deepEqual(missingSpecsAd.extractionEvidence.defaults, [
    "Specs: Other (not stated on vendor page)"
  ]);
  assert.match(
    elements["#queue-auto-fill-message"].textContent,
    /Specs defaulted to Other because the page did not state a regional spec/
  );

  captureOverride = {
    ...captureOverride,
    facts: { ...captureOverride.facts, specs: { value: "N/A" } }
  };
  elements["#queue-listed-specs"].value = "";
  await elements["#queue-auto-fill"].listeners.get("click")();
  assert.equal(
    savedValues.at(-1)["luna.workQueue.v1"].ads[0].listed.specs,
    "Other",
    "N/A is a missing regional spec"
  );

  delete captureOverride.facts.specs;
  elements["#queue-listed-specs"].value = "Canadian";
  await elements["#queue-auto-fill"].listeners.get("click")();
  assert.equal(
    savedValues.at(-1)["luna.workQueue.v1"].ads[0].listed.specs,
    "Canadian",
    "A chosen spec must not be replaced by the fallback"
  );

  captureOverride = {
    ...captureOverride,
    facts: { ...captureOverride.facts, specs: { value: "Unrecognized market specification" } }
  };
  elements["#queue-listed-specs"].value = "";
  await elements["#queue-auto-fill"].listeners.get("click")();
  assert.equal(
    savedValues.at(-1)["luna.workQueue.v1"].ads[0].listed.specs,
    "",
    "An unrecognized value stated by the page needs review, not an invented fallback"
  );

  captureOverride = {
    facts: {
      category: { value: "Used" },
      color: { value: "Black" },
      mileage: { value: "30,000 Km" },
      make: { value: "Toyota" },
      model: { value: "Land Cruiser" },
      specs: { value: "Other" },
      trim: { value: "BASE" },
      transmission: { value: "Automatic" }
    },
    context: "Toyota Land Cruiser",
    description: "Used Toyota Land Cruiser",
    imageUrl: "",
    site: "dubizzle",
    sourceUrl: fillUrl,
    summary: "Used Toyota Land Cruiser",
    title: "Toyota Land Cruiser 2024",
    version: 1
  };
  const toyota4Runner = {
    label: "Toyota 4Runner",
    make: "Toyota",
    makeCode: 10,
    model: "4Runner",
    modelCode: 40
  };
  const toyotaLandCruiser = {
    label: "Toyota Land Cruiser",
    make: "Toyota",
    makeCode: 10,
    model: "Land Cruiser",
    modelCode: 41
  };
  modelCatalogOverride = [toyota4Runner, toyotaLandCruiser];
  const callsBeforeExactModel = groqCalls;
  await elements["#queue-auto-fill"].listeners.get("click")();
  assert.equal(
    savedValues.at(-1)["luna.workQueue.v1"].ads[0].listed.makeModel,
    "Toyota Land Cruiser"
  );
  assert.equal(
    groqCalls,
    callsBeforeExactModel,
    "An exact model must not spend a model AI request"
  );

  modelCatalogOverride = [
    toyota4Runner,
    { label: "Toyota Camry", make: "Toyota", makeCode: 10, model: "Camry", modelCode: 43 }
  ];
  await elements["#queue-auto-fill"].listeners.get("click")();
  assert.equal(savedValues.at(-1)["luna.workQueue.v1"].ads[0].listed.makeModel, "Toyota 4Runner");
  assert.equal(savedValues.at(-1)["luna.workQueue.v1"].ads[0].listed.trim, "BASE");
  assert.equal(
    groqCalls,
    callsBeforeExactModel + 1,
    "Missing exact model uses one bounded model AI request"
  );
  assert.match(elements["#queue-auto-fill-message"].textContent, /nearest same-make choice/);

  modelCatalogOverride = [toyota4Runner];
  failModelAi = true;
  await elements["#queue-auto-fill"].listeners.get("click")();
  assert.equal(savedValues.at(-1)["luna.workQueue.v1"].ads[0].listed.makeModel, "Toyota 4Runner");
  assert.match(elements["#queue-auto-fill-message"].textContent, /nearest same-make choice/);
  failModelAi = false;

  modelCatalogOverride = [
    { label: "Honda Accord", make: "Honda", makeCode: 20, model: "Accord", modelCode: 21 }
  ];
  await elements["#queue-auto-fill"].listeners.get("click")();
  const noToyota = savedValues.at(-1)["luna.workQueue.v1"].ads[0];
  assert.equal(noToyota.listed.makeModel, "");
  assert.equal(noToyota.listed.trim, "");
  assert.equal(noToyota.status, "pending");
  assert.equal(groqCalls, callsBeforeExactModel + 2, "A missing make must not spend an AI request");
  captureOverride = null;
  modelCatalogOverride = null;

  const savesBeforeBodyType = savedValues.length;
  await elements["#queue-ai-body-type"].listeners.get("click")();
  assert.match(elements["#queue-ai-result"].textContent, /Body Type: Coupe/);
  assert.equal(savedValues.length, savesBeforeBodyType, "Body Type must be answer-only");

  await elements["#queue-ai-model-trim"].listeners.get("click")();
  assert.match(elements["#queue-ai-result"].textContent, /Recommendation: BMW 840Ci · M SPORT/);
  assert.equal(elements["#queue-ai-fill"].hidden, false);
  const callsBeforeRecommendationFill = groqCalls;
  await elements["#queue-ai-fill"].listeners.get("click")();
  assert.equal(
    groqCalls,
    callsBeforeRecommendationFill,
    "Fill Recommendation must not make another AI call"
  );
  assert.equal(savedValues.at(-1)["luna.workQueue.v1"].ads[0].status, "pending");
  assert.equal(
    updatedTabs.length,
    tabUpdatesBeforeFill,
    "AI tools must not navigate or update tabs"
  );
  assert.match(elements["#queue-ai-result"].textContent, /Status remains Pending/);

  await elements["#queue-mark-review"].listeners.get("click")();
  await waitForAsyncWork();
  assert.equal(savedValues.at(-1)["luna.workQueue.v1"].ads[0].status, "review_later");
  assert.equal(elements["#queue-progress-title"].textContent, "Ad 2 of 3");
  assert.equal(openedTabs.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(updatedTabs.at(-1))), {
    options: { active: true, url: "https://www.dubicars.com/next" },
    tabId: 77
  });
  assert.equal(elements["#queue-listed-specs-field"].hidden, true);
  assert.equal(elements["#queue-listed-transmission-field"].hidden, true);

  elements["#queue-listed-make-model"].value = "BMW 840";
  elements["#queue-listed-make-model"].listeners.get("keydown")({
    key: "Enter",
    preventDefault() {}
  });
  await waitForAsyncWork();
  assert.equal(elements["#queue-ayshei-model-results"].children.length, 1);

  elements["#queue-ayshei-model-results"].children[0].listeners.get("click")();
  await waitForAsyncWork();
  await waitForAsyncWork();
  assert.equal(elements["#queue-listed-make-model"].value, "BMW 840Ci");
  assert.equal(elements["#queue-listed-trim"].disabled, false);
  assert.equal(elements["#queue-listed-trim"].children.length, 4);

  elements["#queue-listed-trim"].value = "M SPORT";
  elements["#queue-listed-trim"].listeners.get("change")();
  assert.equal(elements["#queue-listed-trim-copy"].value, "M SPORT");
  elements["#queue-listed-category"].value = "USED";
  elements["#queue-listed-color"].value = "Black";
  await elements["#queue-mark-listed"].listeners.get("click")();

  const liveQueue = savedValues.at(-1)["luna.workQueue.v1"];
  assert.equal(liveQueue.ads[1].listed.makeModel, "BMW 840Ci");
  assert.equal(liveQueue.ads[1].listed.makeCode, 7);
  assert.equal(liveQueue.ads[1].listed.modelCode, 877);
  assert.equal(liveQueue.ads[1].listed.trim, "M SPORT");
  assert.equal(liveQueue.ads[1].listed.trimCode, 5767);
  assert.match(
    elements["#queue-listed-output"].value,
    /https:\/\/www\.dubicars\.com\/next\tUSED\tBMW 840Ci\tM SPORT\tBlack\tVERY_GOOD\t\t/
  );

  assert.equal(elements["#queue-progress-title"].textContent, "Ad 3 of 3");
  assert.equal(elements["#queue-motors-listed-fields"].hidden, true);
  assert.equal(elements["#queue-noon-listed-fields"].hidden, false);
  assert.equal(elements["#queue-auto-fill"].hidden, true);
  assert.equal(elements["#queue-vehicle-ai-tools"].hidden, true);
  assert.equal(elements["#queue-ai-result"].hidden, true);
  assert.equal(elements["#queue-noon-condition"].value, "NEW_WITH_TAGS");
  assert.equal(elements["#queue-noon-category"].children.length, 6);

  elements["#queue-noon-category"].value = "ELECTRONICS";
  elements["#queue-noon-category"].listeners.get("change")();
  assert.equal(elements["#queue-noon-sub-category"].disabled, false);
  assert.equal(elements["#queue-noon-sub-category"].children.length, 10);
  assert.equal(elements["#queue-noon-sub-sub-category"].disabled, true);

  elements["#queue-noon-sub-category"].value = "ACCESSORIES";
  elements["#queue-noon-sub-category"].listeners.get("change")();
  assert.equal(elements["#queue-noon-sub-sub-category"].disabled, false);
  assert.equal(elements["#queue-noon-sub-sub-category"].children.length, 8);

  elements["#queue-noon-sub-sub-category"].value = "WEARABLE_TECHNOLOGY";
  elements["#queue-noon-sub-sub-category"].listeners.get("change")();
  await elements["#queue-mark-listed"].listeners.get("click")();

  const noonQueue = savedValues.at(-1)["luna.workQueue.v1"];
  assert.equal(noonQueue.ads[2].status, "listed");
  assert.equal(noonQueue.ads[2].listed.noonCategory, "ELECTRONICS");
  assert.equal(noonQueue.ads[2].listed.noonSubCategory, "ACCESSORIES");
  assert.equal(noonQueue.ads[2].listed.noonSubSubCategory, "WEARABLE_TECHNOLOGY");
  assert.equal(noonQueue.ads[2].listed.noonCondition, "NEW_WITH_TAGS");
  assert.match(
    elements["#queue-listed-output"].value,
    /https:\/\/www\.noon\.com\/[^\t\n]+\tELECTRONICS\tACCESSORIES\tWEARABLE_TECHNOLOGY\tNEW_WITH_TAGS/
  );

  console.log("Work Queue storage tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
