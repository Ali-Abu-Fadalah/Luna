const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/sheet-report-core.js"),
  "utf8"
);
const controller = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/sheet-report.js"),
  "utf8"
);
const html = fs.readFileSync(path.resolve(__dirname, "../sidepanel.html"), "utf8");
const context = { Date, Map, Set, Number, Object, String };
context.globalThis = context;
vm.runInNewContext(source, context);

const month = (key, name, rows) => ({
  ok: true,
  rows,
  connection: {
    mode: "month",
    sourceTabState: "available",
    auctionsTabState: "available",
    rangeStart: `${key}-01`,
    rangeEnd: key === "2026-09" ? "2026-09-30" : "2026-08-31",
    tab: name,
    rowsRead: rows.length,
    generatedAt: "2026-09-30T12:00:00+04:00",
    dataQuality: { skippedInvalidDate: 2 }
  }
});
const august = month("2026-08", "August + Auctions", [
  {
    date: "",
    unlistedDate: "2026-08-05",
    agentName: "Agent A",
    listedVendor: "",
    unlistedVendor: "Vendor Old",
    unlistedReason: "Unavailable"
  }
]);
const septemberRows = [
  {
    date: "2026-09-01",
    unlistedDate: "2026-09-30",
    agentName: "Agent A",
    listedVendor: "Vendor One",
    unlistedVendor: "Vendor Two",
    unlistedReason: "Sold"
  },
  {
    date: "2026-09-02",
    unlistedDate: "2026-09-02",
    agentName: " agent a ",
    auctionVendor: "Auctions"
  },
  {
    date: "2026-09-02",
    unlistedDate: "2026-09-02",
    agentName: "Agent B",
    listedVendor: "Vendor One"
  }
];
const september = month("2026-09", "September + Auctions", septemberRows);
const recent = {
  ok: true,
  rows: septemberRows,
  connection: {
    mode: "window",
    windowDays: 30,
    missingTabs: [],
    auctionsTabState: "available",
    rangeStart: "2026-09-01",
    rangeEnd: "2026-09-30",
    rowsRead: 3,
    generatedAt: "2026-09-30T12:01:00+04:00",
    dataQuality: {}
  }
};
const interactions = {
  ok: true,
  rows: [
    { date: "2026-08-05", agentName: "Agent A", source: "Ayshei", channel: "Outbound", count: 1 },
    { date: "2026-09-01", agentName: "Agent A", source: "Other source", channel: "Chat", count: 3 },
    { date: "2026-09-02", agentName: "Agent B", source: "Ayshei", channel: "Inbound", count: 2 }
  ],
  connection: {
    mode: "interactions",
    sourceTabState: "available",
    rangeStart: "2026-08-05",
    rangeEnd: "2026-09-30",
    rowsRead: 6,
    groupedRows: 3,
    generatedAt: "2026-09-30T12:02:00+04:00",
    dataQuality: { skippedUnknownChannel: 7, skippedUnknownSource: 2 }
  }
};

const report = context.LunaSheetReportCore.buildReport({
  months: [september, august],
  recent,
  interactions,
  selectedMonth: "2026-09"
});
assert.equal(report.defaultMonth, "2026-09");
assert.equal(report.work.length, 5);
assert.equal(report.work.filter((item) => item.credit).length, 3);
assert.equal(report.work.find((item) => item.vendor === "Vendor Two").date, "2026-09-30");
assert.equal(report.work.find((item) => item.vendor === "Vendor Old").date, "2026-08-05");
assert.equal(report.recentRows.find((item) => item.period === "Today").unlisted, 1);
assert.equal(report.dailyWork.find((item) => item.date === "2026-09-30").unlisted, 1);
assert.equal(report.monthlyAgents.length, 3);
assert.equal(
  report.monthlyAgents.find(
    (item) => item.month === "2026-09" && item.agent.toLowerCase() === "agent a"
  ).workTotal,
  2
);
assert.equal(
  report.monthlyAgents.find(
    (item) => item.month === "2026-09" && item.agent.toLowerCase() === "agent a"
  ).activeDays,
  2
);
assert.equal(report.dailyWork.find((item) => item.date === "2026-09-01").trackerTotal, 1);
assert.equal(
  report.recentRows.find(
    (item) => item.period === "Last 30 days" && item.agent.toLowerCase() === "agent a"
  ).trackerTotal,
  2
);
assert.equal(report.audit.monthSources.find((item) => item.month === "2026-08").workTotal, 0);
assert.equal(report.audit.monthSources.find((item) => item.month === "2026-08").trackerTotal, 0);
assert.equal(
  report.vendors.find((item) => item.scope === "Recent 30 days" && item.vendor === "Vendor Two")
    .unlisted,
  1
);
assert.equal(report.interactionAgents.find((item) => item.company === "Other source").chat, 3);
assert.deepEqual(
  Array.from(
    report.leaderboard.filter((item) => item.month === "2026-09"),
    (item) => [item.rank, item.agent, item.activityIndex]
  ),
  [
    [1, "Agent A", 100],
    [2, "Agent B", 58.3]
  ]
);
assert.equal(report.leaderboard.find((item) => item.month === "2026-08").activityIndex, 100);
assert.equal(report.leaderboard.find((item) => item.month === "2026-08").workTotal, 0);
assert.match(
  report.leaderboard.find((item) => item.month === "2026-09" && item.rank === 1).summary,
  /1 unlisted \(not credited\)/
);
assert.equal(report.audit.interactions.sourceRows, 6);
assert.equal(report.audit.interactions.quality.skippedUnknownChannel, 7);
assert.equal(report.agents.length, 2);
const interactionsOnly = {
  ...interactions,
  rows: [
    ...interactions.rows,
    { date: "2026-09-04", agentName: "Agent C", source: "Ayshei", channel: "Chat", count: 1 }
  ],
  connection: { ...interactions.connection, rowsRead: 7, groupedRows: 4 }
};
const mixedReport = context.LunaSheetReportCore.buildReport({
  months: [september],
  recent,
  interactions: interactionsOnly
});
assert.equal(mixedReport.leaderboard.find((item) => item.agent === "Agent C").workTotal, 0);
assert.equal(mixedReport.leaderboard.find((item) => item.agent === "Agent C").rank, 3);
const noInteractions = {
  ...interactions,
  rows: [],
  connection: { ...interactions.connection, rowsRead: 0, groupedRows: 0 }
};
const workOnlyReport = context.LunaSheetReportCore.buildReport({
  months: [september],
  recent,
  interactions: noInteractions
});
assert.deepEqual(
  Array.from(workOnlyReport.leaderboard, (item) => [item.rank, item.activityIndex]),
  [
    [1, 100],
    [2, 50]
  ]
);
assert.throws(
  () =>
    context.LunaSheetReportCore.buildReport({
      months: [september],
      recent,
      interactions: { ...interactions, connection: { ...interactions.connection, rowsRead: 7 } }
    }),
  /reconcile/
);
assert.match(controller, /getMonthlyPerformance\(\{ force: true/);
assert.match(controller, /testConnection\(30, \{ force: true \}\)/);
assert.match(controller, /getDailyInteractions\(\{ force: true \}\)/);
assert.match(html, /id="sheet-report-export"/);
assert.doesNotMatch(html, /id="monthly-performance-export"/);
console.log("Sheet Statistics report aggregation tests passed.");

(async () => {
  const elements = {
    "#sheet-report-export": { addEventListener() {}, disabled: false, textContent: "" },
    "#sheet-report-message": { textContent: "" },
    "#monthly-performance-month": { value: "August" }
  };
  const requestedMonths = [];
  let clicked = 0;
  let exportedMonth = "";
  const seed = {
    ...september,
    connection: {
      ...september.connection,
      availableMonths: [
        { key: "2026-09", name: "September" },
        { key: "2026-08", name: "August" }
      ]
    }
  };
  const controllerContext = {
    document: {
      querySelector: (selector) => elements[selector],
      createElement: () => ({
        click: () => {
          clicked += 1;
        }
      })
    },
    URL: { createObjectURL: () => "blob:report", revokeObjectURL() {} },
    setTimeout() {},
    LunaSheet: {
      async getMonthlyPerformance({ month: name = "" }) {
        requestedMonths.push(name);
        return name === "August" ? august : seed;
      },
      async testConnection(days) {
        assert.equal(days, 30);
        return recent;
      },
      async getDailyInteractions() {
        return interactions;
      }
    },
    LunaSheetReportCore: context.LunaSheetReportCore,
    LunaXlsxExportCore: {
      buildWorkbook(built) {
        exportedMonth = built.defaultMonth;
        return new Blob(["test"]);
      }
    }
  };
  controllerContext.globalThis = controllerContext;
  vm.runInNewContext(controller, controllerContext);
  await controllerContext.LunaSheetReport.download();
  assert.deepEqual(requestedMonths.sort(), ["", "August"]);
  assert.equal(exportedMonth, "2026-08");
  assert.equal(clicked, 1);
  assert.match(elements["#sheet-report-message"].textContent, /2 work months/);
  console.log("Sheet Statistics download orchestration tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { report };
