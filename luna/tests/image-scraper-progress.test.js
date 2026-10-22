const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

test("saved-cover progress is scoped to the active upload, delivered once and cleaned up", async () => {
  class Element {
    constructor() {
      this.dataset = {};
      this.classList = { toggle() {} };
    }
    addEventListener() {}
    setAttribute() {}
    append() {}
    replaceChildren() {}
  }
  let finishUpload;
  let uploadRequest;
  let started;
  const sent = new Promise((resolve) => {
    started = resolve;
  });
  const listeners = new Set();
  const context = {
    setTimeout,
    clearTimeout,
    document: { querySelector: () => new Element(), createElement: () => new Element() },
    LunaImageScraperCore: {
      sanitizeCapture: (capture) => capture,
      validate: () => ({ isReady: true, message: "Ready", imageCount: 3 })
    },
    chrome: {
      storage: { local: { get: async () => ({}), set: async () => {} } },
      runtime: {
        id: "luna-test",
        onMessage: {
          addListener: (listener) => listeners.add(listener),
          removeListener: (listener) => listeners.delete(listener)
        }
      },
      scripting: { executeScript: async () => {} },
      tabs: {
        sendMessage: async (_tab, request) => {
          uploadRequest = request;
          started();
          return new Promise((resolve) => {
            finishUpload = resolve;
          });
        }
      }
    }
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/features/images/image-scraper.js"), "utf8"),
    context
  );
  await context.LunaImageScraper.loadReviewedCapture({
    images: [1, 2, 3].map((id) => ({ id, url: `https://images.example/${id}.jpg` }))
  });
  let selected = 0,
    main = 0,
    completed = false;
  const uploading = context.LunaImageScraper.uploadToAysheiTab(
    7,
    () => selected++,
    () => main++
  ).then(() => {
    completed = true;
  });
  await sent;
  assert.equal(uploadRequest.type, "luna.imageScraper.upload.v2");
  const emit = (type, overrides = {}, sender = { id: "luna-test", tab: { id: 7 } }) => {
    for (const listener of listeners)
      listener({ type, uploadId: uploadRequest.uploadId, count: 3, ...overrides }, sender);
  };
  emit("luna.imageScraper.selected");
  assert.equal(selected, 1);
  assert.equal(main, 0, "Selected files are not saved cover receipts.");
  emit("luna.imageScraper.mainRetained", { uploadId: "another-upload" });
  emit("luna.imageScraper.mainRetained", {}, { id: "another-extension", tab: { id: 7 } });
  emit("luna.imageScraper.mainRetained", {}, { id: "luna-test", tab: { id: 8 } });
  assert.equal(main, 0);
  emit("luna.imageScraper.mainRetained");
  emit("luna.imageScraper.mainRetained");
  emit("luna.imageScraper.selected");
  assert.equal(main, 1);
  assert.equal(selected, 1);
  assert.equal(completed, false, "Cover progress does not finish the upload.");
  finishUpload({ ok: true, result: { retained: true, imported: 3 } });
  await uploading;
  assert.equal(listeners.size, 0);
  assert.equal(completed, true);
});
