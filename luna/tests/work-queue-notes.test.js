const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/features/work-queue/work-queue-notes-core.js"),
  "utf8"
);
const uiSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/work-queue/work-queue-notes.js"),
  "utf8"
);
const context = { Map, Object, String };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.LunaWorkQueueNotesCore;

const notes = core.read({
  notes: [
    {
      adName: "  First car ",
      createdAt: "2026-08-26T01:00:00.000Z",
      id: "one",
      note: "  Check trim\nwhen live  ",
      vendor: "Vendor A"
    },
    { adName: "Second car", id: "two", note: "Missing photo", vendor: "Vendor A" },
    { adName: "Third car", id: "three", note: "Call later", vendor: "Vendor B" },
    { adName: "Ignored", id: "", note: "No id", vendor: "Vendor C" }
  ]
});
assert.equal(notes.length, 3);
assert.equal(notes[0].adName, "First car");
assert.equal(notes[0].note, "Check trim when live");
const grouped = core.groupByVendor(notes);
assert.equal(grouped.size, 2);
assert.equal(grouped.get("Vendor A").length, 2);
assert.equal(grouped.get("Vendor B")[0].adName, "Third car");
assert.equal(core.normalize({ adName: "Ad", id: "id", note: "", vendor: "Vendor" }), null);
assert.equal(core.MAX_NOTES, 2000);
assert.match(uiSource, /await copy\(note\.adName\)/);
assert.doesNotMatch(uiSource, /await copy\(note\.note\)/);
assert.match(uiSource, /Copy car name/);
console.log("Work Queue notes tests passed.");
