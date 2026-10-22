const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const source = fs.readFileSync(
  path.join(__dirname, "../src/features/auctions/auction-page.js"),
  "utf8"
);
const make = ({
  tamara = true,
  moveAfterBrand = false,
  wrongTitle = false,
  selectedCard = false,
  duplicateSell = false
} = {}) => {
  let listener,
    openList = null,
    start = "2026-10-22",
    end = "2026-10-23",
    month = "2026-10";
  const writes = [],
    clicks = [];
  const location = {
    origin: "https://marketplace.example.invalid",
    pathname: "/place-ad/example-draft",
    href: "https://marketplace.example.invalid/place-ad/example-draft?step=2"
  };
  class Input {
    constructor(id, value = "") {
      this.id = id;
      this._value = value;
      this.disabled = false;
      this.type = "text";
      this.checked = false;
    }
    get value() {
      return this._value;
    }
    set value(value) {
      this._value = value;
      writes.push(this.id);
    }
    dispatchEvent() {
      if (this.id === "brand" && moveAfterBrand) {
        location.pathname = "/place-ad/wrong";
        location.href = "https://marketplace.example.invalid/place-ad/wrong?step=2";
      }
    }
    blur() {}
    focus() {}
    click() {
      clicks.push(this.id);
      this.checked = !this.checked;
    }
  }
  const nodes = {};
  for (const [id, value] of [
    ["edit_ad_title", wrongTitle ? "Wrong item" : "Example perfume 100 ml"],
    ["brand", ""],
    ["initial_price", ""],
    ["reserve_price", ""],
    ["buy_now_price", "999"],
    ["tag", "keep this"]
  ])
    nodes[id] = new Input(id, value);
  for (const [id, checked] of [
    ["meet-up", true],
    ["delivery-service", false],
    ["enable-tamara", tamara],
    ["activate-auctions chat", true]
  ]) {
    nodes[id] = new Input(id);
    nodes[id].type = "checkbox";
    nodes[id].checked = checked;
  }
  for (const [id, value, choices] of [
    ["condition", "", ["New with tags", "New without tags"]],
    ["start-time-select", "6:00", ["9:00", "10:00"]],
    ["day-period-select", "AM", ["AM", "PM"]]
  ]) {
    nodes[id] = {
      textContent: value,
      focus() {},
      dispatchEvent() {
        openList = {
          querySelectorAll: () =>
            choices.map((textContent) => ({
              textContent,
              click() {
                nodes[id].textContent = textContent;
                openList = null;
              }
            }))
        };
      }
    };
  }
  const calendarButtons = () =>
    Array.from({ length: 28 }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, "0")}`;
      return {
        id: `calendar-day-${date}`,
        disabled: false,
        classList: {
          contains(name) {
            return name === "bg-primary-1"
              ? date === start || date === end
              : name === "rounded-l-full"
                ? date === start
                : name === "rounded-r-full"
                  ? date === end
                  : false;
          }
        },
        click() {
          clicks.push(date);
          if (!start || end) {
            start = date;
            end = "";
          } else if (date < start) {
            start = date;
          } else end = date;
        }
      };
    });
  const editor = { innerText: "", focus() {}, blur() {}, dispatchEvent() {} };
  const document = {
    querySelector(selector) {
      if (selector.startsWith("button[id^='calendar-day-']")) return calendarButtons()[0];
      if (selector.startsWith("[data-lexical-editor=")) return editor;
      if (selector === "#calendar-header") return {};
      return selector.startsWith("#") ? nodes[selector.slice(1)] || null : null;
    },
    querySelectorAll(selector) {
      if (selector === "button,[role='button'],a[href]" && duplicateSell)
        return [1, 2].map((id) => ({
          textContent: "Place an ad",
          disabled: false,
          getAttribute: () => "header-v2-sell",
          click: () => clicks.push(`sell-${id}`)
        }));
      if (selector === "input[name='third-level-categories']" && selectedCard)
        return [
          {
            checked: false,
            closest: () => ({
              textContent: "FragranceIn Lifestyle, Beauty & Health",
              classList: {
                contains: (value) => ["bg-primary-4", "border-primary-1"].includes(value)
              }
            })
          }
        ];
      if (selector === "h2") return [{ textContent: "Auction Scheduling" }];
      if (selector === "[role='listbox']") return openList ? [openList] : [];
      if (selector === "button[id^='calendar-day-']") return calendarButtons();
      return [];
    },
    getElementById(id) {
      if (id.startsWith("calendar-day-"))
        return calendarButtons().find((button) => button.id === id);
      if (id === "calendar-next-month" || id === "calendar-prev-month")
        return {
          click() {
            const date = new Date(`${month}-01T12:00:00Z`);
            date.setUTCMonth(date.getUTCMonth() + (id === "calendar-next-month" ? 1 : -1));
            month = date.toISOString().slice(0, 7);
          }
        };
      return nodes[id] || null;
    },
    createRange: () => ({ selectNodeContents() {} }),
    execCommand(command, _ui, value) {
      assert.equal(command, "insertText");
      editor.innerText = value;
      writes.push("description");
      return true;
    }
  };
  const context = {
    URL,
    document,
    location,
    HTMLInputElement: Input,
    HTMLTextAreaElement: class {},
    InputEvent: class {},
    Event: class {},
    MouseEvent: class {},
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
    setTimeout: (resolve) => resolve(),
    chrome: { runtime: { id: "test-luna", onMessage: { addListener: (fn) => (listener = fn) } } }
  };
  vm.runInNewContext(source, context);
  const plan = {
    title: "Example perfume 100 ml",
    brand: "Example",
    initialPrice: "1",
    reservePrice: "1",
    condition: "New with tags",
    startDate: "2026-10-24",
    endDate: "2026-10-25",
    startTime: "10:00",
    description: "• Example perfume, 100 ml.",
    tamara: false
  };
  const request = async (operation, extra = {}) => {
    const result = await new Promise((resolve) =>
      listener(
        {
          type: "luna.auction.v3",
          operation,
          draftId: "example-draft",
          plan,
          categoryPath: ["Lifestyle", "Beauty & Health", "Fragrance"],
          ...extra
        },
        { id: "test-luna" },
        resolve
      )
    );
    await Promise.resolve();
    await Promise.resolve();
    return result;
  };
  return { request, plan, nodes, writes, clicks, editor, location };
};
test("responsive duplicate sell buttons cannot strand preparation on the auction homepage", async () => {
  const app = make({ duplicateSell: true });
  app.location.pathname = "/uae/auctions";
  app.location.href = "https://marketplace.example.invalid/uae/auctions";
  const result = await app.request("start");
  assert.equal(result.ok, true, result.detail);
  assert.deepEqual(app.clicks, ["sell-1"]);
});

test("an already correct step-1 title is left untouched so manual category selection is preserved", async () => {
  const app = make();
  app.location.pathname = "/place-ad/new";
  app.location.href = "https://marketplace.example.invalid/place-ad/new?step=1";
  app.nodes.ad_title = app.nodes.edit_ad_title;
  const result = await app.request("title", { title: app.plan.title });
  assert.equal(result.ok, true, result.detail);
  assert.deepEqual(app.writes, []);
  assert.deepEqual(app.clicks, []);
});
test("auction fill writes only requested fields, reads the dates back and leaves unspecified switches and fields alone", async () => {
  const app = make();
  const result = await app.request("fill");
  assert.equal(result.ok, true, result.detail);
  assert.equal(result.data.ok, true, JSON.stringify(result.data.entries));
  assert.equal(app.nodes.brand.value, "Example");
  assert.equal(app.nodes.initial_price.value, "1");
  assert.equal(app.nodes.reserve_price.value, "1");
  assert.equal(app.nodes["start-time-select"].textContent, "10:00");
  assert.equal(app.nodes["day-period-select"].textContent, "PM");
  assert.equal(app.nodes["meet-up"].checked, false);
  assert.equal(app.nodes["delivery-service"].checked, true);
  assert.equal(app.nodes["enable-tamara"].checked, true);
  assert.equal(app.nodes.buy_now_price.value, "999");
  assert.equal(app.nodes.tag.value, "keep this");
  assert.equal(app.nodes["activate-auctions chat"].checked, true);
  assert.ok(!app.writes.includes("edit_ad_title"));
  assert.ok(!app.clicks.some((value) => /post|submit/i.test(value)));
});
test("Tamara is enabled only when requested and all later manual changes appear in the audit", async () => {
  const app = make({ tamara: false });
  app.plan.tamara = true;
  assert.equal((await app.request("fill")).data.ok, true);
  assert.equal(app.nodes["enable-tamara"].checked, true);
  app.nodes.reserve_price.value = "2";
  const audit = await app.request("audit");
  assert.equal(audit.data.ok, false);
  assert.ok(audit.data.entries.some((entry) => entry.field === "Reserve price" && !entry.ok));
});
test("wrong row titles and wrong draft IDs block all writes", async () => {
  const app = make({ wrongTitle: true });
  const result = await app.request("fill");
  assert.equal(result.ok, false);
  assert.equal(app.writes.length, 0);
  const other = make();
  assert.equal((await other.request("fill", { draftId: "different" })).ok, false);
  assert.equal(other.writes.length, 0);
});
test("navigation during filling stops before writing prices into another draft", async () => {
  const app = make({ moveAfterBrand: true });
  const result = await app.request("fill");
  assert.equal(result.ok, false);
  assert.match(result.detail, /draft or step changed/);
  assert.deepEqual(app.writes, ["brand"]);
  assert.equal(app.nodes.initial_price.value, "");
});
test("unsupported operations cannot publish or submit an auction", async () => {
  const app = make();
  for (const operation of [
    "post",
    "submit",
    "publish",
    "continue",
    "categories",
    "categoryChoice",
    "categoryConfirm"
  ])
    assert.equal((await app.request(operation)).ok, false);
  assert.equal(app.writes.length, 0);
  assert.equal(app.clicks.length, 0);
});
test("category read-back recognizes the live selected card even when its hidden radio is unchecked", async () => {
  const app = make({ selectedCard: true });
  const result = await app.request("inspect");
  assert.equal(result.data.category, "FragranceIn Lifestyle, Beauty & Health");
});
