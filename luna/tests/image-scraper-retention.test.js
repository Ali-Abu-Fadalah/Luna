const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src/features/images/image-scraper-fill.js"),
  "utf8"
);

const check = async (
  previewCounts,
  expectedSuccess,
  operation = "verify",
  expectedMain = "",
  photoSource = "blob:https://marketplace.example.invalid/preview"
) => {
  let tick = 0;
  let listener;
  let changeFired = false;
  const order = [];
  const selections = [];
  const gallery = {
    querySelector: () => null,
    querySelectorAll: () =>
      Array.from({ length: previewCounts[Math.min(tick, previewCounts.length - 1)] }, () => ({
        src: photoSource,
        getAttribute: () => photoSource
      }))
  };
  const layout = { querySelector: () => gallery };
  const dropzone = { parentElement: layout };
  const input = {
    accept: "image/jpeg,.jpg",
    closest: () => dropzone,
    disabled: false,
    files: { length: 20 },
    getAttribute: () => "",
    multiple: true,
    dispatchEvent: () => {
      changeFired = true;
      order.push("changed");
    }
  };
  const context = {
    atob,
    Blob,
    File,
    DataTransfer: class {
      constructor() {
        const files = [];
        this.items = { add: (file) => files.push(file) };
        this.files = files;
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
        onMessage: {
          addListener: (fn) => {
            listener = fn;
          }
        },
        sendMessage: async (message) => {
          if (message.type === "luna.imageScraper.selected") {
            assert.equal(changeFired, true, "Ayshei's upload change event must fire first.");
            assert.equal(input.files.length, 3);
            selections.push(message);
            order.push("selected");
            return {};
          }
          return { ok: true, data: { base64: "/9j/", contentType: "image/jpeg" } };
        }
      }
    },
    createImageBitmap: async () => ({ height: 760, width: 1300 }),
    document: { querySelectorAll: () => [input] },
    location: { hostname: "marketplace.example.invalid", pathname: "/place-ad/test" },
    setTimeout: (resolve) => {
      tick += 1;
      resolve();
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const response = await new Promise((resolve) => {
    const message =
      operation === "upload"
        ? {
            images: [1, 2, 3].map((i) => ({ url: `https://vendor.test/${i}.jpg` })),
            type: "luna.imageScraper.upload.v2",
            uploadId: "test-upload"
          }
        : { expectedCount: 3, expectedMain, type: "luna.imageScraper.verify.v2" };
    listener(message, { id: "luna-test" }, (value) => {
      order.push("completed");
      resolve(value);
    });
  });
  assert.equal(response.ok, expectedSuccess);
  if (operation === "upload") {
    assert.equal(selections.length, 1);
    assert.equal(selections[0].count, 3);
    assert.equal(selections[0].uploadId, "test-upload");
    assert.deepEqual(order, ["changed", "selected", "completed"]);
  }
  if (expectedSuccess) assert.equal(response.result.retainedCount, 3);
  if (operation === "upload" && previewCounts[0] === 3 && previewCounts.includes(0)) {
    assert.match(response.detail, /removed the temporary image previews/);
  }
};

(async () => {
  await check([0], false);
  await check([3, 3, 0, 0, 0, 0], false);
  await check([3, 3, 3, 3], true);
  await check([0], false, "upload");
  await check([3, 3, 0], false, "upload");
  await check([3], true, "upload");
  await check([3], true, "verify", "https://cdn.test/main.jpg", "https://cdn.test/main.jpg");
  await check(
    [3],
    false,
    "verify",
    "https://cdn.test/main.jpg",
    "https://cdn.test/changed-main.jpg"
  );
  assert.doesNotMatch(source, /lastState\.fileCount\s*>=\s*expectedCount/);
  assert.match(source, /stableRequired = 16/);
  assert.doesNotMatch(source, /assignFiles\(retryInput/);
  console.log("Image retention tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
