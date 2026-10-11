const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/features/settings/settings-overview.js"),
  "utf8"
);

class FakeElement {
  constructor() {
    this.disabled = false;
    this.listeners = new Map();
    this.textContent = "";
  }
  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

const elements = Object.fromEntries(
  [
    "#settings-copy-diagnostics",
    "#settings-diagnostics-message",
    "#settings-luna-version",
    "#settings-storage-summary"
  ].map((selector) => [selector, new FakeElement()])
);
let copied = "";
const context = {
  Object,
  Promise,
  LunaDiagnostics: {
    async buildSafeReport({ version }) {
      return `Luna ${version} safe diagnostics\nEntries: 2/40`;
    },
    async read() {
      return [{ code: "ok" }, { code: "failed" }];
    }
  },
  LunaFoundation: {
    storage: {
      schemas: {
        activeSection: { area: "local", key: "active" },
        diagnostics: { area: "session", key: "diagnostics" },
        endpoint: { area: "local", key: "endpoint" },
        retired: { area: "local", key: "retired", retired: true },
        workQueue: { area: "local", key: "queue" }
      }
    }
  },
  chrome: {
    runtime: {
      getManifest: () => ({ version: "1.0.9" })
    },
    storage: {
      local: {
        async get(keys) {
          assert.deepEqual(JSON.parse(JSON.stringify(keys)).sort(), [
            "active",
            "endpoint",
            "queue"
          ]);
          return { endpoint: "mirror", queue: { ads: ["secret vendor"] } };
        }
      },
      onChanged: { addListener() {} }
    }
  },
  document: {
    querySelector(selector) {
      return elements[selector] || null;
    }
  },
  navigator: {
    clipboard: {
      async writeText(value) {
        copied = value;
      }
    }
  }
};
context.globalThis = context;
vm.runInNewContext(source, context);

(async () => {
  await context.LunaSettingsOverview.ready;
  assert.equal(elements["#settings-luna-version"].textContent, "1.0.9");
  assert.equal(
    elements["#settings-storage-summary"].textContent,
    "2/3 local · 2/40 diagnostic events"
  );
  assert.doesNotMatch(elements["#settings-storage-summary"].textContent, /secret|mirror/);

  await elements["#settings-copy-diagnostics"].listeners.get("click")();
  assert.match(copied, /Luna 1\.0\.9 safe diagnostics/);
  assert.doesNotMatch(copied, /endpoint|token|vendor|https?:/i);
  assert.match(elements["#settings-diagnostics-message"].textContent, /copied/);
  console.log("Settings overview and safe diagnostics tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
