const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/sheet-client.js"),
  "utf8"
);
const endpoint = "https://sheet.example.invalid/read";

const makeResponse = ({
  contentType = "application/json; charset=utf-8",
  ok = true,
  payload = {
    ok: true,
    connection: {
      tab: "July",
      timeZone: "Asia/Dubai",
      windowDays: 10
    },
    rows: [{ date: "2026-07-27" }]
  },
  status = 200
} = {}) => ({
  headers: {
    get(name) {
      return name.toLowerCase() === "content-type" ? contentType : null;
    }
  },
  async json() {
    return payload;
  },
  ok,
  status
});

const runClient = (fetchImplementation, overrides = {}) => {
  const context = {
    AbortController,
    clearTimeout,
    Error,
    fetch: fetchImplementation,
    LunaConfig: { sheetEndpoint: endpoint },
    Object,
    URLSearchParams,
    setTimeout,
    ...overrides
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.LunaSheet;
};

(async () => {
  const requests = [];
  const client = runClient(async (url, options) => {
    requests.push({ options, url });
    return makeResponse();
  });
  const payload = await client.testConnection();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${endpoint}?days=10`);
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[0].options.credentials, "include");
  assert.equal(requests[0].options.cache, "default");
  assert.equal(typeof requests[0].options.signal, "object");
  assert.equal(Object.hasOwn(requests[0].options, "body"), false);
  assert.equal(payload.ok, true);
  assert.equal(payload.rows.length, 1);
  assert.equal(client.normalizeWindowDays(0), 1);
  assert.equal(client.normalizeWindowDays(31), 30);
  assert.equal(client.normalizeWindowDays(""), 10);
  assert.equal(client.normalizeWindowDays("invalid"), 10);

  await client.testConnection(30, { force: true });
  assert.equal(requests[1].url, `${endpoint}?days=30`);
  assert.equal(requests[1].options.cache, "no-store");
  assert.equal(client.requestTimeoutMilliseconds, 20000);

  await client.getMonthlyPerformance({ force: true });
  assert.equal(requests[2].url, `${endpoint}?days=10&mode=month`);

  await client.getMonthlyPerformance({ force: true, month: "September" });
  assert.equal(requests[3].url, `${endpoint}?days=10&mode=month&month=September`);

  await client.getDailyInteractions({ force: true });
  assert.equal(requests[4].url, `${endpoint}?mode=interactions`);

  const htmlClient = runClient(async () => makeResponse({ contentType: "text/html" }));
  await assert.rejects(htmlClient.testConnection(), /Google sign-in is required/);

  const invalidClient = runClient(async () => makeResponse({ payload: { ok: false } }));
  await assert.rejects(invalidClient.testConnection(), /invalid response/);

  const failedClient = runClient(async () => makeResponse({ ok: false, status: 503 }));
  await assert.rejects(failedClient.testConnection(), /HTTP 503/);

  const timeoutClient = runClient(
    async (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    {
      clearTimeout() {},
      setTimeout(callback) {
        setImmediate(callback);
        return 1;
      }
    }
  );
  await assert.rejects(timeoutClient.testConnection(), /did not respond within 20 seconds/);

  console.log("Sheet client tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
