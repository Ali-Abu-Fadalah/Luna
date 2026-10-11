const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
let listener;
let networkCalls = 0;
const context = {
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  Uint8Array,
  btoa,
  chrome: {
    runtime: {
      id: "public-test",
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: {
        addListener(fn) {
          listener = fn;
        }
      }
    },
    sidePanel: {
      setPanelBehavior() {
        return Promise.resolve();
      }
    },
    storage: {}
  },
  importScripts() {},
  LunaFoundation: { messageTypes: { groq: "ai", aysheiLookup: "catalog", imageFetch: "image" } },
  fetch: async () => {
    networkCalls++;
    throw new Error("Test blocks network.");
  }
};
context.globalThis = context;
vm.runInNewContext(
  fs.readFileSync(path.resolve(__dirname, "../src/background/background.js"), "utf8"),
  context
);
for (const type of ["ai", "catalog"]) {
  let response;
  listener(
    { type, operation: "analyze", apiKey: "synthetic" },
    { id: "public-test" },
    (value) => (response = value)
  );
  assert.equal(response.ok, false);
  assert.match(response.detail, /not included/);
}
assert.equal(networkCalls, 0, "Private integration requests must never contact a service.");
let status;
listener({ type: "ai", operation: "status" }, { id: "public-test" }, (value) => (status = value));
assert.equal(status.data.workerUrl, "");
assert.equal(status.data.localProviders.groq, false);
listener({ type: "image", url: "https://example.org/car.png" }, { id: "foreign-extension" }, () => {
  throw new Error("Foreign caller was accepted.");
});
assert.equal(networkCalls, 0);
(async () => {
  for (const url of [
    "http://example.org/car.png",
    "https://127.0.0.1/car.png",
    "https://user:password@example.org/car.png",
    "https://localhost/car.png",
    "https://unapproved.example.org/car.png"
  ]) {
    const response = await new Promise((resolve) =>
      listener({ type: "image", url }, { id: "public-test" }, resolve)
    );
    assert.equal(response.ok, false);
  }
  assert.equal(networkCalls, 0, "Unsafe image URLs must fail before a request.");
  console.log("Public background security tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
