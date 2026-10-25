const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { webcrypto } = require("node:crypto");
const code = fs.readFileSync(path.join(__dirname, "../src/features/auctions/auctions.js"), "utf8");
const core = fs.readFileSync(
  path.join(__dirname, "../src/features/auctions/auction-core.js"),
  "utf8"
);
const html = fs.readFileSync(path.join(__dirname, "../sidepanel.html"), "utf8");
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
class Element {
  constructor() {
    this.value = "";
    this.dataset = {};
    this.children = [];
    this.events = {};
  }
  addEventListener(name, listener) {
    this.events[name] = listener;
  }
  setAttribute() {}
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren() {
    this.children = [];
  }
  querySelectorAll() {
    return [];
  }
  async fire(name, event = {}) {
    return this.events[name]?.({ preventDefault() {}, inputType: "insertText", ...event });
  }
}
const create = async ({
  draftId = "",
  wrongTitle = false,
  missingSource = false,
  closed = false,
  creatingDraft = false,
  backend = false,
  backendError = "",
  backendErrorCode = "",
  preflightErrorCode = "",
  uploadGate = null,
  fillGate = null,
  fillError = "",
  auditMismatch = false,
  imagesImported = false,
  workbookRows = [],
  selectedCategory = ["Lifestyle", "Beauty & Health", "Fragrance"]
} = {}) => {
  const ids = [...html.matchAll(/id="auction-([^"\s]+)"/g)].map((match) => match[1]);
  const nodes = Object.fromEntries(ids.map((id) => [id, new Element()]));
  const operations = [],
    writes = [],
    uploads = [];
  const row = {
    id: "test-row",
    title: "Example perfume 100 ml",
    brand: "Example",
    category: "Perfume",
    condition: "New",
    startPrice: "1",
    reservePrice: "No Reserve",
    startDate: "2026-10-24",
    endDate: "2026-10-25",
    tamara: "Yes",
    photosUrl: "https://example-my.sharepoint.com/folder",
    descriptionColumnOnly: true,
    descriptionSource: missingSource ? "" : "Example perfume, 100 ml.",
    description: missingSource ? "" : "• Example perfume, 100 ml.",
    status: "pending",
    issues: [],
    tabId: 7,
    draftId,
    creatingDraft,
    imagesImported,
    importedCount: imagesImported ? 3 : 0,
    mainImage: imagesImported ? "saved-main" : "",
    categoryPath: draftId ? ["Lifestyle", "Beauty & Health", "Fragrance"] : [],
    capture: {
      sourceUrl: "https://example-my.sharepoint.com/folder",
      images: [1, 2, 3].map((id) => ({ id: String(id), url: `https://images.example/${id}.png` }))
    }
  };
  const state = { version: 1, rows: [row], index: 0, mappings: {} };
  const tab = {
    id: 7,
    url: "https://marketplace.example.invalid/uae/auctions",
    status: "complete"
  };
  const context = {
    Date: class extends Date {
      constructor(...args) {
        super(...(args.length ? args : ["2026-10-24T08:00:00Z"]));
      }
      static now() {
        return Date.parse("2026-10-24T08:00:00Z");
      }
    },
    URL,
    Intl,
    crypto: webcrypto,
    setTimeout: (callback) => callback(),
    document: {
      activeElement: null,
      getElementById: (id) => nodes[id.replace("auction-", "")],
      querySelectorAll: (selector) =>
        selector === "[data-auction-placement]" ? [] : Object.values(nodes),
      createElement: () => new Element()
    },
    chrome: {
      storage: {
        local: {
          get: async () => ({ "luna.auctions.v1": state }),
          set: async (patch) => Object.assign(state, patch["luna.auctions.v1"] || {})
        }
      },
      scripting: { executeScript: async () => [] },
      runtime: {},
      tabs: {
        get: async () => {
          if (closed) throw new Error("closed");
          return tab;
        },
        update: async (_id, patch) => {
          Object.assign(tab, patch);
          writes.push(patch);
          return tab;
        },
        reload: async () => {
          writes.push({ reload: true });
        },
        create: async () => {
          throw new Error("Unexpected new tab");
        },
        sendMessage: async (_id, request) => {
          operations.push(request.operation);
          let data = {};
          if (request.operation === "start")
            tab.url = "https://marketplace.example.invalid/place-ad/list-draft";
          if (request.operation === "new")
            tab.url = "https://marketplace.example.invalid/place-ad/new";
          assert.ok(
            !["categories", "categoryChoice", "categoryConfirm", "continue"].includes(
              request.operation
            ),
            "Category selection and Next belong to the user."
          );
          if (request.operation === "inspect")
            data = { auction: true, title: wrongTitle ? "Another listing" : row.title };
          if (request.operation === "fill") {
            fillGate?.started.resolve();
            if (fillGate) await fillGate.done.promise;
            if (fillError) throw new Error(fillError);
          }
          if (["fill", "audit"].includes(request.operation))
            data = {
              ok: !(request.operation === "audit" && auditMismatch),
              entries: [],
              draftId: request.draftId
            };
          return { ok: true, data };
        }
      }
    },
    LunaImageScraper: {
      loadReviewedCapture: async () => {},
      uploadToAysheiTab: async (id, _onSelected, onMainRetained) => {
        uploads.push(id);
        if (uploadGate) {
          uploadGate.started.resolve();
          await uploadGate.main.promise;
          onMainRetained();
          onMainRetained(); // Duplicate delivery must not fill twice.
          await uploadGate.tail.promise;
          if (uploadGate.error) throw new Error(uploadGate.error);
        }
        return { retained: true, imported: 3, mainImage: "saved-main" };
      },
      verifyOnAysheiTab: async () => {}
    },
    LunaAuctionWorkbook: {
      open: async () => ({
        sheets: [{ id: "0", name: "Example worksheet" }],
        readSheet: async () => workbookRows,
        close() {}
      })
    }
  };
  context.LunaAuctionAPI = {
    identity: async () => ({ categoryPath: [...selectedCategory] })
  };
  if (backend)
    Object.assign(context.LunaAuctionAPI, {
      preflight: async (_tabId, request) => {
        assert.deepEqual(Array.from(request.categoryPath), selectedCategory);
        if (preflightErrorCode)
          throw Object.assign(new Error("Draft read unavailable"), { code: preflightErrorCode });
        return { domStamp: "example-stamp" };
      },
      save: async () => {
        operations.push("backend-save");
        if (backendError) throw Object.assign(new Error(backendError), { code: backendErrorCode });
        return { ok: true, entries: [], imageNames: ["a.jpg", "b.jpg", "c.jpg"] };
      },
      receipts: async () => ({ imageNames: ["a.jpg", "b.jpg", "c.jpg"], mainImage: "saved-main" })
    });
  vm.runInNewContext(core, context);
  vm.runInNewContext(code, context);
  await Promise.resolve();
  await Promise.resolve();
  return { nodes, row, operations, writes, uploads, tab, state };
};
test("preparation fills only the title at step 1 and resumes after the user selects a category and clicks Next", async () => {
  const app = await create();
  await app.nodes.prepare.fire("click");
  assert.equal(app.row.awaitingCategory, true);
  assert.equal(app.nodes.prepare.textContent, "Continue filling Ayshei");
  assert.deepEqual(app.operations, ["start", "new", "title"]);
  assert.deepEqual(app.uploads, []);
  app.tab.url = "https://marketplace.example.invalid/place-ad/new-draft?step=2";
  await app.nodes.prepare.fire("click");
  assert.equal(app.row.status, "filled", app.nodes.message.textContent);
  assert.equal(app.row.draftId, "new-draft");
  assert.equal(app.row.awaitingCategory, false);
  assert.deepEqual(Array.from(app.row.categoryPath), ["Lifestyle", "Beauty & Health", "Fragrance"]);
  assert.deepEqual(app.uploads, [7]);
  assert.ok(!app.operations.some((operation) => /post|publish|submit/.test(operation)));
});
test("backend preparation saves once, reloads and audits without using the DOM field filler", async () => {
  const app = await create({ backend: true, draftId: "saved-draft", imagesImported: true });
  await app.nodes.prepare.fire("click");
  assert.equal(app.row.status, "filled", app.nodes.message.textContent);
  assert.equal(app.operations.filter((entry) => entry === "backend-save").length, 1);
  assert.ok(app.operations.includes("ready") && app.operations.includes("audit"));
  assert.ok(!app.operations.includes("fill"));
  assert.ok(app.writes.some((entry) => entry.reload));
  assert.equal(app.row.audit.transport, "draft-api");
});

test("fields start only after the saved main image and overlap the remaining upload without a reload", async () => {
  const uploadGate = { started: deferred(), main: deferred(), tail: deferred() };
  const fillGate = { started: deferred(), done: deferred() };
  const app = await create({
    backend: true,
    draftId: "saved-draft",
    uploadGate,
    fillGate,
    preflightErrorCode: "must-not-read-before-cover"
  });
  const preparing = app.nodes.prepare.fire("click");
  await uploadGate.started.promise;
  assert.ok(!app.operations.includes("fill"));
  uploadGate.main.resolve();
  await fillGate.started.promise;
  assert.equal(app.operations.filter((operation) => operation === "fill").length, 1);
  assert.match(app.nodes.message.textContent, /Main image saved.*remaining images upload/);
  fillGate.done.resolve();
  await Promise.resolve();
  assert.notEqual(app.row.status, "filled");
  assert.equal(app.row.audit, null);
  uploadGate.tail.resolve();
  await preparing;
  assert.equal(app.row.status, "filled", app.nodes.message.textContent);
  assert.ok(app.operations.includes("audit"), "Audit again after the entire gallery is retained.");
  assert.ok(!app.operations.includes("backend-save"));
  assert.ok(!app.writes.some((entry) => entry.reload));
  assert.equal(app.row.fieldTransport, "form");
  await app.nodes.prepare.fire("click");
  assert.equal(app.row.status, "filled");
  assert.deepEqual(app.uploads, [7], "Updating fields must not upload the photos twice.");
  assert.ok(!app.operations.includes("backend-save"), "Keep unsaved form fields on the form path.");
});

test("finishing photos first still waits for the concurrent field work", async () => {
  const uploadGate = { started: deferred(), main: deferred(), tail: deferred() };
  const fillGate = { started: deferred(), done: deferred() };
  const app = await create({ draftId: "saved-draft", uploadGate, fillGate });
  const preparing = app.nodes.prepare.fire("click");
  uploadGate.main.resolve();
  await fillGate.started.promise;
  uploadGate.tail.resolve();
  await Promise.resolve();
  assert.notEqual(app.row.status, "filled");
  assert.ok(!app.operations.includes("audit"));
  fillGate.done.resolve();
  await preparing;
  assert.equal(app.row.status, "filled", app.nodes.message.textContent);
});

test("a remaining-photo failure waits for field work and never reports a field-only success", async () => {
  const uploadGate = {
    started: deferred(),
    main: deferred(),
    tail: deferred(),
    error: "Remaining photo failed"
  };
  const fillGate = { started: deferred(), done: deferred() };
  const app = await create({ draftId: "saved-draft", uploadGate, fillGate });
  let finished = false;
  const preparing = app.nodes.prepare.fire("click").then(() => {
    finished = true;
  });
  uploadGate.main.resolve();
  await fillGate.started.promise;
  uploadGate.tail.resolve();
  await Promise.resolve();
  assert.equal(finished, false);
  fillGate.done.resolve();
  await preparing;
  assert.equal(app.row.audit, null);
  assert.notEqual(app.row.status, "filled");
  assert.ok(!app.row.imagesImported);
  assert.match(app.nodes.message.textContent, /Remaining photo failed/);
});

test("a concurrent field failure preserves completed photos but never reports success", async () => {
  const uploadGate = { started: deferred(), main: deferred(), tail: deferred() };
  const app = await create({
    draftId: "saved-draft",
    uploadGate,
    fillError: "Condition unavailable"
  });
  const preparing = app.nodes.prepare.fire("click");
  uploadGate.main.resolve();
  uploadGate.tail.resolve();
  await preparing;
  assert.equal(app.row.imagesImported, true);
  assert.equal(app.row.audit, null);
  assert.notEqual(app.row.status, "filled");
  assert.match(app.nodes.message.textContent, /Condition unavailable/);
});

test("the final audit catches fields changed during the remaining image upload", async () => {
  const uploadGate = { started: deferred(), main: deferred(), tail: deferred() };
  const app = await create({ draftId: "saved-draft", uploadGate, auditMismatch: true });
  const preparing = app.nodes.prepare.fire("click");
  uploadGate.main.resolve();
  uploadGate.tail.resolve();
  await preparing;
  assert.equal(app.row.status, "blocked");
  assert.equal(app.row.audit.ok, false);
  assert.match(app.nodes.message.textContent, /Some fields differ/);
});

test("step 1 opens before description or photo collection and repeated Continue never resets the user's category", async () => {
  const app = await create({ missingSource: true });
  app.row.capture = null;
  await app.nodes.prepare.fire("click");
  assert.equal(app.row.awaitingCategory, true);
  assert.deepEqual(app.operations, ["start", "new", "title"]);
  await app.nodes.prepare.fire("click");
  assert.deepEqual(app.operations, ["start", "new", "title", "inspect"]);
  assert.equal(app.row.draftId, "");
  assert.deepEqual(app.uploads, []);
  assert.match(app.nodes.message.textContent, /Choose the correct category on Ayshei/);
});

test("step 2 uses the user's actual selected category instead of any remembered sheet-category mapping", async () => {
  const path = ["Lifestyle", "Fashion & Accessories", "Jewellery"];
  const app = await create({ backend: true, selectedCategory: path, imagesImported: true });
  await app.nodes.prepare.fire("click");
  app.tab.url = "https://marketplace.example.invalid/place-ad/manual-category-draft?step=2";
  await app.nodes.prepare.fire("click");
  assert.equal(app.row.status, "filled", app.nodes.message.textContent);
  assert.deepEqual(Array.from(app.row.categoryPath), path);
  assert.equal(app.operations.filter((operation) => operation === "backend-save").length, 1);
});

test("manual navigation to a different product or a changed category on an already bound draft stops before upload", async () => {
  const wrong = await create({ wrongTitle: true });
  await wrong.nodes.prepare.fire("click");
  wrong.tab.url = "https://marketplace.example.invalid/place-ad/different-product?step=2";
  await wrong.nodes.prepare.fire("click");
  assert.match(wrong.nodes.message.textContent, /differs/);
  assert.deepEqual(wrong.uploads, []);
  const changed = await create({
    draftId: "saved-draft",
    selectedCategory: ["Lifestyle", "Fashion & Accessories", "Jewellery"]
  });
  await changed.nodes.prepare.fire("click");
  assert.match(changed.nodes.message.textContent, /saved category changed/);
  assert.deepEqual(changed.uploads, []);
});

test("an unfinished manual category handoff cannot create a duplicate after its tab closes or returns home", async () => {
  for (const closed of [false, true]) {
    const app = await create({ closed });
    app.row.awaitingCategory = true;
    await app.nodes.prepare.fire("click");
    assert.deepEqual(app.operations, []);
    assert.match(
      app.nodes.message.textContent,
      /will not (?:create a duplicate|start another draft)/
    );
  }
});

test("reviewing a new paste replaces an old unbound placement preview", async () => {
  const app = await create();
  Object.assign(app.row, {
    serial: "1",
    capture: null,
    startPrice: "No Reserve",
    photosUrl: "",
    condition: "https://wrong.example"
  });
  app.nodes.paste.value = [
    "1",
    "Ayshei",
    "Perfume",
    "Example",
    "Perfume sale",
    "",
    "Example perfume 100 ml",
    "https://marketplace.example.invalid/auctions/detail/example",
    "1234567890",
    "https://shop.example/product",
    "",
    "1",
    "No Reserve",
    "185",
    "194.25",
    "203.5",
    "",
    "New",
    "https://other.example/product",
    "10 Oct 9 PM",
    "11 Oct 9 PM",
    "24 Hours",
    "Online",
    "https://example-my.sharepoint.com/folder",
    ""
  ].join("\t");
  await app.nodes.import.fire("click");
  assert.equal(app.state.rows.length, 1);
  const imported = app.state.rows[0];
  assert.equal(imported.startPrice, "1");
  assert.equal(imported.condition, "New");
  assert.equal(imported.photosUrl, "https://example-my.sharepoint.com/folder");
  assert.equal(imported.descriptionUrl, "https://shop.example/product");
  assert.notEqual(imported.id, "test-row");
  assert.match(imported.startDate, new RegExp(`^${new Date().getFullYear()}-10-10$`));
  assert.equal(app.nodes.queue.children.length, 1);
  assert.match(app.nodes.message.textContent, /1 row in this preview/);
  assert.ok(app.nodes.paste.value.includes("No Reserve"));
  assert.equal(app.writes.length, 0);
  assert.equal(app.uploads.length, 0);
});

test("paste stays visible until Review rows and each reviewed batch replaces its old preview", async () => {
  const app = await create();
  const make = (serial, reserve, title) => [
    String(serial),
    "Ayshei",
    "Gold",
    "Example Mint",
    "New Arrival",
    "",
    title,
    "10",
    "https://marketplace.example.invalid/auctions/detail/example",
    "",
    "https://shop.example/description",
    "",
    "1",
    reserve,
    "",
    "",
    "6050",
    "",
    "New",
    "https://shop.example/description",
    "24th Oct 2026",
    "27th Oct 2026",
    "3 Days",
    "Online",
    `[${title}](https://example-my.sharepoint.com/:f:/g/personal/example/folder-${serial})`
  ];
  const gold = [make(9, "5,500", "Example gold 10 g"), make(10, "3025", "Example gold 5 g")];
  const text = [gold[0], gold[0].map(() => ":---:"), gold[1]]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
  const event = { clipboardData: { getData: (type) => (type === "text/plain" ? text : "") } };
  await app.nodes.paste.fire("paste", event);
  assert.equal(app.state.rows.length, 1, "Pasting alone must not import or alter the preview.");
  assert.equal(app.nodes.paste.value, text);
  assert.deepEqual(app.writes, []);
  await app.nodes.import.fire("click");
  assert.equal(app.state.rows.length, 2);
  assert.equal(app.state.rows[0].title, "Example gold 10 g");
  assert.equal(app.state.rows[0].startPrice, "1");
  assert.equal(app.state.rows[0].reservePrice, "5,500");
  assert.equal(app.state.rows[1].reservePrice, "3025");
  assert.equal(
    app.state.rows[0].photosUrl,
    "https://example-my.sharepoint.com/:f:/g/personal/example/folder-9"
  );
  assert.equal(app.nodes.startDate.value, "2026-10-24");
  assert.equal(app.nodes.endDate.value, "2026-10-27");
  assert.match(app.nodes.message.textContent, /2 rows in this preview/);
  assert.equal(app.nodes.import.hidden, false);
  assert.equal(app.nodes.paste.value, text);
  assert.equal(app.nodes.work.hidden, false);
  assert.equal(app.nodes.alerts.children.length, 0);
  await app.nodes.paste.fire("paste", event);
  await app.nodes.import.fire("click");
  assert.equal(app.state.rows.length, 2, "A repeated review replaces the current preview.");
  assert.deepEqual(app.writes, []);
  assert.deepEqual(app.uploads, []);
});

test("local worksheet ranges retain actual headers and physical row numbers", async () => {
  const headers = [
    "Sr. No.",
    "Category",
    "Brand",
    "Model + Title",
    "Description",
    "Start Price",
    "Reserve Price",
    "Condition",
    "Start Date",
    "End Date",
    "Tamara",
    "Descale Photoes",
    "link photos"
  ];
  const make = (title) => [
    "9",
    "Gold",
    "Example Mint",
    title,
    "Example gold bar, 10 g.",
    "1",
    "5500",
    "New",
    "2026-10-24",
    "2026-10-27",
    "",
    { text: title, url: "https://example-my.sharepoint.com/:f:/g/personal/example/folder" },
    "https://wrong.example/link-photos"
  ];
  const app = await create({
    workbookRows: [[], headers, make("Example gold from workbook"), make("Unselected gold")]
  });
  app.nodes["workbook-file"].files = [{ name: "Synthetic workbook.xlsx" }];
  await app.nodes["workbook-file"].fire("change");
  assert.equal(app.nodes["workbook-panel"].hidden, false);
  app.nodes["workbook-sheet"].value = "0";
  await app.nodes["workbook-sheet"].fire("change");
  app.nodes["workbook-range"].value = "3";
  await app.nodes["workbook-add"].fire("click");
  assert.equal(app.state.rows.length, 1);
  assert.equal(app.state.rows[0].title, "Example gold from workbook");
  assert.equal(app.state.rows[0].descriptionSource, "Example gold bar, 10 g.");
  assert.equal(
    app.state.rows[0].photosUrl,
    "https://example-my.sharepoint.com/:f:/g/personal/example/folder"
  );
  assert.match(app.nodes.message.textContent, /From workbook headers/);
  assert.deepEqual(app.writes, []);
});

test("clearing a placement preview retains bound and unresolved draft identities for an identical reimport", async () => {
  for (const options of [{ draftId: "saved-draft" }, { creatingDraft: true }]) {
    const app = await create(options);
    await app.nodes.clear.fire("click");
    assert.equal(app.state.rows.length, 0);
    app.nodes.paste.value = [
      [
        "Model - Title",
        "Category",
        "Brand",
        "Start Price",
        "Reserve Price",
        "Condition",
        "Start Date",
        "End Date",
        "Descale Photoes"
      ],
      [
        app.row.title,
        "Perfume",
        "Example",
        "1",
        "No Reserve",
        "New",
        "2026-10-24",
        "2026-10-25",
        app.row.photosUrl
      ]
    ]
      .map((cells) => cells.join("\t"))
      .join("\n");
    await app.nodes.import.fire("click");
    assert.equal(app.state.rows.length, 1);
    assert.equal(app.state.rows[0].id, app.row.id);
    assert.equal(app.state.rows[0].draftId, app.row.draftId);
    assert.equal(app.state.rows[0].creatingDraft, app.row.creatingDraft);
    assert.deepEqual(app.writes, []);
    assert.deepEqual(app.operations, []);
  }
});

test("an incomplete middle-sheet row remains editable and is selected instead of rejecting the batch", async () => {
  const app = await create();
  const cells = [
    "12",
    "Ayshei",
    "Gold",
    "Example Mint",
    "New Arrival",
    "",
    "Example incomplete gold",
    "10",
    "https://marketplace.example.invalid/auctions/detail/example",
    "",
    "https://shop.example/description",
    "",
    "not an amount",
    "5500",
    "",
    "",
    "6050",
    "",
    "New",
    "https://shop.example/description",
    "24th Oct 2026",
    "27th Oct 2026",
    "3 Days",
    "Online",
    "https://example-my.sharepoint.com/:f:/g/personal/example/folder"
  ];
  await app.nodes.paste.fire("paste", {
    clipboardData: { getData: (type) => (type === "text/plain" ? cells.join("\t") : "") }
  });
  await app.nodes.import.fire("click");
  assert.equal(app.state.rows.length, 1);
  assert.equal(app.nodes.work.hidden, false);
  assert.equal(app.nodes.title.value, "Example incomplete gold");
  assert.ok(app.nodes.alerts.children.length > 0);
  assert.ok(app.nodes.paste.value.includes("not an amount"));
  assert.deepEqual(app.writes, []);
  assert.deepEqual(app.uploads, []);
});
test("failed backend saves never fall back to another write path or retain a ready audit", async () => {
  const app = await create({
    backend: true,
    draftId: "saved-draft",
    backendError: "Uncertain response",
    imagesImported: true
  });
  app.row.audit = { ok: true };
  await app.nodes.prepare.fire("click");
  assert.match(app.nodes.message.textContent, /Uncertain response/);
  assert.equal(app.row.audit, null);
  assert.equal(app.operations.filter((entry) => entry === "backend-save").length, 1);
  assert.ok(!app.operations.includes("fill"));
});

test("a rejected preflight read fills and checks the same open draft without a backend save", async () => {
  const app = await create({
    backend: true,
    draftId: "saved-draft",
    preflightErrorCode: "read_unavailable",
    imagesImported: true
  });
  await app.nodes.prepare.fire("click");
  assert.equal(app.row.status, "filled", app.nodes.message.textContent);
  assert.deepEqual(app.uploads, []);
  assert.equal(app.operations.filter((entry) => entry === "fill").length, 1);
  assert.ok(!app.operations.includes("backend-save"));
  assert.ok(!app.operations.includes("new"));
  assert.ok(!app.writes.some((entry) => entry.reload));
  assert.match(app.nodes.message.textContent, /Filled and checked/);
});

test("a failed read after entering the save path cannot trigger a second fill or retry", async () => {
  const app = await create({
    backend: true,
    draftId: "saved-draft",
    backendError: "Saved-draft read unavailable after save",
    backendErrorCode: "read_unavailable",
    imagesImported: true
  });
  app.row.audit = { ok: true };
  await app.nodes.prepare.fire("click");
  assert.equal(app.row.audit, null);
  assert.equal(app.operations.filter((entry) => entry === "backend-save").length, 1);
  assert.ok(!app.operations.includes("fill"));
  assert.match(app.nodes.message.textContent, /unavailable after save/);
});
test("resume reopens the saved draft when its tab is on the homepage", async () => {
  const app = await create({ draftId: "saved-draft" });
  await app.nodes.prepare.fire("click");
  assert.equal(app.row.status, "filled", app.nodes.message.textContent);
  assert.ok(
    app.writes.some(
      (patch) => patch.url === "https://marketplace.example.invalid/place-ad/saved-draft?step=2"
    )
  );
  assert.ok(!app.operations.includes("new"));
});
test("a mismatched draft title stops before image upload and field writes", async () => {
  const app = await create({ draftId: "saved-draft", wrongTitle: true });
  await app.nodes.prepare.fire("click");
  assert.match(app.nodes.message.textContent, /differs/);
  assert.deepEqual(app.uploads, []);
  assert.ok(!app.operations.includes("fill"));
});
test("output is disabled without source and automatically becomes source bullets after paste", async () => {
  const app = await create({ missingSource: true });
  assert.equal(app.nodes.description.disabled, true);
  app.nodes.descriptionSource.value = "Fresh perfume, 100 ml.";
  await app.nodes.descriptionSource.fire("input");
  assert.equal(app.nodes.description.disabled, false);
  assert.equal(app.row.description, "• Fresh perfume, 100 ml.");
  app.nodes.descriptionSource.value = "";
  await app.nodes.descriptionSource.fire("input");
  assert.equal(app.nodes.description.disabled, true);
  assert.equal(app.row.description, "");
});
test("lost draft-creation responses never trigger a duplicate draft", async () => {
  const app = await create({ closed: true, creatingDraft: true });
  await app.nodes.prepare.fire("click");
  assert.match(app.nodes.message.textContent, /will not create a duplicate/);
  assert.deepEqual(app.operations, []);
});
