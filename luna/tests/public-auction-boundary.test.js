const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

test("public auction adapter excludes authenticated draft transports", async () => {
  const context = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/features/auctions/auction-api.js"), "utf8"),
    context
  );
  for (const name of ["identity", "preflight", "save", "receipts"])
    await assert.rejects(context.LunaAuctionAPI[name](), (error) => {
      assert.equal(error.code, "unsupported");
      assert.match(error.message, /not included in the public edition/);
      return true;
    });
});
