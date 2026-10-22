const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/features/settings/groq-settings.js"),
  "utf8"
);
const workerUrl = "https://luna-groq-proxy.example.workers.dev";

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

const selectors = [
  "#settings-groq-worker-url",
  "#settings-save-groq-worker-url",
  "#settings-test-groq",
  "#settings-clear-groq-worker-url",
  "#settings-groq-status",
  "#settings-groq-message",
  "#settings-local-ai-status",
  "#settings-local-ai-message",
  ...["groq", "gemini", "openrouter"].flatMap((provider) => [
    `#settings-local-${provider}-key`,
    `#settings-save-local-${provider}`,
    `#settings-test-local-${provider}`,
    `#settings-clear-local-${provider}`,
    `#settings-local-${provider}-status`,
    `#settings-local-${provider}-message`
  ])
];
const elements = Object.fromEntries(selectors.map((selector) => [selector, new FakeElement()]));
let testShouldFail = false;
let workerConfigured = true;
const localProviders = { groq: false, gemini: false, openrouter: false };
const context = {
  LunaGroq: {
    async clearWorkerUrl() {
      workerConfigured = false;
    },
    async clearLocalKey(provider) {
      localProviders[provider] = false;
      return { localProviders };
    },
    async saveLocalKey(provider, value) {
      assert.equal(value, "runtime-key");
      localProviders[provider] = true;
      return { localProviders };
    },
    async saveWorkerUrl(value) {
      assert.equal(value, workerUrl);
      workerConfigured = true;
      return { configured: true, host: "luna-groq-proxy.example.workers.dev", workerUrl };
    },
    async status() {
      return {
        configured: workerConfigured,
        host: workerConfigured ? "luna-groq-proxy.example.workers.dev" : "",
        localProviders,
        workerUrl: workerConfigured ? workerUrl : ""
      };
    },
    async test() {
      if (testShouldFail) throw new Error("Groq connection failed.");
      return {
        configured: true,
        host: "luna-groq-proxy.example.workers.dev",
        model: "qwen/qwen3.8-27b",
        providers: { groq: true, gemini: true, openrouter: true },
        workerUrl
      };
    },
    async testLocalProvider(provider) {
      return { provider: provider === "groq" ? "Groq" : provider, model: "qwen/qwen3.8-27b" };
    }
  },
  Object,
  Promise,
  document: {
    querySelector(selector) {
      return elements[selector] || null;
    }
  }
};
context.globalThis = context;
vm.runInNewContext(source, context);

(async () => {
  await context.LunaGroqSettings.ready;
  const input = elements["#settings-groq-worker-url"];
  const badge = elements["#settings-groq-status"];
  const message = elements["#settings-groq-message"];

  assert.equal(input.value, workerUrl);
  assert.equal(badge.dataset.groqState, "saved");
  assert.equal(badge.textContent, "Saved · not tested");

  await elements["#settings-save-groq-worker-url"].listeners.get("click")();
  assert.equal(input.value, workerUrl, "Saving must keep the non-secret Worker URL visible");
  assert.equal(badge.dataset.groqState, "connected");
  assert.equal(badge.textContent, "AI Router connected");
  assert.match(message.textContent, /AI Router connected/);
  assert.match(message.textContent, /groq, gemini, openrouter verified/);

  testShouldFail = true;
  await elements["#settings-test-groq"].listeners.get("click")();
  assert.equal(input.value, workerUrl);
  assert.equal(badge.dataset.groqState, "error");
  assert.equal(badge.textContent, "Connection failed");
  assert.equal(message.textContent, "Groq connection failed.");

  await elements["#settings-clear-groq-worker-url"].listeners.get("click")();
  assert.equal(input.value, "");
  assert.equal(badge.dataset.groqState, "missing");
  const localInput = elements["#settings-local-groq-key"];
  localInput.value = "runtime-key";
  await elements["#settings-save-local-groq"].listeners.get("click")();
  assert.equal(localInput.value, "", "Saved API keys must never be re-displayed");
  assert.equal(elements["#settings-local-groq-status"].textContent, "Saved");
  assert.equal(elements["#settings-local-ai-status"].textContent, "1 local key saved");
  context.LunaGroq.testLocalProvider = async () => ({
    provider: "Groq",
    verifiedModels: ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
    unavailableModels: [{ model: "openai/gpt-oss-120b", detail: "Not enabled" }]
  });
  await elements["#settings-test-local-groq"].listeners.get("click")();
  assert.equal(elements["#settings-local-groq-status"].textContent, "Verified");
  assert.match(
    elements["#settings-local-groq-message"].textContent,
    /Verified: qwen\/qwen3.8-27b, openai\/gpt-oss-20b/
  );
  assert.match(
    elements["#settings-local-groq-message"].textContent,
    /Unavailable: openai\/gpt-oss-120b/
  );
  await elements["#settings-clear-local-groq"].listeners.get("click")();
  assert.equal(elements["#settings-local-groq-status"].textContent, "Not saved");
  console.log("AI Router Settings connection-state tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
