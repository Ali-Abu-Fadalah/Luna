const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const context = { URL, Intl };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "../src/features/auctions/auction-core.js"), "utf8"),
  context
);
const core = context.LunaAuctionCore;
const headers = [
  "Sr. No.",
  "Category",
  "Brand",
  "Model + Title",
  "Start Price",
  "Reserve Price",
  "Condition",
  "Start Date",
  "End Date",
  "Tamara (Y/N)",
  "Description",
  "link photos",
  "Descale Photoes"
];
const data = [
  "1",
  "Perfume",
  "Example",
  "Example perfume 100 ml",
  "1",
  "No Reserve",
  "New",
  "2026-10-24",
  "2026-10-25",
  "Yes",
  "https://shop.example/product",
  "https://other.example/product",
  "https://example-my.sharepoint.com/personal/example/_layouts/15/onedrive.aspx?id=%2FDocuments%2FImages%2Fitem"
];
const parse = (row = data) => core.parseSheet([headers, row])[0];
test("headerless workbook layouts, visible columns and remembered headers preserve every mapped field", () => {
  for (const [layout, names] of Object.entries(core.layouts)) {
    const values = names.map((name) => {
      const index = headers.findIndex(
        (header) =>
          core.key(header) === core.key(name) ||
          (core.key(name) === "modeltitle" && core.key(header) === "modeltitle") ||
          (name === "Tamara" && header.startsWith("Tamara"))
      );
      return index < 0 ? "" : data[index];
    });
    const rows = core.parseSheet([values], "strict", { layout });
    assert.equal(rows[0].title, data[3], layout);
    assert.equal(rows[0].startPrice, "1", layout);
    assert.equal(rows[0].descriptionUrl, data[10], layout);
    assert.equal(rows[0].photosUrl, data[12], layout);
    assert.equal(rows[0].startDate, "2026-10-24", layout);
    if (layout === "sheet25") {
      // Older tabs have identical positions but call the final column Photos.
      // Headers distinguish that source from the required Descale Photoes.
      const partial = core.parseSheet([values])[0];
      assert.equal(partial.startPrice, "1");
      assert.equal(partial.photosUrl, "");
      assert.equal(partial.importReview[0].field, "photosUrl");
      assert.equal(
        core.parseSheet([values], "strict", { savedHeaders: names })[0].photosUrl,
        data[12]
      );
    } else assert.equal(core.parseSheet([values])[0].title, data[3], layout);
  }
  const remembered = core.parseSheet([data], "strict", { savedHeaders: headers });
  assert.equal(remembered[0].title, data[3]);
  assert.throws(() => core.parseSheet([["unknown", "columns"]]), /No recognizable auction rows/);
  assert.equal(core.parseDate("24th Oct 2026"), "2026-10-24");
  assert.equal(core.parseDate("21st October 2026"), "2026-10-21");
});
test("headers map independently of column order; No Reserve sets both prices; Saturday uses 10 PM", () => {
  const row = parse(),
    result = core.validate(row);
  assert.equal(result.valid, true, result.issues.join("\n"));
  assert.equal(result.plan.initialPrice, "1");
  assert.equal(result.plan.reservePrice, "1");
  assert.equal(result.plan.startTime, "10:00");
  assert.equal(result.plan.period, "PM");
  assert.equal(result.plan.condition, "New with tags");
  assert.equal(result.plan.tamara, true);
  assert.equal(row.descriptionUrl, data[10]);
  assert.equal(row.photosUrl, data[12]);
  const reverse = core.parseSheet([[...headers].reverse(), [...data].reverse()])[0];
  assert.equal(reverse.title, row.title);
  assert.equal(reverse.photosUrl, row.photosUrl);
});

const paddedPerfume = () => [
  "1",
  "Ayshei",
  "Perfume",
  "Example",
  "Perfume sale",
  "",
  "Example perfume 100 ml",
  "https://marketplace.example.invalid/auctions/detail/example",
  "1234567890",
  "https://shop.example/description",
  "",
  "1",
  "No Reserve",
  "185",
  "194.25",
  "203.5",
  "",
  "New",
  "https://other.example/photo-link",
  "10 Oct 9:00 PM",
  "11 Oct 9:00 PM",
  "24 Hours",
  "Online",
  { text: "Example perfume 100 ml", url: "https://example-my.sharepoint.com/folder" },
  ""
];

test("the reported headerless perfume rows tolerate blank padding without shifting any auction field", () => {
  const first = paddedPerfume(),
    second = paddedPerfume();
  second[0] = "2";
  second[3] = "Another";
  second[6] = "Another perfume 50 ml";
  second.push("", "");
  const rows = core.parseSheet([first, Array(25).fill(""), second], "strict", { year: 2026 });
  assert.equal(rows.length, 2);
  for (const [index, row] of rows.entries()) {
    assert.equal(row.title, index ? "Another perfume 50 ml" : "Example perfume 100 ml");
    assert.equal(row.brand, index ? "Another" : "Example");
    assert.equal(row.category, "Perfume");
    assert.equal(row.condition, "New");
    assert.equal(row.startPrice, "1");
    assert.equal(row.reservePrice, "No Reserve");
    assert.equal(row.tamara, "");
    assert.equal(row.photosUrl, "https://example-my.sharepoint.com/folder");
    assert.equal(row.descriptionUrl, "https://shop.example/description");
    assert.equal(row.startDate, "2026-10-10");
    assert.equal(row.endDate, "2026-10-11");
    assert.equal(row.inferredYear, 2026);
    assert.equal(row.importError, undefined);
    const result = core.validate(row);
    assert.equal(result.valid, true, result.issues.join("\n"));
    assert.equal(result.plan.initialPrice, "1");
    assert.equal(result.plan.reservePrice, "1");
    assert.equal(result.plan.startTime, "10:00");
    assert.deepEqual(Array.from(core.validate(row, { today: "2026-10-22" }).issues), [
      "Start date is in the past."
    ]);
  }
  const autoYear = core.parseSheet([paddedPerfume()]);
  assert.equal(autoYear[0].startDate, `${new Date().getFullYear()}-10-10`);
});

test("Markdown tables retain the first data row, embedded folder links and formatting", () => {
  const cells = paddedPerfume().map((cell) =>
    typeof cell === "object" ? `[${cell.text}](${cell.url})` : cell
  );
  cells[14] = "***194.25***";
  const line = `| ${cells.join(" | ")} |`;
  const separator = `| ${cells.map(() => ":---:").join(" | ")} |`;
  const rows = core.parseSheet(`${line}\n${separator}\n${line}`, "strict", { year: 2026 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "Example perfume 100 ml");
  assert.equal(rows[0].photosUrl, "https://example-my.sharepoint.com/folder");
  assert.equal(rows[0].startPrice, "1");
  assert.equal(rows[0].condition, "New");
});

const goldRow = (serial = "9", reserve = "5,500", title = "Example minting 10gm gold bar") => [
  serial,
  "Ayshei",
  "Gold",
  "Example Mint",
  "New Arrival",
  "",
  title,
  "10",
  "https://marketplace.example.invalid/auctions/detail/example-gold",
  "",
  "https://shop.example/gold-description",
  "",
  "1",
  reserve,
  "",
  "",
  "6050",
  "",
  "New",
  "https://shop.example/gold-description",
  "24th Oct 2026",
  "27th Oct 2026",
  "3 Days",
  "Online",
  { text: title, url: `https://example-my.sharepoint.com/:f:/g/personal/example/folder-${serial}` }
];

test("reported Gold rows import without headers and isolate only an ambiguous photo source", () => {
  const rows = core.parseSheet([goldRow(), goldRow("10", "3025", "Example falcon 5g gold bar")]);
  assert.equal(rows.length, 2);
  for (const [index, row] of rows.entries()) {
    assert.equal(row.importMethod, "catalog-consensus");
    assert.equal(row.startPrice, "1");
    assert.equal(row.reservePrice, index ? "3025" : "5,500");
    assert.equal(row.condition, "New");
    assert.equal(row.startDate, "2026-10-24");
    assert.equal(row.endDate, "2026-10-27");
    assert.equal(row.descriptionUrl, "https://shop.example/gold-description");
    assert.equal(row.photosUrl, "");
    assert.equal(row.importReview.length, 1);
    assert.equal(row.importReview[0].field, "photosUrl");
    assert.equal(row.importReview[0].candidates[0].column, 24);
  }
});

test("authorized single-folder inference completes the reported Gold Markdown rows without mapping errors", () => {
  const cells = [goldRow(), goldRow("10", "3025", "Example falcon 5g gold bar")].map((row) =>
    row.map((cell) => (typeof cell === "object" ? `[${cell.text}](${cell.url})` : cell))
  );
  const markdown = [cells[0], cells[0].map(() => ":-:"), cells[1]]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
  const rows = core.parseSheet(markdown, "strict", { allowHeaderlessPhotoSource: true });
  assert.equal(rows.length, 2);
  assert.equal(rows.hasHeaders, false);
  for (const [index, row] of rows.entries()) {
    assert.equal(
      row.photosUrl,
      `https://example-my.sharepoint.com/:f:/g/personal/example/folder-${index ? "10" : "9"}`
    );
    assert.equal(row.photoSourceMethod, "headerless-folder");
    assert.equal(row.importReview.length, 0);
    const checked = core.validate(row);
    assert.equal(checked.valid, true, checked.issues.join("\n"));
    assert.equal(checked.plan.initialPrice, "1");
    assert.equal(checked.plan.reservePrice, index ? "3025" : "5500");
    assert.equal(checked.plan.startTime, "10:00");
  }
});

test("one invalid amount cannot reject or shift every row in the same paste", () => {
  const invalid = goldRow("10", "not an AED amount", "Another gold bar");
  const rows = core.parseSheet([goldRow(), invalid], "strict", {
    allowHeaderlessPhotoSource: true
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].reservePrice, "5,500");
  assert.equal(rows[1].reservePrice, "not an AED amount");
  assert.equal(rows[1].startPrice, "1");
  assert.equal(rows[1].condition, "New");
  assert.equal(core.validate(rows[0]).valid, true);
  assert.ok(core.validate(rows[1]).issues.some((issue) => issue.includes("Invalid price")));
});

test("equally plausible amount columns stay blank with explicit source choices", () => {
  const cells = paddedPerfume().slice(0, 24);
  cells[10] = "https://shop.example/another-description";
  cells[11] = "100";
  cells[12] = "150";
  cells[13] = "175";
  const row = core.parseSheet([cells], "strict", { allowHeaderlessPhotoSource: true })[0];
  assert.equal(row.startPrice, "");
  assert.equal(row.reservePrice, "");
  assert.equal(row.condition, "New");
  const start = row.importReview.find((entry) => entry.field === "startPrice");
  assert.deepEqual(
    Array.from(start.candidates, (candidate) => candidate.value),
    ["100", "150"]
  );
  assert.equal(core.validate(row).valid, false);
});

test("malformed prices cannot make a shifted valid Reserve/Threshold pair win inference", () => {
  for (const malformed of ["bad amount", "", "0", "-1", "1e3"]) {
    const cells = paddedPerfume().slice(0, 24);
    cells[10] = "https://shop.example/another-description";
    cells[11] = malformed;
    cells[12] = "150";
    cells[13] = "175";
    const row = core.parseSheet([cells], "strict", { allowHeaderlessPhotoSource: true })[0];
    assert.equal(row.startPrice, "", malformed);
    assert.equal(row.reservePrice, "", malformed);
    assert.equal(core.validate(row).valid, false);
  }
});

test("a partial headerless row cannot borrow a financial map from a fully populated neighbor", () => {
  const partial = goldRow("10", "3025", "Partial listing with absent form anchors");
  partial[18] = "";
  partial[20] = "";
  partial[21] = "";
  const rows = core.parseSheet([goldRow(), partial], "strict", {
    allowHeaderlessPhotoSource: true
  });
  assert.equal(rows[0].startPrice, "1");
  assert.equal(rows[0].reservePrice, "5,500");
  assert.equal(rows[1].startPrice, "");
  assert.equal(rows[1].reservePrice, "");
  assert.equal(rows[1].importMethod, "anchors");
});

test("a misplaced condition or a single populated date cannot assign meaning to neighboring amounts", () => {
  const full = goldRow();
  for (const columns of [[18], [20], [21]]) {
    const cells = [...full];
    for (const index of columns) cells[index] = "";
    const row = core.parseSheet([cells], "strict", { allowHeaderlessPhotoSource: true })[0];
    assert.equal(row.startPrice, "");
    assert.equal(row.reservePrice, "");
    assert.equal(core.validate(row).valid, false);
  }
  const malformed = [
    "88",
    "Ayshei",
    "Gold",
    "Another field",
    "Example",
    "Synthetic shifted listing",
    "https://shop.example/reference",
    "",
    "1",
    "No Reserve",
    "150",
    "New",
    "https://shop.example/photos",
    "",
    "24 Oct 2026",
    "27 Oct 2026",
    "3 Days",
    "Online",
    ""
  ];
  const row = core.parseSheet([malformed], "strict", { allowHeaderlessPhotoSource: true })[0];
  assert.equal(row.startPrice, "");
  assert.equal(row.reservePrice, "");
});

test("weight-only title cells cannot become a listing title or borrow a distant tag", () => {
  const cells = goldRow();
  cells[6] = "";
  const row = core.parseSheet([cells], "strict", { allowHeaderlessPhotoSource: true })[0];
  assert.equal(row.title, "");
  assert.equal(core.validate(row).valid, false);
});

test("remembered explicit headers retain a malformed amount without switching price columns", () => {
  const cells = goldRow();
  cells[13] = "amount unavailable";
  const row = core.parseSheet([cells], "strict", { savedHeaders: core.layouts.sheet25 })[0];
  assert.equal(row.importMethod, "saved-headers");
  assert.equal(row.startPrice, "1");
  assert.equal(row.reservePrice, "amount unavailable");
  assert.equal(row.photosUrl, cells[24].url);
});

test("mixed headerless row widths recover individually instead of discarding the batch", () => {
  const rows = core.parseSheet([paddedPerfume(), goldRow()], "strict", {
    year: 2026,
    allowHeaderlessPhotoSource: true
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "Example perfume 100 ml");
  assert.equal(rows[0].startPrice, "1");
  assert.equal(rows[0].reservePrice, "No Reserve");
  assert.equal(rows[1].title, "Example minting 10gm gold bar");
  assert.equal(rows[1].startPrice, "1");
  assert.equal(rows[1].reservePrice, "5,500");
});

test("unfamiliar typed rows recover dates/title/condition while leaving unlabeled amounts for one-field correction", () => {
  const row = [
    "11",
    "unfamiliar supplier",
    "arbitrary metadata",
    "Example typed-anchor listing",
    "12",
    "https://marketplace.example.invalid/auctions/detail/typed-anchor-example",
    "1",
    "5500",
    "6050",
    "New",
    "https://shop.example/only-photo-reference",
    "24 Oct 2026",
    "27 Oct 2026",
    "3 Days",
    "Online",
    {
      text: "Listing folder",
      url: "https://example-my.sharepoint.com/:f:/g/personal/example/typed-folder"
    },
    ...Array.from({ length: 16 }, (_, index) => `source annotation ${index}`)
  ];
  const loaded = core.parseSheet([row], "strict", { allowHeaderlessPhotoSource: true })[0];
  assert.equal(loaded.importMethod, "anchors");
  assert.equal(loaded.title, "Example typed-anchor listing");
  assert.equal(loaded.condition, "New");
  assert.equal(loaded.startDate, "2026-10-24");
  assert.equal(loaded.endDate, "2026-10-27");
  assert.equal(loaded.startPrice, "");
  assert.equal(loaded.reservePrice, "");
  assert.equal(
    loaded.descriptionUrl,
    "",
    "An unlabeled photo-reference URL must not become Description."
  );
  assert.equal(
    loaded.photosUrl,
    "https://example-my.sharepoint.com/:f:/g/personal/example/typed-folder"
  );
  assert.deepEqual(
    Array.from(loaded.importReview, (item) => item.field),
    ["startPrice", "reservePrice"]
  );
  assert.ok(loaded.importReview[0].candidates.some((candidate) => candidate.value === "5500"));
});

test("single-folder opt-in cannot override an explicit Photos header or take a product image file", () => {
  const names = [...core.layouts.sheet25];
  names[24] = "Photos";
  const explicit = core.parseSheet([names, goldRow()], "strict", {
    allowHeaderlessPhotoSource: true
  })[0];
  assert.equal(explicit.photosUrl, "");
  assert.equal(explicit.photosColumnMissing, true);
  assert.equal(
    core.parseSheet([goldRow()], "strict", {
      savedHeaders: names,
      allowHeaderlessPhotoSource: true
    })[0].photosUrl,
    "",
    "A remembered explicit Photos header stays excluded too."
  );
  for (const folder of [
    "https://example-my.sharepoint.com/:i:/g/personal/example/image",
    "https://example-my.sharepoint.com.evil.test/:f:/g/personal/example/folder",
    "https://example-my.sharepoint.com/personal/example/photo.jpg"
  ]) {
    const cells = goldRow();
    cells[24] = { text: "Source", url: folder };
    assert.equal(
      core.parseSheet([cells], "strict", { allowHeaderlessPhotoSource: true })[0].photosUrl,
      ""
    );
  }
  const twoFolders = goldRow();
  twoFolders[19] = "https://example-my.sharepoint.com/:f:/g/personal/example/another-folder";
  assert.equal(
    core.parseSheet([twoFolders], "strict", { allowHeaderlessPhotoSource: true })[0].photosUrl,
    "",
    "Two distinct folder links require an explicit source choice."
  );
});

test("status columns and remembered headers cannot make a padded row look like the Gold Weight layout", () => {
  const cells = paddedPerfume();
  cells[24] = "Pending";
  const row = core.parseSheet([cells], "strict", {
    year: 2026,
    savedHeaders: core.layouts.sheet25
  })[0];
  assert.equal(row.startPrice, "1");
  assert.equal(row.condition, "New");
  assert.equal(row.descriptionUrl, "https://shop.example/description");
});

test("Photos and link photos stay excluded, including when an older headerless source is ambiguous", () => {
  const names = [...core.layouts.sheet25],
    cells = names.map(() => "");
  for (const [name, value] of [
    ["Model - Title", "Example perfume"],
    ["Brand", "Example"],
    ["Category", "Perfume"],
    ["Start Price", "1"],
    ["Reserve Price", "No Reserve"],
    ["Condition", "New"],
    ["Start Date", "24 Oct 2026"],
    ["End Date", "25 Oct 2026"],
    ["Descale Photoes", "https://example-my.sharepoint.com/folder"]
  ])
    cells[names.indexOf(name)] = value;
  names[24] = "Photos";
  const row = core.parseSheet([names, cells])[0];
  assert.equal(row.photosUrl, "");
  assert.equal(row.photosColumnMissing, true);
  assert.ok(core.validate(row).issues.some((issue) => issue.includes("no Descale Photoes column")));
  const partial = core.parseSheet([cells])[0];
  assert.equal(partial.title, "Example perfume");
  assert.equal(partial.startPrice, "1");
  assert.equal(partial.photosUrl, "");
  assert.equal(partial.photosColumnAmbiguous, true);
});

test("duplicate Description columns reuse one source only when their populated contents agree", () => {
  const names = [...headers, "Description"],
    cells = [...data, "https://shop.example/product"];
  assert.equal(core.parseSheet([names, cells])[0].descriptionUrl, "https://shop.example/product");
  cells[cells.length - 1] = "Different description, 50 ml.";
  const row = core.parseSheet([names, cells])[0];
  assert.equal(row.descriptionUrl, "");
  assert.equal(row.descriptionSource, "");
  assert.ok(core.validate(row).issues.some((issue) => issue.includes("two Description columns")));
  row.descriptionSource = "Chosen description, 100 ml.";
  assert.ok(!core.validate(row).issues.some((issue) => issue.includes("two Description columns")));
});

test("genuinely absent sheet columns load with precise field issues instead of shifting nearby data", () => {
  const names = [...headers];
  names[names.indexOf("Brand")] = "";
  const row = core.parseSheet([names, data])[0];
  assert.equal(row.brand, "");
  assert.equal(row.startPrice, "1");
  assert.equal(row.condition, "New");
  assert.equal(row.photosUrl, data[12]);
  assert.deepEqual(Array.from(core.validate(row).issues), ["brand is missing."]);
});

test("copied date times, ordinals, yearless dates and Excel serial dates retain the intended day", () => {
  for (const input of [
    "10 Oct 9:00 PM",
    "10th October 9 PM",
    "10 Oct 2026 9:00 PM",
    "10th Oct 2026 12AM",
    "2026-10-10 21:00",
    46305.875
  ])
    assert.equal(core.parseDate(input, "strict", 2026), "2026-10-10", String(input));
  assert.equal(core.parseDate("10/11 9 PM", "dmy", 2026), "2026-11-10");
  assert.equal(core.parseDate("10/11 9 PM", "mdy", 2026), "2026-10-11");
  assert.equal(core.parseDate("24/10/2026"), "2026-10-24");
  assert.equal(core.parseDate("10/24/2026"), "2026-10-24");
  assert.equal(core.parseDate("24/10", "strict", 2026), "2026-10-24");
  assert.equal(core.parseDate("10/24", "strict", 2026), "2026-10-24");
  assert.equal(core.parseDate("10 Oct 2025 11:00 PM", "strict", 2026), "2025-10-10");
  for (const input of [
    "10 Oct 13 PM",
    "10 Oct 9:60 PM",
    "29 Feb 2026 9 PM",
    "10/11/26 9 PM",
    "24 Hours"
  ])
    assert.throws(() => core.parseDate(input, "strict", 2026));
});
test("all non-Saturdays use 9 PM without host timezone conversions", () => {
  for (const date of [
    "2026-10-25",
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30"
  ])
    assert.equal(core.startTime(date), "9:00");
  assert.equal(core.startTime("2026-10-31"), "10:00");
});
test("missing, ambiguous, impossible, past and reversed dates fail closed", () => {
  assert.equal(core.parseDate("NA"), "");
  assert.throws(() => core.parseDate("10/11/2026"), /explicitly chosen/);
  assert.equal(core.parseDate("10/11/2026", "dmy"), "2026-11-10");
  assert.equal(core.parseDate("10/11/2026", "mdy"), "2026-10-11");
  for (const value of ["2026-02-30", "2026-13-01", "01/01/26", "tomorrow"])
    assert.throws(() => core.parseDate(value));
  const row = parse();
  row.startDate = "";
  assert.equal(core.validate(row).valid, false);
  row.startDate = "2026-10-24";
  row.endDate = "2026-10-23";
  assert.equal(core.validate(row).valid, false);
  assert.equal(core.validate(parse(), { today: "2026-11-01" }).valid, false);
});
test("prices use strict decimals and cannot use invalid reserve amounts", () => {
  assert.equal(core.money("AED 1,234.50"), "1234.50");
  assert.equal(core.money("001.00"), "1");
  for (const amount of ["", "-1", "0", "1e3", "1,20", "1.234", "100 USD", "N/A"])
    assert.throws(() => core.money(amount));
  const row = parse();
  row.reservePrice = "";
  assert.equal(core.validate(row).valid, false);
  row.reservePrice = "0.50";
  assert.equal(core.validate(row).valid, false);
  row.reservePrice = "125";
  assert.equal(core.validate(row).plan.reservePrice, "125");
});
test("rich hyperlinks survive; Description never uses the link photos column", () => {
  const rich = data.map((text) => ({ text }));
  rich[12] = { text: "Product folder", url: data[12] };
  rich[10] = { text: "", url: "" };
  rich[11] = { text: "Product description", url: data[11] };
  const row = core.parseSheet([headers, rich])[0];
  assert.equal(row.photosUrl, data[12]);
  assert.equal(row.descriptionUrl, "");
  rich[10] = { text: "Fresh fragrance, 100 ml. Includes 2 bottles." };
  const words = core.parseSheet([headers, rich])[0];
  assert.equal(words.descriptionSource, rich[10].text);
  assert.equal(words.descriptionUrl, "");
  assert.equal(core.descriptionIssues(words.descriptionSource, words.description).length, 0);
  rich[12] = { text: "Product folder" };
  assert.equal(core.validate(core.parseSheet([headers, rich])[0]).valid, false);
  assert.equal(core.safeUrl("javascript:alert(1)"), "");
  assert.equal(core.safeUrl("https://user:secret@example.com/file"), "");
});
test("quoted multiline cells retain alignment and duplicates are flagged", () => {
  const tsv =
    headers.join("\t") +
    "\n" +
    data.map((value, index) => (index === 3 ? '"Example\nperfume 100 ml"' : value)).join("\t");
  assert.equal(core.parseSheet(tsv)[0].title, "Example perfume 100 ml");
  assert.throws(() => core.parseTSV('"unfinished'), /unfinished/);
  const rows = core.parseSheet([headers, data, data]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.issues.some((issue) => issue.includes("duplicate"))));
  const noPhoto = core.parseSheet([headers, data.slice(0, -1)])[0];
  assert.ok(core.validate(noPhoto).issues.some((issue) => issue.includes("Descale Photoes")));
  assert.ok(core.parseSheet([headers, [...data, "unexpected content"]])[0].importError);
});
test("conditions, Tamara values, missing photo links and lookalike hosts need review", () => {
  const row = parse();
  row.condition = "Used";
  assert.equal(core.validate(row).valid, false);
  row.condition = "New";
  row.tamara = "maybe";
  assert.equal(core.validate(row).valid, false);
  row.tamara = "";
  assert.equal(core.validate(row).plan.tamara, false);
  row.tamara = "No";
  assert.equal(core.validate(row).plan.tamara, false);
  row.photosUrl = "https://example-my.sharepoint.com.evil.test/folder";
  assert.equal(core.validate(row).valid, false);
});
test("description checks preserve numbers and bullets without approval gates, and reject invented claims", () => {
  const source = "Example perfume, 100 ml. Includes 2 bottles.",
    bullets = core.bulletize(source);
  assert.equal(core.descriptionIssues(source, bullets).length, 0);
  for (const text of [
    "• Example perfume, 200 ml. Includes 2 bottles.",
    "• Example perfume, 100 ml.",
    "• Certified example perfume, 100 ml. Includes 2 bottles.",
    "Example perfume, 100 ml. Includes 2 bottles.",
    "• This vehicle has perfume, 100 ml. Includes 2 bottles."
  ])
    assert.ok(core.descriptionIssues(source, text).length);
  const row = parse();
  row.descriptionSource = source;
  row.description = bullets;
  row.categoryPath = ["Lifestyle", "Beauty & Health", "Fragrance"];
  assert.equal(core.validate(row, { details: true }).valid, true);
  const stamp = core.fingerprint(row);
  row.startPrice = "2";
  assert.notEqual(core.fingerprint(row), stamp);
});
