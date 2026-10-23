const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { webcrypto } = require("node:crypto");
const root = path.join(__dirname, "../src/features/auctions");
const coreCode = fs.readFileSync(path.join(root, "auction-republish-core.js"), "utf8");
const uiCode = fs.readFileSync(path.join(root, "auction-republish.js"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const row = (id = "row-1") => ({
  id,
  title: `Example ${id} auction`,
  startDate: "2030-01-05",
  endDate: "2030-01-07",
  startPrice: "1",
  reservePrice: "No Reserve",
  tamara: ""
});
const context = (extras = {}) => {
  const ctx = vm.createContext({
    Date,
    URL,
    URLSearchParams,
    TextEncoder,
    AbortSignal,
    crypto: webcrypto,
    setTimeout: (fn) => fn(),
    ...extras
  });
  vm.runInContext(coreCode, ctx);
  return ctx;
};
test("admin Saturday is 10 PM, other days are 9 PM, and all end days are 9 PM with the portal's wire conversion", () => {
  const core = context().LunaAuctionRepublishCore;
  const sat = core.validate(row(), Date.parse("2029-12-01T00:00Z"));
  assert.equal(sat.valid, true);
  assert.equal(sat.plan.startLocal, "2030-01-05T22:00");
  assert.equal(sat.plan.startDate, "2030-01-05 18:00");
  assert.equal(sat.plan.endDate, "2030-01-07 17:00");
  assert.equal(sat.plan.duration, 169200);
  const sun = core.validate({ ...row(), startDate: "2030-01-06" }, 0);
  assert.equal(sun.plan.startLocal, "2030-01-06T21:00");
  assert.equal(sun.plan.duration, 86400);
});
test("republish validation ignores placement-only columns but never guesses dates, money or Tamara", () => {
  const core = context().LunaAuctionRepublishCore;
  assert.equal(core.validate(row(), 0).valid, true);
  assert.equal(
    core.validate({ ...row(), reservePrice: "5,500", tamara: "Yes" }, 0).plan.reservePrice,
    "5500"
  );
  for (const patch of [
    { reservePrice: "1,2" },
    { startPrice: "0" },
    { startPrice: "1.001" },
    { tamara: "Maybe" },
    { startDate: "2030-02-30" },
    { startDate: "NA" },
    { endDate: "2030-02-01" }
  ])
    assert.equal(core.validate({ ...row(), ...patch }, 0).valid, false);
  assert.equal(core.validate(row(), Date.parse("2030-01-05T17:30Z")).valid, false);
});
class Element {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.value = "";
    this.children = [];
    this.events = {};
    this.dataset = {};
    this.checked = false;
    this.textContent = "";
    this.attributes = {};
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  addEventListener(type, fn) {
    this.events[type] = fn;
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren() {
    this.children = [];
  }
  async fire(type) {
    return this.events[type]?.();
  }
}
const descendants = (node) => [
  node,
  ...node.children.flatMap((child) => (child instanceof Element ? descendants(child) : []))
];
const buttonNamed = (node, name) =>
  descendants(node).find((child) => child.tagName === "BUTTON" && child.textContent === name);
const createUI = async ({
  saved = null,
  linkFail = false,
  verifyMissing = false,
  commitThrow = false,
  commitUnsent = false,
  beforeCommit = null
} = {}) => {
  const ids = [
    "preview",
    "all",
    "none",
    "review",
    "rows",
    "count",
    "mode",
    "primary",
    "pause",
    "status",
    "results",
    "links",
    "copy",
    "history",
    "history-count",
    "history-list"
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, new Element()]));
  const source = { value: saved?.previewSource || "Current paste" };
  const events = [],
    storage = { "luna.auctions.republish.v1": saved };
  let busy = false,
    ui,
    fail = linkFail,
    lockHeld = false;
  const ctx = context({
    Intl,
    document: {
      getElementById: (id) =>
        id === "auction-workflow"
          ? { value: "republish" }
          : id === "auction-paste"
            ? source
            : nodes[id.replace("auction-republish-", "")],
      createElement: (tag) => new Element(tag),
      createTextNode: (value) => value
    },
    navigator: {
      locks: {
        request: async (_name, _opts, fn) => {
          if (lockHeld) return fn(null);
          lockHeld = true;
          try {
            return await fn({});
          } finally {
            lockHeld = false;
          }
        }
      },
      clipboard: { writeText: async (value) => events.push(["copy", value]) }
    },
    chrome: {
      storage: {
        local: {
          get: async () => plain(storage),
          set: async (patch) => Object.assign(storage, plain(patch))
        }
      },
      tabs: { update: async () => {} }
    },
    LunaAuctions: {
      sourceText: () => source.value,
      isBusy: () => busy,
      refresh: () => ui?.render(),
      run: async (fn) => {
        busy = true;
        ui?.render();
        try {
          await fn();
        } catch (error) {
          events.push(["error", error.message]);
          ui.notify(error.message, "error");
        } finally {
          busy = false;
          ui?.render();
        }
      }
    },
    LunaAuctionRepublishAPI: {
      connect: async () => 7,
      call: async (_tab, op, args) => {
        events.push([op, args]);
        if (op === "prepare")
          return {
            ticket: webcrypto.randomUUID(),
            source: { id: "source", title: args.row.title, codeNumber: "1000000000" },
            plan: ctx.LunaAuctionRepublishCore.validate(args.row).plan,
            before: [],
            preparedAt: Date.now()
          };
        if (op === "arm") return args.prepared;
        if (op === "commit") {
          assert.ok(
            storage["luna.auctions.republish.v1"].entries.some(
              (entry) => entry.status === "sending"
            ),
            "Journal must precede every write."
          );
          await beforeCommit?.();
          if (commitThrow || commitUnsent)
            throw Object.assign(new Error("Disconnected during request"), {
              definitelyUnsent: commitUnsent
            });
          return { confirmed: true };
        }
        if (op === "verify")
          return verifyMissing
            ? null
            : { id: "new", codeNumber: "2000000000", title: args.prepared.plan.title };
        if (op === "review") return { ready: true };
      },
      link: async (receipt) => {
        events.push(["link", receipt]);
        if (fail) {
          fail = false;
          throw new Error("Link not visible yet");
        }
        return `https://marketplace.example.invalid/auctions/detail/2000000000-${receipt.title}`;
      }
    }
  });
  source.setAttribute = () => {};
  vm.runInContext(uiCode, ctx);
  ui = ctx.LunaAuctionRepublish;
  await new Promise((done) => setImmediate(done));
  return {
    nodes,
    events,
    storage,
    source,
    job: () => storage["luna.auctions.republish.v1"],
    render: () => ui.render(),
    replace: async (rows = [row(), row("row-2")], text = source.value) => {
      source.value = text;
      await ui.setRows(rows, text);
    },
    continuous: async () => {
      nodes.review.checked = false;
      await nodes.review.fire("change");
    }
  };
};

test("each reviewed paste replaces a separate republish preview without calling the admin", async () => {
  const app = await createUI();
  await app.replace();
  assert.equal(app.job().rows.length, 2);
  await app.replace([row("new")], "New paste");
  assert.equal(app.job().rows.length, 1);
  assert.equal(app.job().rows[0].title, row("new").title);
  assert.equal(app.source.value, "New paste");
  assert.equal(app.job().entries.length, 0);
  assert.equal(app.events.length, 0);
  assert.equal(app.nodes.primary.textContent, "Open admin review");
  assert.equal(app.nodes.primary.disabled, false);
});

test("Select none and Select all affect the visible batch and duplicate copies stay unselected", async () => {
  const app = await createUI();
  await app.replace([row(), row("row-2"), row()]);
  assert.deepEqual(
    app.job().rows.map((entry) => entry.selected),
    [true, true, false]
  );
  await app.nodes.none.fire("click");
  assert.ok(app.job().rows.every((entry) => !entry.selected));
  assert.equal(app.nodes.primary.disabled, true);
  await app.nodes.all.fire("click");
  assert.deepEqual(
    app.job().rows.map((entry) => entry.selected),
    [true, true, false]
  );
  assert.equal(app.events.length, 0);
});

test("removing and clearing rows only changes this preview", async () => {
  const app = await createUI();
  await app.replace();
  await buttonNamed(app.nodes.rows.children[0], "Remove").fire("click");
  assert.equal(app.job().rows.length, 1);
  assert.equal(app.job().rows[0].title, row("row-2").title);
  await app.replace([], "");
  assert.equal(app.job().rows.length, 0);
  assert.equal(app.nodes.preview.hidden, true);
  assert.equal(app.events.length, 0);
});

test("edited source blocks execution until Review rows creates a fresh preview", async () => {
  const app = await createUI();
  await app.replace();
  app.source.value = "A new paste";
  app.render();
  assert.equal(app.nodes.primary.disabled, true);
  await app.nodes.primary.fire("click");
  assert.equal(app.events.length, 0);
  await app.replace([row("new")]);
  assert.equal(app.nodes.primary.disabled, false);
});

test("an inline edit updates only that row and keeps the primary action disabled until Done", async () => {
  const app = await createUI();
  await app.replace();
  await buttonNamed(app.nodes.rows.children[0], "Edit").fire("click");
  assert.equal(app.nodes.primary.disabled, true);
  const input = descendants(app.nodes.rows.children[0]).find(
    (node) => node.attributes["aria-label"] === "Initial price · AED"
  );
  input.value = "75000";
  await input.fire("input");
  const reserve = descendants(app.nodes.rows.children[0]).find(
    (node) => node.attributes["aria-label"] === "Reserve / No Reserve"
  );
  reserve.value = "145000";
  await reserve.fire("input");
  await buttonNamed(app.nodes.rows.children[0], "Done").fire("click");
  assert.equal(app.job().rows[0].startPrice, "75000");
  assert.equal(app.job().rows[0].reservePrice, "145000");
  assert.equal(app.job().rows[1].startPrice, "1");
  assert.equal(app.nodes.primary.disabled, false);
  assert.equal(app.events.length, 0);
});

test("one action opens a review, then checks the result before opening the next; no publish calls", async () => {
  const app = await createUI();
  await app.replace();
  await app.nodes.primary.fire("click");
  assert.equal(app.job().entries[0].status, "awaiting_manual");
  assert.equal(app.nodes.primary.textContent, "Check result & next");
  assert.deepEqual(
    app.events.map(([op]) => op),
    ["prepare", "arm", "review"]
  );
  await app.nodes.primary.fire("click");
  assert.deepEqual(
    app.job().entries.map((entry) => entry.status),
    ["complete", "awaiting_manual"]
  );
  assert.equal(app.events.filter(([op]) => op === "commit").length, 0);
  await app.nodes.primary.fire("click");
  assert.equal(app.nodes.primary.textContent, "Copy auction links");
  await app.nodes.primary.fire("click");
  const exported = app.events.find(([op]) => op === "copy")[1];
  assert.ok(exported.indexOf(row().title) < exported.indexOf(row("row-2").title));
});

test("an unresolved price offers source suggestions and still accepts an explicitly typed amount", async () => {
  const app = await createUI();
  await app.replace([
    {
      ...row(),
      startPrice: "",
      importReview: [
        { field: "startPrice", candidates: [{ column: 8, text: "75000", value: "75000" }] }
      ]
    }
  ]);
  await buttonNamed(app.nodes.rows.children[0], "Edit").fire("click");
  const input = descendants(app.nodes.rows.children[0]).find(
    (node) => node.attributes["aria-label"] === "Initial price · AED"
  );
  assert.equal(input.tagName, "INPUT");
  assert.ok(input.attributes.list);
  input.value = "74000";
  await input.fire("input");
  await buttonNamed(app.nodes.rows.children[0], "Done").fire("click");
  assert.equal(app.job().rows[0].startPrice, "74000");
  assert.equal(app.events.length, 0);
});

test("deselecting the next row while waiting does not open it after a result check", async () => {
  const app = await createUI();
  await app.replace();
  await app.nodes.primary.fire("click");
  await app.nodes.none.fire("click");
  await app.nodes.primary.fire("click");
  assert.equal(app.job().entries.length, 1);
  assert.equal(app.job().entries[0].status, "complete");
  assert.equal(app.events.filter(([op]) => op === "review").length, 1);
});

test("continuous mode journals every write and retrieves each link before the next row", async () => {
  const app = await createUI();
  await app.replace();
  await app.continuous();
  await app.nodes.primary.fire("click");
  assert.deepEqual(
    app.job().entries.map((entry) => entry.status),
    ["complete", "complete"]
  );
  assert.deepEqual(
    app.events.filter(([op]) => ["commit", "verify", "link"].includes(op)).map(([op]) => op),
    ["commit", "verify", "link", "commit", "verify", "link"]
  );
  await app.nodes.primary.fire("click");
  assert.equal(app.events.filter(([op]) => op === "commit").length, 2);
});

test("pausing continuous mode finishes the current link and leaves the next row queued", async () => {
  let app;
  app = await createUI({ beforeCommit: () => app.nodes.pause.fire("click") });
  await app.replace();
  await app.continuous();
  await app.nodes.primary.fire("click");
  assert.deepEqual(
    app.job().entries.map((entry) => entry.status),
    ["complete", "queued"]
  );
  assert.equal(app.events.filter(([op]) => op === "commit").length, 1);
  assert.equal(app.nodes.primary.textContent, "Continue batch");
});

test("an uncertain request survives reload and can only be checked, never automatically resent", async () => {
  const app = await createUI({ commitThrow: true });
  await app.replace();
  await app.continuous();
  await app.nodes.primary.fire("click");
  assert.equal(app.job().entries[0].status, "uncertain");
  const restored = await createUI({ saved: app.job(), verifyMissing: true });
  assert.equal(restored.events.length, 0);
  await restored.nodes.primary.fire("click");
  assert.equal(restored.events.filter(([op]) => op === "commit").length, 0);
  assert.equal(restored.job().entries[0].status, "uncertain");
});

test("a confirmed prewrite failure stays retryable rather than uncertain", async () => {
  const app = await createUI({ commitUnsent: true });
  await app.replace();
  await app.continuous();
  await app.nodes.primary.fire("click");
  assert.equal(app.job().entries[0].status, "blocked");
  assert.equal(app.events.filter(([op]) => op === "commit").length, 1);
});

test("link recovery retains the new ID and retries only its read", async () => {
  const app = await createUI({ linkFail: true });
  await app.replace();
  await app.continuous();
  await app.nodes.primary.fire("click");
  assert.equal(app.job().entries[0].status, "link_pending");
  await app.nodes.primary.fire("click");
  assert.equal(app.job().entries[0].status, "complete");
  assert.equal(app.events.filter(([op]) => op === "commit").length, 1);
  assert.equal(app.events.filter(([op]) => op === "verify").length, 1);
});

test("old shared jobs move to History without pulling placement rows into the new batch", async () => {
  const plan = context().LunaAuctionRepublishCore.validate(row(), 0).plan;
  const app = await createUI({
    saved: {
      version: 1,
      tabId: 7,
      entries: [
        {
          rowId: "old",
          plan,
          status: "complete",
          link: "https://marketplace.example.invalid/auctions/detail/example"
        },
        {
          rowId: "old2",
          plan: { ...plan, title: "Another old auction" },
          status: "sending",
          prepared: { ticket: "old" }
        },
        { rowId: "unused", plan, status: "queued" }
      ]
    }
  });
  assert.equal(app.nodes.preview.hidden, true);
  assert.equal(app.nodes["history-list"].children.length, 2);
  assert.equal(app.job().version, 1, "Restoring a panel must not write outside the lock.");
  await app.replace([row("fresh")]);
  assert.equal(app.job().rows.length, 1);
  assert.equal(app.job().entries.length, 0);
  assert.equal(app.job().history.length, 2);
  assert.equal(app.job().history[1].status, "uncertain");
  assert.equal(app.nodes.primary.disabled, false);
  assert.equal(app.events.length, 0);
});

test("replacing or removing a waiting row archives it; History result checks cannot publish", async () => {
  const app = await createUI();
  await app.replace();
  await app.nodes.primary.fire("click");
  await buttonNamed(app.nodes.rows.children[0], "Remove").fire("click");
  assert.equal(app.job().history[0].status, "awaiting_manual");
  await app.replace([row("fresh")]);
  const check = buttonNamed(app.nodes["history-list"], "Check result");
  await check.fire("click");
  assert.equal(app.job().history[0].status, "complete");
  assert.equal(app.job().rows[0].title, row("fresh").title);
  assert.equal(app.events.filter(([op]) => op === "prepare").length, 1);
  assert.equal(app.events.filter(([op]) => op === "commit").length, 0);
});

test("completed and uncertain schedules cannot be resent by pasting them into a fresh batch", async () => {
  for (const uncertain of [false, true]) {
    const app = await createUI({ commitThrow: uncertain });
    await app.replace([row()]);
    await app.continuous();
    await app.nodes.primary.fire("click");
    await app.replace([row()]);
    assert.equal(app.job().rows[0].selected, false);
    await app.nodes.all.fire("click");
    assert.equal(app.job().rows[0].selected, false);
    await app.nodes.primary.fire("click");
    assert.equal(app.events.filter(([op]) => op === "commit").length, 1);
    await app.replace([{ ...row(), startDate: "2030-01-12", endDate: "2030-01-14" }]);
    assert.equal(app.job().rows[0].selected, true);
    assert.equal(app.nodes.primary.disabled, false);
  }
});

test("a stale panel rereads the sending journal under the lock before it can act", async () => {
  const app = await createUI();
  await app.replace();
  await app.nodes.primary.fire("click");
  app.storage["luna.auctions.republish.v1"].entries[0].status = "sending";
  await app.nodes.primary.fire("click");
  assert.equal(app.events.filter(([op]) => op === "commit").length, 0);
  assert.equal(app.job().entries[0].status, "complete");
});
