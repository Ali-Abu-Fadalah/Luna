const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const coreSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/agent-tracker-core.js"),
  "utf8"
);
const uiSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/agent-tracker.js"),
  "utf8"
);
const html = fs.readFileSync(path.resolve(__dirname, "../sidepanel.html"), "utf8");
const context = { Date, Object };
context.globalThis = context;
vm.runInNewContext(coreSource, context);

const { getAgentOptions, getDateRange, normalizeName, trackWork } = context.LunaAgentTrackerCore;
const todayKey = "2026-07-29";
const rows = [
  {
    agentName: "Agent One",
    date: "2026-07-29",
    unlistedDate: "2026-07-29",
    listedVendor: "Vendor One",
    unlistedVendor: "Vendor Two"
  },
  {
    agentName: "Agent Two",
    date: "2026-07-29",
    unlistedDate: "2026-07-29",
    listedVendor: "",
    unlistedVendor: "Vendor Three"
  },
  {
    agentName: "Agent One",
    auctionVendor: "Auctions",
    date: "2026-07-29",
    unlistedDate: "2026-07-29",
    listedVendor: "",
    unlistedVendor: ""
  },
  {
    agentName: " agent one ",
    date: "2026-07-25",
    unlistedDate: "2026-07-25",
    listedVendor: "  vendor   one ",
    unlistedVendor: ""
  },
  {
    agentName: "AGENT ONE",
    date: "2026-07-24",
    unlistedDate: "2026-07-24",
    listedVendor: "Vendor Four",
    unlistedVendor: ""
  },
  {
    agentName: "Agent One",
    date: "2026-07-22",
    unlistedDate: "2026-07-22",
    listedVendor: "",
    unlistedVendor: "Vendor Five"
  },
  {
    agentName: "Agent One",
    date: "2026-07-19",
    unlistedDate: "2026-07-19",
    listedVendor: "Too Old",
    unlistedVendor: ""
  },
  {
    agentName: "",
    date: "2026-07-29",
    unlistedDate: "2026-07-29",
    listedVendor: "No Agent",
    unlistedVendor: ""
  },
  {
    agentName: "oThEr",
    date: "2026-07-19",
    unlistedDate: "2026-07-19",
    listedVendor: "",
    unlistedVendor: ""
  }
];

assert.equal(normalizeName("  AGENT   ONE "), "agent one");

const weekRange = getDateRange("week", todayKey);
assert.equal(new Date(weekRange.startDay).toISOString().slice(0, 10), "2026-07-25");
assert.equal(new Date(weekRange.endDay).toISOString().slice(0, 10), "2026-07-29");
assert.equal(
  new Date(getDateRange("last7", todayKey).startDay).toISOString().slice(0, 10),
  "2026-07-23"
);
assert.equal(
  new Date(getDateRange("last10", todayKey).startDay).toISOString().slice(0, 10),
  "2026-07-20"
);

const today = trackWork(rows, {
  agent: "  aGeNt   oNe ",
  period: "today",
  todayKey
});
assert.equal(today.listed, 1);
assert.equal(today.unlisted, 1);
assert.equal(today.auctions, 1);
assert.equal(today.total, 2);
assert.equal(today.vendors.length, 3);

const thisWeek = trackWork(rows, {
  agent: "agent one",
  period: "week",
  todayKey
});
assert.equal(thisWeek.listed, 2);
assert.equal(thisWeek.unlisted, 1);
assert.equal(thisWeek.auctions, 1);
assert.equal(thisWeek.total, 3);
assert.equal(thisWeek.agents.length, 1);
assert.equal(
  thisWeek.vendors.find((vendor) => normalizeName(vendor.vendorName) === "vendor one").listed,
  2
);

const lastSeven = trackWork(rows, {
  agent: "agent one",
  period: "last7",
  todayKey
});
assert.equal(lastSeven.total, 4);

const lastTen = trackWork(rows, {
  agent: "agent one",
  period: "last10",
  todayKey
});
assert.equal(lastTen.total, 4);

const allAgents = trackWork(rows, {
  agent: "__all__",
  period: "today",
  todayKey
});
assert.equal(allAgents.listed, 1);
assert.equal(allAgents.unlisted, 2);
assert.equal(allAgents.auctions, 1);
assert.equal(allAgents.total, 2);
assert.equal(allAgents.agents.length, 2);
assert.deepEqual(JSON.parse(JSON.stringify(allAgents.agents)), [
  { agentName: "Agent One", auctions: 1, listed: 1, total: 2, unlisted: 1 },
  { agentName: "Agent Two", auctions: 0, listed: 0, total: 0, unlisted: 1 }
]);

const empty = trackWork(rows, {
  agent: "Missing Agent",
  period: "today",
  todayKey
});
assert.equal(empty.total, 0);
assert.equal(empty.vendors.length, 0);

const agents = getAgentOptions(rows);
assert.equal(agents.length, 3);
assert.equal(agents.filter((agent) => agent.value === "agent one").length, 1);
assert.equal(agents.at(-1).label, "oThEr");

assert.match(html, /id="tracker-agent"/);
assert.equal((html.match(/class="tracker-period/g) || []).length, 5);
assert.match(html, /data-period="today"/);
assert.match(html, /data-period="week"/);
assert.match(html, /data-period="last7"/);
assert.match(html, /data-period="last10"/);
assert.match(html, /Saturday–Friday/);
assert.match(html, /id="tracker-all-agents"/);
assert.match(html, /id="tracker-auctions-count"/);
assert.match(uiSource, /Loading/);
assert.match(uiSource, /No Results/);
assert.match(uiSource, /"Error"/);
assert.match(uiSource, /LunaConnection\.isDataState/);
assert.doesNotMatch(uiSource, /\b(?:POST|PUT|PATCH|DELETE)\b/);

const independentDates = trackWork(
  [
    { agentName: "Agent K", date: "", unlistedDate: todayKey, unlistedVendor: "K Vendor" },
    {
      agentName: "Agent K",
      date: "2026-07-01",
      unlistedDate: todayKey,
      listedVendor: "Old listing",
      unlistedVendor: "K Vendor"
    },
    {
      agentName: "Agent K",
      date: todayKey,
      unlistedDate: "2026-07-01",
      listedVendor: "New listing",
      unlistedVendor: "Old unlisted"
    },
    { agentName: "Agent K", date: todayKey, unlistedVendor: "Missing K" }
  ],
  { period: "today", todayKey }
);
assert.equal(independentDates.unlisted, 2);
assert.equal(independentDates.listed, 1);
assert.equal(independentDates.total, 1);
assert.equal(
  independentDates.vendors.some((item) => item.vendorName === "Missing K"),
  false
);

console.log("Agent tracker tests passed.");
