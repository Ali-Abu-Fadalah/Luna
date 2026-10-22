const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assistant = fs.readFileSync(
  path.join(__dirname, "../src/features/manual-ad/manual-ad-assistant.js"),
  "utf8"
);
const prepareSource = assistant.slice(
  assistant.indexOf("  const prepare = async () =>"),
  assistant.indexOf("  const panelLabels =")
);

test("Manual Ad keeps completed enrichment and agent edits when a later stage times out", async () => {
  let startedLateStage,
    cancelObserved = false,
    callsAfterTimeout = 0;
  const context = {
    AbortController,
    URL,
    setTimeout,
    clearTimeout,
    prepareRun: 0,
    prepareController: null,
    draft: null,
    prepareBusy: false,
    startButton: {},
    fieldLabels: { bodyType: "Body Type", price: "Price" },
    clearCompletedWorkflow: async () => {},
    getCurrentTab: async () => ({ id: 1 }),
    findAysheiTargetTab: async () => ({ id: 2 }),
    inspectAysheiTab: async () => ({ used: false }),
    captureVendorPage: async () => ({
      sourceUrl: "https://alwanworld.com/car",
      bodyType: "",
      price: "100",
      evidence: {}
    }),
    saveDraft: async () => {},
    render() {},
    renderValidation() {},
    setStatus() {},
    setMessage() {},
    isAiEvidence: (value) => value?.state === "review",
    chrome: { permissions: { contains: async () => true } },
    LunaImageScraper: { collectForManualAd: async () => ({ isReady: true, imageCount: 20 }) },
    improveMissingDescription: async (capture) => {
      capture.bodyType = "SUV";
      capture.evidence.bodyType = { state: "review", source: "AI" };
      context.draft.price = "200"; // Agent review while enrichment is running.
    },
    resolveVehicle: async (capture) => {
      startedLateStage = capture.aiRequestOptions.signal;
      capture.aiRequestOptions.signal.addEventListener("abort", () => {
        cancelObserved = true;
      });
      await new Promise(() => {});
    },
    resolveGreenShade: async () => {
      callsAfterTimeout++;
    },
    resolveMissingBodyType: async () => {
      callsAfterTimeout++;
    },
    resolveMissingFields: async () => {
      callsAfterTimeout++;
    }
  };
  vm.createContext(context);
  for (const name of [
    "manual-ad-core.js",
    "manual-ad-price-core.js",
    "manual-ad-description-core.js"
  ]) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/features/manual-ad", name), "utf8"),
      context
    );
  }
  // Only enrichment is deliberately timed out; source capture and images complete normally.
  context.withTimeout = (promise, _, message, cancel) => {
    if (!cancel) return promise;
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => {
          cancel();
          reject(new Error(message));
        }, 10)
      )
    ]);
  };
  vm.runInContext(prepareSource + "\nglobalThis.runPrepare = prepare;", context);
  await context.runPrepare();
  assert.equal(context.draft.bodyType, "SUV");
  assert.equal(context.draft.price, "200");
  assert.equal(context.draft.evidence.bodyType.state, "review");
  assert.equal(startedLateStage.aborted, true);
  assert.equal(cancelObserved, true);
  assert.equal(callsAfterTimeout, 0);
  assert.equal(context.prepareBusy, false);
  assert.equal(context.startButton.disabled, false);
  assert.equal(JSON.stringify(context.draft).includes("aiRequestOptions"), false);
});
