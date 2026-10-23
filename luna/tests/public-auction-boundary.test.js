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

test("public republish preview has no authenticated admin or publication transport", async () => {
  const context = {};
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../src/features/auctions/auction-republish-api.js"),
      "utf8"
    ),
    context
  );
  for (const name of ["connect", "call", "link"])
    await assert.rejects(context.LunaAuctionRepublishAPI[name](), (error) => {
      assert.equal(error.code, "unsupported");
      assert.match(error.message, /not included in the public edition/);
      return true;
    });
  assert.equal(
    fs.existsSync(path.join(__dirname, "../src/features/auctions/auction-republish-page.js")),
    false
  );
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../src/features/auctions/auction-republish-core.js"),
      "utf8"
    ),
    context
  );
  for (const method of ["payload", "audit", "choose"])
    assert.equal(context.LunaAuctionRepublishCore[method], undefined);
});
