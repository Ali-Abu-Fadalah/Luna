const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const origin = "https://example-my.sharepoint.com";
const item = (id) => `${origin}/_api/v2.0/drives/b!example/items/${id}`;

const tile = (name, urls, hidden = false) => ({
  hidden,
  querySelector: () => ({ getAttribute: () => name, textContent: name }),
  querySelectorAll: () => urls.map((src) => ({ src }))
});
const collect = (rows, hostname = "example-my.sharepoint.com") =>
  vm.runInNewContext(read("src/features/images/image-scraper-source.js"), {
    URL,
    location: new URL(`https://${hostname}/personal/example/_layouts/15/onedrive.aspx?id=example`),
    getComputedStyle: (row) => ({ display: row.hidden ? "none" : "block", visibility: "visible" }),
    document: {
      title: "Example product - OneDrive",
      querySelectorAll: () => rows
    }
  });

test("SharePoint collects original image files, with Main first and the remaining display order intact", async () => {
  const result = await collect([
    tile("Photo-3.png", [`${item("photo3")}/thumbnails/0/c144x96/content?cb=example`]),
    tile("Main.jpeg", [`${item("main")}/thumbnails/0/c144x96/content?prefer=noredirect`]),
    tile("Photo-2.png", [`${item("photo2")}/thumbnails/0/large/content`]),
    tile("Duplicate.png", [`${item("photo3")}/thumbnails/0/large/content`]),
    tile("Notes.pdf", [`${item("notes")}/thumbnails/0/large/content`]),
    tile("Hidden.png", [`${item("hidden")}/thumbnails/0/large/content`], true),
    tile("Foreign.png", [
      "https://example-other.sharepoint.com/_api/v2.0/drives/b!other/items/photo/thumbnails/0/large/content"
    ]),
    tile("Icon.png", ["https://cdn.example.com/photo.svg"]),
    tile("Bad.png", ["not an image"])
  ]);
  assert.deepEqual(
    Array.from(result.images, ({ alt, url }) => ({ alt, url })),
    [
      { alt: "Main.jpeg", url: `${item("main")}/content` },
      { alt: "Photo-3.png", url: `${item("photo3")}/content` },
      { alt: "Photo-2.png", url: `${item("photo2")}/content` }
    ]
  );
  assert.equal(result.sourceTitle, "Example product - OneDrive");
  assert.equal(result.sourceUrl.startsWith(origin), true);
});

test("SharePoint respects the existing twenty-image cap and does not fill from page icons", async () => {
  const rows = Array.from({ length: 25 }, (_, index) =>
    tile(`Photo-${index}.png`, [`${item(`photo${index}`)}/thumbnails/0/large/content`])
  );
  assert.equal((await collect(rows)).images.length, 20);
  assert.equal((await collect([tile("Folder", [])])).images.length, 0);
});

test("any Ayshei draft ID at step 2 is accepted; other numbered steps and lookalike hosts are excluded", () => {
  const context = { URL };
  vm.runInNewContext(read("src/features/images/image-scraper-core.js"), context);
  const target = {
    id: 2,
    url: "https://marketplace.example.invalid/place-ad/example-draft?step=2"
  };
  const wrong = { id: 3, url: "https://marketplace.example.invalid/place-ad/other-draft?step=1" };
  assert.equal(
    context.LunaImageScraperCore.selectAysheiTargetTab({ id: 1 }, [wrong, target]),
    target
  );
  assert.throws(
    () => context.LunaImageScraperCore.selectAysheiTargetTab({ id: 1 }, [wrong]),
    /Open one Ayshei/
  );
  assert.throws(
    () =>
      context.LunaImageScraperCore.selectAysheiTargetTab({ id: 1 }, [
        { id: 4, url: "https://marketplace.example.invalid.evil.test/place-ad/example?step=2" }
      ]),
    /Open one Ayshei/
  );
});

test("public image reads omit credentials and reject authenticated SharePoint sources", async () => {
  const background = read("src/background/background.js");
  const functions = background.slice(
    background.indexOf("const fetchPublicImage ="),
    background.indexOf("chrome.runtime.onMessage.addListener")
  );
  const calls = [];
  const context = {
    URL,
    AbortController,
    Uint8Array,
    btoa,
    setTimeout,
    clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options });
      let done = false;
      return {
        ok: true,
        headers: { get: (name) => (name === "content-type" ? "image/png" : "3") },
        body: {
          getReader: () => ({
            read: async () =>
              done
                ? { done: true }
                : ((done = true), { done: false, value: new Uint8Array([1, 2, 3]) }),
            releaseLock() {},
            cancel: async () => {}
          })
        }
      };
    }
  };
  vm.runInNewContext(`${functions}\nglobalThis.fetchImage = fetchPublicImage;`, context);
  for (const url of [
    `${item("main")}/content`,
    `${item("main")}/content?token=example`,
    "https://example-my.sharepoint.com.evil.test/_api/v2.0/drives/example/items/main/content"
  ])
    await assert.rejects(context.fetchImage(url), /public HTTPS image URL/);
  assert.equal(calls.length, 0);
  await context.fetchImage("https://dbz-images.dubizzle.com/example.png");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.referrerPolicy, "no-referrer");
});
