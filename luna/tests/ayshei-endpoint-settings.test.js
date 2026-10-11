const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/features/settings/ayshei-endpoint-settings.js"),
  "utf8"
);

class FakeElement {
  constructor() {
    this.dataset = {};
    this.disabled = false;
    this.listeners = new Map();
    this.textContent = "";
    this.value = "";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

const elements = {
  "#settings-ayshei-endpoint": new FakeElement(),
  "#settings-ayshei-endpoint-last": new FakeElement(),
  "#settings-ayshei-endpoint-message": new FakeElement(),
  "#settings-ayshei-endpoint-status": new FakeElement(),
  "#settings-test-ayshei-endpoint": new FakeElement()
};
const savedValues = [];
let storageListener;
let testCalls = 0;
const homeRefreshEndpoints = [];
const context = {
  Date,
  Intl,
  Number,
  Object,
  Promise,
  chrome: {
    storage: {
      local: {
        async get(defaults) {
          return defaults;
        },
        async set(value) {
          savedValues.push(value);
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
  },
  LunaAyshei: {
    async testConnection() {
      testCalls += 1;
      return {
        durationMs: 42,
        endpoint: elements["#settings-ayshei-endpoint"].value,
        operation: "health"
      };
    }
  },
  LunaAysheiStatus: {
    async refresh() {
      homeRefreshEndpoints.push(elements["#settings-ayshei-endpoint"].value);
    }
  }
};
context.globalThis = context;
vm.runInNewContext(source, context);

(async () => {
  await context.LunaAysheiEndpointSettings.ready;
  const select = elements["#settings-ayshei-endpoint"];
  const status = elements["#settings-ayshei-endpoint-status"];
  const message = elements["#settings-ayshei-endpoint-message"];
  const testButton = elements["#settings-test-ayshei-endpoint"];

  assert.equal(select.value, "mirror");
  assert.equal(status.textContent, "Mirror selected");
  assert.match(message.textContent, /only endpoint used/);
  assert.match(message.textContent, /does not combine/);

  select.value = "original";
  await select.listeners.get("change")();
  assert.deepEqual(JSON.parse(JSON.stringify(savedValues)), [
    { "luna.aysheiEndpoint.v1": "original" }
  ]);
  assert.equal(status.textContent, "Original selected");
  assert.equal(testCalls, 0, "Changing selection must not run the Settings test");
  assert.deepEqual(homeRefreshEndpoints, ["original"]);

  await testButton.listeners.get("click")();
  assert.equal(testCalls, 1);
  assert.equal(select.value, "original");
  assert.match(message.textContent, /Original responded in 42 ms/);

  storageListener(
    {
      "luna.aysheiEndpointStatus.v1": {
        newValue: {
          durationMs: 51,
          endpoint: "original",
          lastSuccessAt: "2026-08-24T12:00:00.000Z",
          version: 1
        }
      }
    },
    "local"
  );
  assert.match(
    elements["#settings-ayshei-endpoint-last"].textContent,
    /Last successful request: Original · 51 ms/
  );

  select.value = "https://unsafe.example";
  await select.listeners.get("change")();
  assert.equal(select.value, "mirror");
  assert.equal(savedValues[1]["luna.aysheiEndpoint.v1"], "mirror");
  console.log("Ayshei endpoint settings tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
