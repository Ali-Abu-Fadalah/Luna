const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const foundationSource = fs.readFileSync(
  path.resolve(__dirname, "../src/shared/foundation.js"),
  "utf8"
);
const diagnosticsSource = fs.readFileSync(
  path.resolve(__dirname, "../src/shared/diagnostics.js"),
  "utf8"
);
const sessionState = {};
const context = {
  chrome: {
    storage: {
      session: {
        async get(defaults) {
          return { ...defaults, ...sessionState };
        },
        async set(values) {
          Object.assign(sessionState, JSON.parse(JSON.stringify(values)));
        }
      }
    }
  },
  Date,
  Number,
  Object,
  Promise,
  String,
  TypeError,
  URL
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(foundationSource, context);
vm.runInContext(diagnosticsSource, context);

(async () => {
  const foundation = context.LunaFoundation;
  assert.equal(foundation.storageKeys.workQueue, "luna.workQueue.v1");
  assert.equal(foundation.storageKeys.workQueueNotes, "luna.workQueueNotes.v1");
  assert.equal(foundation.storageKeys.aysheiEndpointStatus, "luna.aysheiEndpointStatus.v1");
  assert.equal(foundation.storageKeys.inventory, "luna.inventoryChecker.v1");
  assert.equal(foundation.storageKeys.imageDraft, "luna.imageScraper.draft.v1");
  assert.equal(foundation.storageKeys.manualAdDraft, "luna.manualAd.draft.v2");
  assert.equal(foundation.storageKeys.retiredAysheiLookupCache, "luna.aysheiLookup.v1");
  assert.equal(foundation.storage.schemas.retiredAysheiLookupCache.retired, true);
  assert.equal(foundation.storage.schemas.diagnostics.area, "session");
  assert.equal(foundation.storage.schemas.groqApiKeySession, undefined);
  assert.equal(foundation.storage.schemas.groqWorkerUrl.area, "sync");
  assert.equal(foundation.storage.schemas.aiProviderKeys.area, "local");
  assert.equal(foundation.storage.schemas.groqClientId.area, "local");
  assert.equal(foundation.storage.schemas.workQueueNotes.version, 1);
  assert.equal(foundation.messageTypes.groq, "luna.groq");

  assert.equal(
    foundation.urls.identity("HTTPS://Example.com/car/42/?b=2&utm_source=mail&a=1#gallery"),
    "https://example.com/car/42?a=1&b=2"
  );
  assert.equal(foundation.urls.identity("chrome://extensions"), "");
  assert.equal(
    foundation.tabs.validateActive(
      { id: 7, url: "https://example.com/car/42/" },
      { expectedUrl: "https://example.com/car/42" }
    ).ok,
    true
  );
  assert.equal(
    foundation.tabs.validateActive(
      { id: 7, url: "https://example.com/car/43" },
      { expectedUrl: "https://example.com/car/42" }
    ).reason,
    "url-mismatch"
  );

  const status = { dataset: {}, textContent: "" };
  assert.equal(
    foundation.status.render(status, {
      datasetKey: "testState",
      label: "Ready",
      state: "connected"
    }),
    true
  );
  assert.equal(status.textContent, "Ready");
  assert.equal(status.dataset.testState, "connected");

  const adapter = foundation.adapters.define("listing", {
    collect() {
      return [];
    },
    id: "example-listings",
    supports() {
      return true;
    }
  });
  assert.equal(adapter.kind, "listing");
  assert.throws(
    () => foundation.adapters.define("image", { id: "broken-adapter" }),
    /must implement/
  );

  await context.LunaDiagnostics.record({
    area: "ayshei",
    code: "connection-ok"
  });
  await context.LunaDiagnostics.record({
    area: "https://sensitive.example/car/42",
    code: "token=secret",
    level: "error"
  });
  const entries = await context.LunaDiagnostics.read();
  assert.equal(entries.length, 2);
  assert.deepEqual(
    { area: entries[1].area, code: entries[1].code },
    { area: "unknown", code: "unknown" }
  );
  assert.doesNotMatch(JSON.stringify(sessionState), /sensitive|secret|https:/);
  const report = await context.LunaDiagnostics.buildSafeReport({
    version: "1.0.9"
  });
  assert.match(report, /Luna 1\.0\.9 safe diagnostics/);
  assert.doesNotMatch(report, /sensitive|secret|https:|endpoint/i);

  console.log("Luna shared foundation tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
