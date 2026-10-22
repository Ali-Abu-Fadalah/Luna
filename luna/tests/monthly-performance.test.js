const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/monthly-performance-core.js"),
  "utf8"
);
const html = fs.readFileSync(path.resolve(__dirname, "../sidepanel.html"), "utf8");
const uiSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/monthly-performance.js"),
  "utf8"
);
const css = fs.readFileSync(path.resolve(__dirname, "../styles/sidepanel.css"), "utf8");
const context = { Date, Object, String };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.LunaMonthlyPerformanceCore;
const rows = [
  {
    date: "2026-08-01",
    unlistedDate: "2026-08-01",
    agentName: "Agent A",
    listedVendor: "Vendor One",
    unlistedVendor: ""
  },
  {
    date: "2026-08-01",
    unlistedDate: "2026-08-01",
    agentName: "Agent A",
    listedVendor: "",
    unlistedVendor: "Vendor Two"
  },
  {
    date: "2026-08-02",
    unlistedDate: "2026-08-02",
    agentName: "Agent A",
    listedVendor: "Vendor One",
    unlistedVendor: "Vendor Three"
  },
  {
    date: "2026-08-02",
    unlistedDate: "2026-08-02",
    agentName: "Agent B",
    listedVendor: "Vendor Two",
    unlistedVendor: ""
  },
  {
    date: "2026-08-02",
    unlistedDate: "2026-08-02",
    agentName: "Agent B",
    auctionVendor: "Auctions",
    listedVendor: "",
    unlistedVendor: ""
  },
  {
    date: "2026-07-31",
    unlistedDate: "2026-07-31",
    agentName: "Agent A",
    listedVendor: "Old",
    unlistedVendor: ""
  }
];
const result = core.summarize(rows, { todayKey: "2026-08-02" });
assert.equal(result.team.listed, 3);
assert.equal(result.team.unlisted, 2);
assert.equal(result.team.auctions, 1);
assert.equal(result.team.total, 4);
assert.equal(result.team.activeDays, 2);
assert.equal(result.vendors.find((vendor) => vendor.agentName === "Vendor Three").total, 0);
assert.equal(result.vendors.find((vendor) => vendor.agentName === "Vendor Three").activeDays, 0);
assert.equal(result.agents.length, 2);
assert.deepEqual(JSON.parse(JSON.stringify(result.agents[0].bestRecordedDay)), {
  date: "2026-08-01",
  total: 1
});
assert.equal(result.agents[0].averagePerActiveDay, 1);
assert.equal(result.agents[0].share, 0.5);
assert.equal(core.dateRange("2026-02-28").startDay, Date.UTC(2026, 1, 1));
assert.equal(core.dateRange("2028-02-29").startDay, Date.UTC(2028, 1, 1));
assert.equal(core.sortAgents(result.agents, "activeDays", "asc")[0].agentName, "Agent B");
assert.match(html, /data-sheet-subview-button="tools"/);
assert.match(html, /data-sheet-subview-button="monthly"/);
assert.match(html, /<[^>]*\bdata-sheet-subview="monthly"[^>]*\bhidden\b[^>]*>/);
assert.deepEqual(
  [...html.matchAll(/\bdata-sheet-subview-button="([^"]+)"/g)].map((match) => match[1]).sort(),
  ["tools", "tracker", "monthly", "interactions", "report"].sort(),
  "Each Sheet workflow must have one tab."
);
assert.match(html, /<[^>]*\bdata-sheet-subview="tracker"[^>]*\bhidden\b[^>]*>/);
assert.match(html, /<[^>]*\bdata-sheet-subview="report"[^>]*\bhidden\b[^>]*>/);
assert.equal((html.match(/data-monthly-view=/g) || []).length, 3);
assert.match(html, /id="monthly-explorer-description"/);
assert.match(html, /id="monthly-performance-month"/);
assert.match(html, /id="monthly-auctions-count"/);
assert.match(uiSource, /setSubview\("tools"\)/);
assert.match(uiSource, /if \(isMonthly && !hasLoaded\) refresh\(\)/);
assert.match(uiSource, /setExplorerView/);
assert.match(uiSource, /populateMonths/);
assert.match(uiSource, /monthSelect\.addEventListener\("change", refresh\)/);
assert.match(
  uiSource,
  /getMonthlyPerformance\(\s*\{\s*force:\s*true,\s*month:\s*requestedMonth\s*\}\s*\)/
);
assert.match(css, /\.monthly-explorer-list/);
assert.match(css, /\.monthly-metric-bar i/);
assert.match(css, /#monthly-performance-month,/);
console.log("Monthly performance tests passed.");
