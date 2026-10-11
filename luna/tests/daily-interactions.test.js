const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const coreSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/daily-interactions-core.js"),
  "utf8"
);
const html = fs.readFileSync(path.resolve(__dirname, "../sidepanel.html"), "utf8");
const controller = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/daily-interactions.js"),
  "utf8"
);
const monthlyController = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/monthly-performance.js"),
  "utf8"
);
const context = { Date, Intl, Object, String };
context.globalThis = context;
vm.runInNewContext(coreSource, context);
const core = context.LunaDailyInteractionsCore;
const rows = [
  { date: "2026-09-30", agentName: "Agent A", channel: "Inbound", source: "Ayshei", count: 2 },
  { date: "2026-10-01", agentName: "Agent A", channel: "Chat", source: "Other source", count: 3 },
  { date: "2026-10-03", agentName: "Agent A", channel: "Outbound", source: "Ayshei", count: 4 },
  {
    date: "2026-10-04",
    agentName: " agent a ",
    channel: "Inbound",
    source: "Other source",
    count: 1
  },
  { date: "2026-10-04", agentName: "Agent B", channel: "Chat", source: "Ayshei", count: 2 },
  {
    date: "2026-10-04",
    agentName: "Agent B",
    channel: "Outbound",
    source: "Other source",
    count: 1
  }
];
const today = core.summarize(rows, { todayKey: "2026-10-04", period: "today" });
assert.equal(today.totals.total, 4);
assert.equal(today.totals.inbound, 1);
assert.equal(today.totals.outbound, 1);
assert.equal(today.totals.chat, 2);
assert.equal(today.agents.length, 2);
assert.equal(today.sources[0].total, 2);
assert.equal(today.sources[1].total, 2);
const week = core.summarize(rows, { todayKey: "2026-10-04", period: "last7" });
assert.equal(week.totals.total, 13);
assert.equal(week.range.start, "2026-09-28");
const month = core.summarize(rows, { todayKey: "2026-10-04", period: "month", month: "2026-09" });
assert.equal(month.totals.total, 2);
assert.equal(month.range.end, "2026-09-30");
const selected = core.summarize(rows, {
  todayKey: "2026-10-04",
  period: "all",
  agent: "AGENT A",
  channel: "Chat",
  source: "Other source"
});
assert.equal(selected.totals.total, 3);
assert.equal(selected.agents[0].agentName, "Agent A");
assert.equal(selected.daily[0].date, "2026-10-01");
assert.equal(core.monthOptions(rows, "2026-10-04")[0].key, "2026-10");
assert.equal(core.agentOptions(rows).length, 2);
assert.match(html, /data-sheet-subview-button="interactions"/);
assert.match(html, /<[^>]*\bdata-sheet-subview="interactions"[^>]*\bhidden\b[^>]*>/);
assert.match(html, /id="interactions-agent"/);
assert.match(controller, /getDailyInteractions\(\{ force: true \}\)/);
assert.match(controller, /let period = "last7"/);
assert.match(monthlyController, /subview === "interactions".*ensureLoaded\(\)/);
console.log("Daily interactions aggregation tests passed.");
