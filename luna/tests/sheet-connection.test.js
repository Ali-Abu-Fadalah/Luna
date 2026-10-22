const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/sheet-connection.js"),
  "utf8"
);
const html = fs.readFileSync(path.resolve(__dirname, "../sidepanel.html"), "utf8");

assert.match(html, /id="sheet-date-window"[^>]+min="1"[^>]+max="30"[^>]+value="10"/);
assert.match(html, /id="sheet-date-window"[^>]*aria-describedby="sheet-date-window-help"/);
assert.match(html, /id="sheet-date-window-help"/);

class FakeElement {
  constructor(textContent = "") {
    this.dataset = {};
    this.disabled = false;
    this.listeners = new Map();
    this.textContent = textContent;
    this.value = "";
  }

  addEventListener(eventName, listener) {
    this.listeners.set(eventName, listener);
  }
}

const waitForAsyncWork = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const createController = (testConnection, { cache = null, now = () => Date.now() } = {}) => {
  const elements = {
    "#home-sheet-detail": new FakeElement(),
    "#home-sheet-status": new FakeElement("Loading"),
    "#settings-sheet-status": new FakeElement("Loading"),
    "#settings-test-connection": new FakeElement(),
    "#sheet-connection-detail": new FakeElement(),
    "#sheet-connection-refresh": new FakeElement(),
    "#sheet-connection-rows": new FakeElement("0"),
    "#sheet-connection-status": new FakeElement("Loading"),
    "#sheet-connection-tab": new FakeElement("Checking..."),
    "#sheet-date-window": new FakeElement()
  };
  elements["#sheet-date-window"].value = "10";
  const storageState = {
    "luna.sheetCache.v1": cache
  };
  const context = {
    chrome: {
      storage: {
        local: {
          async get(defaults) {
            return { ...defaults, ...storageState };
          },
          async set(values) {
            Object.assign(storageState, values);
          }
        }
      }
    },
    console: {
      error() {}
    },
    Date: class extends Date {
      static now() {
        return now();
      }
    },
    document: {
      querySelector(selector) {
        assert.ok(Object.hasOwn(elements, selector));
        return elements[selector];
      }
    },
    LunaSheet: {
      normalizeWindowDays(value) {
        const days = Number(value);
        return Number.isInteger(days) ? Math.min(30, Math.max(1, days)) : 10;
      },
      testConnection,
      validatePayload(payload) {
        if (payload?.ok !== true || !payload.connection || !Array.isArray(payload.rows)) {
          throw new Error("Invalid cached payload");
        }
        return payload;
      }
    },
    Object
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);

  return { context, elements, storageState };
};

(async () => {
  let successfulRequests = 0;
  const connected = createController(async (windowDays) => {
    successfulRequests += 1;

    return {
      connection: {
        missingTabs: [],
        tab: "July",
        timeZone: "Asia/Dubai",
        windowDays
      },
      ok: true,
      rows: [{ date: "2026-07-27" }, { date: "2026-07-28" }]
    };
  });

  await waitForAsyncWork();

  assert.equal(successfulRequests, 1);
  assert.equal(connected.elements["#home-sheet-status"].textContent, "Connected");
  assert.equal(connected.elements["#sheet-connection-status"].textContent, "Connected");
  assert.equal(connected.elements["#settings-sheet-status"].textContent, "Connected");
  assert.equal(connected.elements["#sheet-connection-status"].dataset.connectionState, "connected");
  assert.equal(connected.elements["#sheet-connection-tab"].textContent, "July");
  assert.equal(connected.elements["#sheet-connection-rows"].textContent, "2");
  assert.match(connected.elements["#home-sheet-detail"].textContent, /Live 2 rows/);
  assert.match(connected.elements["#sheet-connection-detail"].textContent, /last 10 UAE days/);
  assert.equal(connected.elements["#sheet-date-window"].value, "10");
  assert.equal(connected.context.LunaConnection.isDataState("connected"), true);
  assert.equal(connected.context.LunaConnection.isDataState("refreshing"), true);
  assert.equal(connected.context.LunaConnection.isDataState("cached"), true);
  assert.equal(connected.context.LunaConnection.isDataState("failed"), false);

  connected.elements["#sheet-date-window"].value = "30";
  await connected.elements["#sheet-date-window"].listeners.get("change")();
  assert.equal(successfulRequests, 2);
  assert.match(connected.elements["#sheet-connection-detail"].textContent, /last 30 UAE days/);

  const snapshots = [];
  const unsubscribe = connected.context.LunaConnection.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });
  assert.equal(snapshots[0].state, "connected");
  assert.equal(snapshots[0].payload.rows.length, 2);
  unsubscribe();

  await connected.elements["#settings-test-connection"].listeners.get("click")();
  assert.equal(successfulRequests, 3);

  const missingMonth = createController(async (windowDays) => ({
    connection: {
      missingTabs: ["August"],
      tab: "July",
      timeZone: "Asia/Dubai",
      windowDays
    },
    ok: true,
    rows: [{ date: "2026-07-31" }]
  }));

  await waitForAsyncWork();
  assert.equal(missingMonth.elements["#sheet-connection-status"].textContent, "Connected");
  assert.equal(missingMonth.elements["#sheet-connection-tab"].textContent, "July");
  assert.match(
    missingMonth.elements["#sheet-connection-detail"].textContent,
    /August tab is not available yet and was skipped/
  );

  const failed = createController(async () => {
    throw new Error("Not signed in");
  });

  await waitForAsyncWork();

  assert.equal(failed.elements["#home-sheet-status"].textContent, "Connection failed");
  assert.equal(failed.elements["#sheet-connection-status"].dataset.connectionState, "failed");
  assert.equal(failed.elements["#sheet-connection-rows"].textContent, "0");
  assert.equal(
    failed.elements["#home-sheet-detail"].textContent,
    "No live or recent saved Sheet data."
  );

  let finishInvalidCacheRefresh;
  const invalidCache = createController(
    () =>
      new Promise((resolve) => {
        finishInvalidCacheRefresh = resolve;
      }),
    {
      cache: {
        version: 2,
        windows: {
          10: {
            payload: { ok: false, rows: [] },
            savedAt: Date.now()
          }
        }
      }
    }
  );
  await waitForAsyncWork();
  assert.equal(invalidCache.elements["#sheet-connection-status"].textContent, "Loading");
  assert.equal(invalidCache.elements["#sheet-connection-rows"].textContent, "0");
  finishInvalidCacheRefresh({
    connection: {
      generatedAt: "2026-08-02T09:29:00+04:00",
      missingTabs: [],
      tab: "August",
      timeZone: "Asia/Dubai",
      windowDays: 10
    },
    ok: true,
    rows: []
  });
  await waitForAsyncWork();

  let finishCachedRefresh;
  const cachedPayload = {
    connection: {
      generatedAt: "2026-08-02T09:30:00+04:00",
      missingTabs: [],
      tab: "July + August",
      timeZone: "Asia/Dubai",
      windowDays: 10
    },
    ok: true,
    rows: [{ date: "2026-08-01" }, { date: "2026-08-02" }]
  };
  const cachedController = createController(
    () =>
      new Promise((resolve) => {
        finishCachedRefresh = resolve;
      }),
    {
      cache: {
        version: 2,
        windows: {
          10: {
            payload: cachedPayload,
            savedAt: Date.now()
          }
        }
      }
    }
  );

  const oldDateCache = createController(
    async () => {
      throw new Error("Offline");
    },
    {
      cache: { version: 1, windows: { 10: { payload: cachedPayload, savedAt: Date.now() } } }
    }
  );
  await waitForAsyncWork();
  assert.equal(oldDateCache.elements["#sheet-connection-status"].textContent, "Connection failed");
  assert.equal(oldDateCache.elements["#sheet-connection-rows"].textContent, "0");

  await waitForAsyncWork();
  assert.equal(cachedController.elements["#sheet-connection-status"].textContent, "Refreshing");
  assert.equal(
    cachedController.elements["#sheet-connection-status"].dataset.connectionState,
    "refreshing"
  );
  assert.equal(cachedController.elements["#sheet-connection-rows"].textContent, "2");
  assert.equal(cachedController.elements["#sheet-connection-tab"].textContent, "July + August");
  assert.match(
    cachedController.elements["#sheet-connection-detail"].textContent,
    /saved rows while Luna refreshes live data/
  );

  const freshPayload = {
    connection: {
      generatedAt: "2026-08-02T09:31:00+04:00",
      missingTabs: [],
      tab: "August",
      timeZone: "Asia/Dubai",
      windowDays: 10
    },
    ok: true,
    rows: [{ date: "2026-08-02" }]
  };
  finishCachedRefresh(freshPayload);
  await waitForAsyncWork();
  assert.equal(cachedController.elements["#sheet-connection-status"].textContent, "Connected");
  assert.equal(cachedController.elements["#sheet-connection-rows"].textContent, "1");
  assert.equal(
    cachedController.storageState["luna.sheetCache.v1"].windows["10"].payload.connection.tab,
    "August"
  );

  const cachedFailure = createController(
    async () => {
      throw new Error("The Sheet service did not respond within 20 seconds.");
    },
    {
      cache: {
        version: 2,
        windows: {
          10: {
            payload: cachedPayload,
            savedAt: Date.now()
          }
        }
      }
    }
  );
  await waitForAsyncWork();
  assert.equal(cachedFailure.elements["#sheet-connection-status"].textContent, "Saved data");
  assert.equal(
    cachedFailure.elements["#sheet-connection-status"].dataset.connectionState,
    "cached"
  );
  assert.equal(cachedFailure.elements["#sheet-connection-rows"].textContent, "2");
  assert.match(
    cachedFailure.elements["#sheet-connection-detail"].textContent,
    /Use Refresh Connection to try again/
  );
  assert.match(cachedFailure.elements["#home-sheet-detail"].textContent, /Saved 2 rows/);

  let recoveryRequests = 0;
  const recovered = createController(async () => {
    if (++recoveryRequests === 1) throw new Error("Temporary network failure");
    return freshPayload;
  });
  await waitForAsyncWork();
  assert.equal(recovered.elements["#sheet-connection-status"].textContent, "Connection failed");
  assert.match(
    recovered.elements["#sheet-connection-detail"].textContent,
    /Temporary network failure/
  );
  const recoverySnapshots = [];
  recovered.context.LunaConnection.subscribe((snapshot) => recoverySnapshots.push(snapshot));
  await recovered.context.LunaConnection.onSectionShown("sheet-statistics");
  assert.equal(recoveryRequests, 2, "Opening Insights retries a failed startup request.");
  assert.equal(recovered.elements["#sheet-connection-status"].textContent, "Connected");
  assert.equal(
    recoverySnapshots.at(-1).payload,
    freshPayload,
    "Vendor and Tracker subscribers receive recovered data."
  );
  await recovered.context.LunaConnection.ensureLoaded();
  assert.equal(recoveryRequests, 2, "Switching a healthy view reuses fresh data.");

  let finishSharedRequest;
  let sharedRequests = 0;
  const shared = createController(() => {
    sharedRequests++;
    return new Promise((resolve) => {
      finishSharedRequest = resolve;
    });
  });
  await waitForAsyncWork();
  const waitingRefresh = shared.context.LunaConnection.testConnection();
  const waitingView = shared.context.LunaConnection.ensureLoaded();
  finishSharedRequest(freshPayload);
  assert.equal(
    await waitingRefresh,
    freshPayload,
    "Refresh waits for the live result during startup."
  );
  assert.equal(await waitingView, freshPayload, "View navigation also awaits the live result.");
  assert.equal(sharedRequests, 1, "Startup, view navigation and refresh share one request.");

  let clock = Date.now();
  let staleRequests = 0;
  const stale = createController(
    async () => {
      staleRequests++;
      return freshPayload;
    },
    { now: () => clock }
  );
  await waitForAsyncWork();
  clock += 5 * 60 * 1000 + 1;
  await stale.context.LunaConnection.onSectionShown("sheet-statistics");
  assert.equal(staleRequests, 2, "Returning to Insights refreshes an aged live snapshot.");

  console.log("Sheet connection UI tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
