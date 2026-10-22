const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const coreSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/vendor-counter-core.js"),
  "utf8"
);
const uiSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/sheets/vendor-counter.js"),
  "utf8"
);
const html = fs.readFileSync(path.resolve(__dirname, "../sidepanel.html"), "utf8");
const context = { Object };
context.globalThis = context;
vm.runInNewContext(coreSource, context);

const { countVendor, getVendorOptions, normalizeName } = context.LunaVendorCounterCore;

const rows = [
  {
    unlistedDate: "2026-07-29",
    agentName: "Agent One",
    listedVendor: "Listed Motors",
    unlistedVendor: ""
  },
  {
    unlistedDate: "2026-07-29",
    agentName: "Agent Two",
    listedVendor: "",
    unlistedVendor: "Unlisted Cars"
  },
  {
    unlistedDate: "2026-07-29",
    agentName: "Agent Three",
    listedVendor: "Both Auto",
    unlistedVendor: "Both Auto"
  },
  {
    unlistedDate: "2026-07-29",
    agentName: "Agent Four",
    listedVendor: "  Acme   Motors  ",
    unlistedVendor: ""
  },
  {
    unlistedDate: "2026-07-29",
    agentName: " agent four ",
    listedVendor: "",
    unlistedVendor: "ACME MOTORS"
  },
  {
    unlistedDate: "2026-07-29",
    agentName: "Agent Five",
    listedVendor: "Acme Motor",
    unlistedVendor: ""
  },
  {
    unlistedDate: "2026-07-29",
    agentName: "Agent Six",
    listedVendor: "oThEr",
    unlistedVendor: ""
  },
  {
    unlistedDate: "2026-07-29",
    agentName: "Agent Seven",
    auctionVendor: "Auctions",
    listedVendor: "",
    unlistedVendor: ""
  }
];

assert.equal(normalizeName("  ACME   Motors "), "acme motors");

const listedOnly = countVendor(rows, "listed motors");
assert.deepEqual(JSON.parse(JSON.stringify(listedOnly)), {
  agents: [{ agentName: "Agent One", auctions: 0, listed: 1, total: 1, unlisted: 0 }],
  auctions: 0,
  listed: 1,
  total: 1,
  unlisted: 0
});

const unlistedOnly = countVendor(rows, "UNLISTED CARS");
assert.equal(
  countVendor([{ agentName: "Agent One", date: "2026-07-29", unlistedVendor: "No K" }], "No K")
    .unlisted,
  0
);
assert.equal(
  countVendor(
    [{ agentName: "Agent One", unlistedDate: "2026-02-30", unlistedVendor: "Bad K" }],
    "Bad K"
  ).unlisted,
  0
);
assert.equal(unlistedOnly.listed, 0);
assert.equal(unlistedOnly.unlisted, 1);
assert.equal(unlistedOnly.total, 0);
assert.equal(unlistedOnly.agents[0].agentName, "Agent Two");
assert.equal(unlistedOnly.agents[0].total, 0);

const bothColumns = countVendor(rows, "Both Auto");
assert.equal(bothColumns.listed, 1);
assert.equal(bothColumns.unlisted, 1);
assert.equal(bothColumns.total, 1);
assert.equal(bothColumns.agents[0].total, 1);

const cleanedSearch = countVendor(rows, "  aCmE    mOtOrS  ");
assert.equal(cleanedSearch.listed, 1);
assert.equal(cleanedSearch.unlisted, 1);
assert.equal(cleanedSearch.total, 1);
assert.equal(cleanedSearch.agents.length, 1);
assert.equal(cleanedSearch.agents[0].agentName, "Agent Four");

const similarButDifferent = countVendor(rows, "Acme Motor");
assert.equal(similarButDifferent.total, 1);
assert.equal(similarButDifferent.listed, 1);

const noResults = countVendor(rows, "Missing Vendor");
assert.equal(noResults.total, 0);
assert.equal(noResults.agents.length, 0);
const auctionOnly = countVendor(rows, "Auctions");
assert.equal(auctionOnly.auctions, 1);
assert.equal(auctionOnly.total, 1);
assert.equal(auctionOnly.agents[0].agentName, "Agent Seven");

const options = getVendorOptions(rows);
assert.equal(options.filter((name) => normalizeName(name) === "acme motors").length, 1);
assert.ok(options.includes("Acme Motor"));
assert.equal(options.at(-1), "oThEr");

assert.match(html, /id="vendor-counter-form"/);
assert.match(html, /id="vendor-name"[^>]+list="vendor-options"/);
assert.match(html, /id="vendor-counter-refresh"/);
assert.match(html, /id="vendor-counter-window"/);
assert.match(html, /last 10 UAE calendar days/i);
assert.match(html, /<th scope="col">Agent<\/th>/);
assert.match(html, /id="vendor-auctions-count"/);
assert.match(uiSource, /Connection error/);
assert.match(uiSource, /No results/);
assert.match(uiSource, /payload\.connection\.windowDays/);
assert.match(uiSource, /LunaConnection\.isDataState/);
assert.doesNotMatch(uiSource, /\b(?:POST|PUT|PATCH|DELETE)\b/);

console.log("Vendor counter tests passed.");
