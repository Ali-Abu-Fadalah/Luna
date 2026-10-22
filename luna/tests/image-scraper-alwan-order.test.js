const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../src/features/images/image-scraper-fill.js"),
  "utf8"
);

const run = async (options = {}) => {
  let listener;
  let now = 0;
  let pending;
  const photos = options.existing ? ["https://cdn.test/existing.jpg"] : [];
  const selections = [];
  const receipts = [];
  const mainReceipts = [];
  const downloaded = [];
  const assigned = [];
  let releaseLastDownload;
  let lastDownloadReleased = false;
  const gallery = {
    querySelector: () => null,
    querySelectorAll: () => photos.map((src) => ({ src, getAttribute: () => src }))
  };
  const dropzone = { parentElement: { querySelector: () => gallery } };
  const input = {
    accept: "image/jpeg",
    closest: () => dropzone,
    disabled: false,
    files: [],
    getAttribute: () => "",
    multiple: true,
    dispatchEvent: () => {
      assert.equal(pending, undefined, "Never overlap Alwan upload requests.");
      if (releaseLastDownload && !lastDownloadReleased) {
        lastDownloadReleased = true;
        releaseLastDownload();
      }
      selections.push({
        names: input.files.map((file) => file.name),
        time: now,
        savedBefore: photos.filter((src) => !src.startsWith("blob:"))
      });
      assigned.push(...input.files.map((file) => file.name));
      input.disabled = true;
      const offset = photos.length;
      photos.push(...input.files.map((file) => `blob:${file.name}`));
      pending = {
        at: now + (options.delays?.[selections.length - 1] ?? 100),
        files: [...input.files],
        offset
      };
    }
  };
  const context = {
    // An older listener may still be installed in the user's open draft tab.
    __lunaImageScraperFillInstalled: true,
    atob,
    Blob,
    File,
    URL,
    Date: { now: () => now },
    clearTimeout: () => {},
    DataTransfer: class {
      constructor() {
        this.files = [];
        this.items = { add: (file) => this.files.push(file) };
      }
    },
    Event: class {},
    LunaImageUploadCore: {
      makeUploadPlan: () => ({ contentType: "image/jpeg", needsConversion: false }),
      normalizeContentType: () => "image/jpeg"
    },
    chrome: {
      runtime: {
        id: "luna-test",
        onMessage: { addListener: (fn) => (listener = fn) },
        sendMessage: async (message) => {
          if (message.type === "luna.imageScraper.mainRetained") {
            assert.equal(input.disabled, false);
            assert.deepEqual(photos, ["https://cdn.test/luna-car-01.jpg"]);
            mainReceipts.push({ message, time: now, selections: selections.length });
            return {};
          }
          if (message.type === "luna.imageScraper.selected") {
            receipts.push({ message, time: now, selections: selections.length });
            return {};
          }
          downloaded.push(message.url);
          if (options.slowLastDownload && message.url.endsWith(`${options.count || 3}.jpg`)) {
            await new Promise((resolve) => {
              releaseLastDownload = resolve;
            });
          }
          // Finish downloads in reverse order; Promise.all must retain review order.
          if (message.url.endsWith("1.jpg")) await Promise.resolve();
          return (options.downloadFailure && message.url.endsWith("2.jpg")) ||
            (options.mainDownloadFailure && message.url.endsWith("1.jpg"))
            ? { ok: false }
            : { ok: true, data: { base64: "/9j/", contentType: "image/jpeg" } };
        }
      }
    },
    createImageBitmap: async () => ({ height: 760, width: 1300 }),
    document: { querySelectorAll: () => [input] },
    location: { hostname: "marketplace.example.invalid", pathname: "/place-ad/test" },
    setTimeout: (resolve, milliseconds) => {
      now += milliseconds;
      if (
        pending &&
        now >= pending.at &&
        !options.stalled &&
        options.stalledAt !== selections.length
      ) {
        const { files, offset } = pending;
        photos.splice(
          offset,
          files.length,
          ...files.map((file) => `https://cdn.test/${file.name}`)
        );
        pending = undefined;
        input.disabled = false;
        if (options.reorder && photos.length === (options.count || 3)) photos.reverse();
        if (options.reorderTail && photos.length > 1)
          photos.splice(1, photos.length - 1, ...photos.slice(1).reverse());
      }
      resolve();
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const operation = new Promise((resolve) => {
    listener(
      {
        images: Array.from({ length: options.count || 3 }, (_, i) => ({
          url: `https://alwanworld.com/${i + 1}.jpg`
        })),
        sourceUrl: options.sourceUrl ?? "https://alwanworld.com/vehicle/example/",
        type: "luna.imageScraper.upload.v2",
        uploadId: "alwan-test"
      },
      { id: "luna-test" },
      resolve
    );
  });
  let timer;
  const response = await Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("First upload waited for the slow last download.")),
        2000
      );
    })
  ]).finally(() => clearTimeout(timer));
  return { assigned, downloaded, now, photos, receipts, mainReceipts, response, selections };
};

(async () => {
  const ordered = await run({ delays: [450, 50, 200] });
  assert.equal(ordered.response.ok, true);
  assert.deepEqual(
    ordered.selections.map((selection) => selection.names),
    [["luna-car-01.jpg"], ["luna-car-02.jpg"], ["luna-car-03.jpg"]]
  );
  assert.deepEqual(
    ordered.selections.map((selection) => selection.time),
    [0, 450, 500]
  );
  assert.deepEqual(
    ordered.photos,
    ordered.assigned.map((name) => `https://cdn.test/${name}`)
  );
  assert.equal(ordered.receipts.length, 1);
  assert.equal(ordered.receipts[0].selections, 1, "Start details while ordered uploads continue.");
  assert.equal(ordered.receipts[0].message.count, 3);
  assert.equal(ordered.downloaded.length, 3);
  assert.ok(ordered.now < 3000, "No eight-second retention delay on the ordered path.");

  const fullGallery = await run({ count: 20 });
  assert.equal(fullGallery.response.ok, true);
  assert.equal(fullGallery.selections.length, 20);
  assert.ok(fullGallery.now < 5000, "Twenty fast server receipts should finish promptly.");

  const realisticGallery = await run({ count: 20, delays: Array(20).fill(2000) });
  assert.equal(realisticGallery.response.ok, true);
  assert.equal(
    realisticGallery.selections.length,
    20,
    "Keep uploading past photo 13 and the former 25-second cutoff."
  );
  assert.ok(realisticGallery.now > 40000);
  assert.deepEqual(
    realisticGallery.photos,
    realisticGallery.assigned.map((name) => `https://cdn.test/${name}`)
  );

  const pipelined = await run({ count: 20, slowLastDownload: true });
  assert.equal(
    pipelined.response.ok,
    true,
    "The first photo must upload while later downloads are still pending."
  );
  assert.equal(pipelined.selections.length, 20);

  for (const sourceUrl of [
    "https://other-vendor.test/car",
    "https://alwanworld.com.evil.test/car",
    "https://other-vendor.test/?url=https://alwanworld.com/car",
    "invalid URL"
  ]) {
    const other = await run({ sourceUrl });
    assert.equal(other.response.ok, true);
    assert.equal(other.selections.length, 1, "Other vendors retain batch uploads.");
    assert.equal(other.selections[0].names.length, 3);
  }
  assert.equal(
    (await run({ sourceUrl: "https://www.alwanworld.com/vehicle/car" })).selections.length,
    3
  );

  const sharePoint =
    "https://example-my.sharepoint.com/personal/example/_layouts/15/onedrive.aspx?id=example";
  const product = await run({ sourceUrl: sharePoint, count: 5, delays: [450, 100] });
  assert.equal(product.response.ok, true);
  assert.equal(
    product.selections.length,
    2,
    "SharePoint uploads the cover alone, followed by one batch for the remaining originals."
  );
  assert.deepEqual(
    product.selections.map((selection) => selection.names),
    [
      ["luna-car-01.jpg"],
      ["luna-car-02.jpg", "luna-car-03.jpg", "luna-car-04.jpg", "luna-car-05.jpg"]
    ]
  );
  assert.equal(product.selections[1].time, 450);
  assert.equal(product.mainReceipts.length, 1);
  assert.equal(product.mainReceipts[0].time, 450, "Signal only after the saved cover receipt.");
  assert.equal(product.mainReceipts[0].selections, 1, "Signal before uploading the remainder.");
  assert.equal(product.mainReceipts[0].message.uploadId, "alwan-test");
  assert.deepEqual(
    product.selections[1].savedBefore,
    ["https://cdn.test/luna-car-01.jpg"],
    "Wait for a saved cover before starting the remainder."
  );
  assert.deepEqual(
    product.photos,
    product.assigned.map((name) => `https://cdn.test/${name}`)
  );
  const productPipelined = await run({ sourceUrl: sharePoint, count: 20, slowLastDownload: true });
  assert.equal(
    productPipelined.response.ok,
    true,
    "Do not delay the cover while a later download is pending."
  );
  assert.deepEqual(
    productPipelined.selections.map((selection) => selection.names.length),
    [1, 19]
  );
  const tailReordered = await run({ sourceUrl: sharePoint, count: 5, reorderTail: true });
  assert.equal(tailReordered.response.ok, true, "The remaining images may finish in any order.");
  assert.equal(tailReordered.photos[0], "https://cdn.test/luna-car-01.jpg");
  const mainReordered = await run({ sourceUrl: sharePoint, count: 5, reorder: true });
  assert.equal(
    mainReordered.response.ok,
    false,
    "The cover must remain first even during the batch."
  );
  const mainFailure = await run({ sourceUrl: sharePoint, count: 5, mainDownloadFailure: true });
  assert.equal(mainFailure.response.ok, false);
  assert.equal(mainFailure.mainReceipts.length, 0);
  assert.equal(
    mainFailure.selections.length,
    0,
    "Never send the remainder when the main image cannot be prepared."
  );
  const mainStalled = await run({ sourceUrl: sharePoint, count: 5, stalled: true });
  assert.equal(mainStalled.response.ok, false);
  assert.equal(
    mainStalled.mainReceipts.length,
    0,
    "A temporary preview cannot start field filling."
  );
  assert.equal(
    mainStalled.selections.length,
    1,
    "Never start the remainder before the cover is saved."
  );
  const batchStalled = await run({ sourceUrl: sharePoint, count: 5, stalledAt: 2 });
  assert.equal(batchStalled.response.ok, false);
  assert.equal(batchStalled.selections.length, 2);
  assert.match(batchStalled.response.detail, /remaining photos.*60 seconds/);
  const productFailure = await run({ sourceUrl: sharePoint, count: 5, downloadFailure: true });
  assert.equal(productFailure.response.ok, false);
  assert.equal(
    productFailure.selections.length,
    1,
    "A failed original cannot silently reorder the product gallery."
  );
  assert.equal(
    (await run({ sourceUrl: "https://example-my.sharepoint.com.evil.test/folder" })).selections
      .length,
    1
  );

  const existing = await run({ existing: true });
  assert.equal(existing.response.ok, false);
  assert.match(existing.response.detail, /empty, idle/);
  assert.equal(existing.selections.length, 0);

  const stalled = await run({ stalled: true });
  assert.equal(stalled.response.ok, false);
  assert.match(stalled.response.detail, /stopped at photo 1\/3/);
  assert.equal(stalled.selections.length, 1, "Do not send the next image after a failed receipt.");
  assert.equal(stalled.now, 15000, "A genuinely stalled photo has its own timeout.");

  const reordered = await run({ reorder: true });
  assert.equal(reordered.response.ok, false);
  assert.match(reordered.response.detail, /changed the saved photo order/);

  const missing = await run({ downloadFailure: true, count: 4 });
  assert.equal(missing.response.ok, false);
  assert.match(missing.response.detail, /photo 2\/4 could not be prepared/);
  assert.equal(
    missing.selections.length,
    1,
    "Do not skip a failed photo or send later photos out of order."
  );
  console.log("Alwan image upload order tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
