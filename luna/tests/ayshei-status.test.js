const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/services/ayshei/ayshei-status.js"),
  "utf8"
);

const makeContext = (shouldFail = false, diagnosticsFail = false) => {
  const status = { dataset: {}, textContent: "" };
  const detail = { textContent: "" };
  const diagnosticEntries = [];
  const homeStates = [];
  const context = {
    document: {
      querySelector(selector) {
        return (
          {
            "#home-ayshei-detail": detail,
            "#home-ayshei-status": status
          }[selector] || null
        );
      }
    },
    LunaAyshei: {
      async testConnection() {
        if (shouldFail) throw new Error("Signed out");
        return { durationMs: 37, endpoint: "mirror", operation: "health" };
      }
    },
    LunaDiagnostics: {
      async record(entry) {
        if (diagnosticsFail) throw new Error("Session storage unavailable");
        diagnosticEntries.push(entry);
      }
    },
    LunaFoundation: {
      status: {
        render(element, { datasetKey, label, state }) {
          element.dataset[datasetKey] = state;
          element.textContent = label;
          return true;
        }
      }
    },
    LunaHomeStatus: {
      updateService(area, value) {
        homeStates.push({ area, value });
      }
    },
    Math,
    Number,
    Object,
    Promise
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return { context, detail, diagnosticEntries, homeStates, status };
};

(async () => {
  const connected = makeContext();
  await connected.context.LunaAysheiStatus.ready;
  assert.equal(connected.status.textContent, "Mirror connected");
  assert.equal(connected.status.dataset.aysheiState, "connected");
  assert.match(connected.detail.textContent, /37 ms/);
  assert.match(connected.detail.textContent, /No automatic switching/);
  assert.equal(connected.homeStates.at(-1).value.state, "connected");
  assert.equal(connected.diagnosticEntries[0].code, "connection-ok");

  const failed = makeContext(true);
  await failed.context.LunaAysheiStatus.ready;
  assert.equal(failed.status.textContent, "Selected endpoint unavailable");
  assert.equal(failed.status.dataset.aysheiState, "error");
  assert.match(failed.detail.textContent, /did not try the other endpoint/);
  assert.deepEqual(JSON.parse(JSON.stringify(failed.diagnosticEntries[0])), {
    area: "ayshei",
    code: "connection-failed",
    level: "error"
  });

  const diagnosticsUnavailable = makeContext(false, true);
  await diagnosticsUnavailable.context.LunaAysheiStatus.ready;
  assert.equal(diagnosticsUnavailable.status.textContent, "Mirror connected");

  console.log("Ayshei Home status tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
