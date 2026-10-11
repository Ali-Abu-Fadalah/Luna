const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/features/settings/permission-settings.js"),
  "utf8"
);

class FakeElement {
  constructor() {
    this.dataset = {};
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
    "#settings-enable-websites",
    "#settings-revoke-websites",
    "#settings-websites-message",
    "#settings-websites-status"
  ].map((selector) => [selector, new FakeElement()])
);
const permissionCalls = [];
let enabled = false;
const context = {
  Object,
  Promise,
  chrome: {
    permissions: {
      async contains(value) {
        permissionCalls.push({ operation: "contains", value });
        return enabled;
      },
      async remove(value) {
        permissionCalls.push({ operation: "remove", value });
        enabled = false;
        return true;
      },
      async request(value) {
        permissionCalls.push({ operation: "request", value });
        enabled = true;
        return true;
      },
      onAdded: { addListener() {} },
      onRemoved: { addListener() {} }
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
  await context.LunaPermissionSettings.ready;
  assert.equal(elements["#settings-websites-status"].textContent, "Built-in sites only");
  assert.equal(elements["#settings-revoke-websites"].disabled, true);

  await elements["#settings-enable-websites"].listeners.get("click")();
  assert.equal(elements["#settings-websites-status"].textContent, "Other sites enabled");
  assert.equal(elements["#settings-enable-websites"].disabled, true);
  const request = permissionCalls.find((call) => call.operation === "request");
  assert.deepEqual(JSON.parse(JSON.stringify(request.value.origins)), ["https://*/*"]);

  await elements["#settings-revoke-websites"].listeners.get("click")();
  assert.equal(elements["#settings-websites-status"].textContent, "Built-in sites only");
  assert.equal(elements["#settings-revoke-websites"].disabled, true);
  assert.equal(permissionCalls.filter((call) => call.operation === "remove").length, 1);
  console.log("Website permission settings tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
