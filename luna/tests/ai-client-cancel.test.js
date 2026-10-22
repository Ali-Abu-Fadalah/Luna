const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { webcrypto } = require("node:crypto");
const source = fs.readFileSync(path.join(__dirname, "../src/services/ai/groq-client.js"), "utf8");

test("client forwards cancellation to the matching background request and clears its wait", async () => {
  const messages = [];
  const context = {
    AbortController,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
    chrome: {
      runtime: {
        sendMessage(message) {
          messages.push(message);
          return message.operation === "cancel"
            ? Promise.resolve({ ok: true, data: {} })
            : new Promise(() => {});
        }
      }
    }
  };
  vm.runInNewContext(source, context);
  const controller = new AbortController();
  const pending = context.LunaGroq.analyze(
    { task: "bodyType" },
    { signal: controller.signal, sourceScope: "ad-1" }
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.deepEqual(
    messages.map((message) => message.operation),
    ["analyze", "cancel"]
  );
  assert.equal(messages[0].requestId, messages[1].requestId);
  assert.equal(messages[0].sourceScope, "ad-1");
  assert.equal(messages[0].timeoutMs, 14500);
});

test("expired/cancelled work never reaches the background; successful legacy analyze calls remain supported", async () => {
  let calls = 0;
  const context = {
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
    chrome: {
      runtime: {
        sendMessage: async () => {
          calls++;
          return { ok: true, data: { bodyType: "Sedan" } };
        }
      }
    }
  };
  vm.runInNewContext(source, context);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(context.LunaGroq.analyze({}, { signal: controller.signal }), {
    name: "AbortError"
  });
  await assert.rejects(context.LunaGroq.analyze({}, { deadline: Date.now() + 50 }), {
    name: "AbortError"
  });
  assert.equal(calls, 0);
  assert.equal((await context.LunaGroq.analyze({ task: "bodyType" })).bodyType, "Sedan");
  assert.equal(calls, 1);
});
