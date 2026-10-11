const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const context = { Array, Math, Number, Object, Set, String, URL };
context.globalThis = context;
vm.runInNewContext(read("src/features/images/image-scraper-core.js"), context);
vm.runInNewContext(read("src/features/images/image-upload-core.js"), context);
const core = context.LunaImageScraperCore;
const uploadCore = context.LunaImageUploadCore;

const draft = core.sanitizeCapture({
  images: [
    { alt: "Front", url: "https://cdn.vendor.test/car/front.jpg?w=1600&q=90" },
    { alt: "Front duplicate", url: "https://cdn.vendor.test/car/front.jpg?w=400" },
    { alt: "Rear", url: "/car/rear.jpg" },
    { alt: "Interior", url: "/car/interior.webp" }
  ],
  sourceTitle: "2024 Example Car",
  sourceUrl: "https://vendor.test/ad/123"
});

assert.equal(draft.images.length, 3);
assert.equal(
  draft.images[0].url,
  "https://cdn.vendor.test/car/front.jpg?w=1600&q=90",
  "The high-quality request URL must be kept while a separate canonical key deduplicates it."
);
assert.equal(draft.images[1].url, "https://vendor.test/car/rear.jpg");
assert.equal(core.validate(draft).isReady, true);

assert.equal(
  core.canonicalImageKey(
    "https://content.deal-drive.com/thumbs/abcdefabcdefabcdefabcdefabcdefab/fit-288xauto.webp?v=2"
  ),
  core.canonicalImageKey(
    "https://content.deal-drive.com/thumbs/abcdefabcdefabcdefabcdefabcdefab/orig.webp?v=2"
  ),
  "Deal Drive thumbnail and original paths must represent one photograph."
);
assert.equal(
  core.canonicalImageKey("https://vendor.test/wp-content/uploads/2026/07/car-167x93.webp"),
  core.canonicalImageKey("https://vendor.test/wp-content/uploads/2026/07/car.webp"),
  "WordPress gallery thumbnails and original files must represent one photograph."
);
assert.equal(
  core.fullSizeImageUrl(
    "https://www.dubicars.com/images/fdcb07/130x76/al-rawnaq-motors/33533f6c-475d-4504-9c75-3cef8e66cc70.jpeg"
  ),
  "https://www.dubicars.com/images/fdcb07/130x76/al-rawnaq-motors/33533f6c-475d-4504-9c75-3cef8e66cc70.jpeg"
);
assert.equal(
  core.prepareImages(
    [
      "https://www.dubicars.com/images/fdcb07/130x76/al-rawnaq-motors/33533f6c-475d-4504-9c75-3cef8e66cc70.jpeg"
    ],
    "https://www.dubicars.com/example.html"
  )[0].url,
  "https://www.dubicars.com/images/fdcb07/130x76/al-rawnaq-motors/33533f6c-475d-4504-9c75-3cef8e66cc70.jpeg"
);
assert.equal(
  core.fullSizeImageUrl(
    "https://www.dubicars.com/images/171c62/w_1300x760/al-rawnaq-motors/33533f6c-475d-4504-9c75-3cef8e66cc70.jpeg"
  ),
  "https://www.dubicars.com/images/171c62/w_1300x760/al-rawnaq-motors/33533f6c-475d-4504-9c75-3cef8e66cc70.jpeg"
);

const smallJpegPlan = uploadCore.makeUploadPlan({
  accept: "image/*",
  contentType: "image/jpeg",
  height: 76,
  width: 130
});
assert.equal(smallJpegPlan.needsConversion, true);
assert.equal(smallJpegPlan.width, 547);
assert.equal(smallJpegPlan.height, 320);
assert.ok(smallJpegPlan.width > 300 && smallJpegPlan.height > 300);
assert.equal(smallJpegPlan.contentType, "image/jpeg");
const boundaryPlan = uploadCore.makeUploadPlan({
  accept: "image/jpeg",
  contentType: "image/jpeg",
  height: 300,
  width: 300
});
assert.equal(boundaryPlan.needsConversion, true);
assert.equal(boundaryPlan.width, 320);
assert.equal(boundaryPlan.height, 320);
const fullJpegPlan = uploadCore.makeUploadPlan({
  accept: "image/*",
  contentType: "image/jpeg",
  height: 760,
  width: 1300
});
assert.equal(fullJpegPlan.needsConversion, false);
assert.equal(fullJpegPlan.contentType, "image/jpeg");
const webpPlan = uploadCore.makeUploadPlan({
  accept: "image/*",
  contentType: "image/webp",
  height: 760,
  width: 1300
});
assert.equal(webpPlan.needsConversion, true);
assert.equal(webpPlan.contentType, "image/jpeg");
const jpegOnlyPlan = uploadCore.makeUploadPlan({
  accept: "image/jpeg",
  contentType: "image/png",
  height: 400,
  width: 600
});
assert.equal(jpegOnlyPlan.needsConversion, true);
assert.equal(jpegOnlyPlan.contentType, "image/jpeg");
assert.throws(
  () => uploadCore.makeUploadPlan({ contentType: "image/jpeg", height: 0, width: 300 }),
  /dimensions could not be read/
);

const initialIds = draft.images.map((image) => image.id);
const mainChanged = core.moveImage(draft.images, initialIds[2], 0);
assert.equal(mainChanged[0].id, initialIds[2]);
assert.deepEqual(JSON.parse(JSON.stringify(mainChanged.map((image) => image.id))), [
  initialIds[2],
  initialIds[0],
  initialIds[1]
]);

const movedBefore = core.moveBefore(mainChanged, initialIds[1], initialIds[0]);
assert.deepEqual(JSON.parse(JSON.stringify(movedBefore.map((image) => image.id))), [
  initialIds[2],
  initialIds[1],
  initialIds[0]
]);
assert.equal(core.removeImage(movedBefore, initialIds[2]).length, 2);
assert.equal(
  core.validate({ images: core.removeImage(movedBefore, initialIds[2]) }).isReady,
  false
);

const activeAysheiTab = {
  id: 10,
  index: 4,
  windowId: 1,
  url: "https://marketplace.example.invalid/place-ad/images"
};
assert.equal(
  core.selectAysheiTargetTab(activeAysheiTab, []),
  activeAysheiTab,
  "The current Ayshei placement tab remains the target."
);

const onlyOpenTarget = {
  id: 20,
  index: 8,
  windowId: 1,
  url: "https://marketplace.example.invalid/place-ad/vehicle/images"
};
assert.equal(
  core.selectAysheiTargetTab({ id: 11, index: 2, windowId: 1, url: "https://vendor.test/ad/123" }, [
    onlyOpenTarget
  ]),
  onlyOpenTarget,
  "One open placement tab is safe to target while the vendor tab stays active."
);

const nearestOpenTarget = {
  id: 21,
  index: 3,
  windowId: 1,
  url: "https://marketplace.example.invalid/place-ad/near/images"
};
assert.equal(
  core.selectAysheiTargetTab({ id: 12, index: 1, windowId: 1, url: "https://vendor.test/ad/456" }, [
    nearestOpenTarget,
    {
      id: 22,
      index: 7,
      windowId: 1,
      url: "https://marketplace.example.invalid/place-ad/far/images"
    },
    {
      id: 23,
      index: 2,
      windowId: 2,
      url: "https://marketplace.example.invalid/place-ad/other-window/images"
    }
  ]),
  nearestOpenTarget,
  "The uniquely nearest placement tab in the vendor window is selected."
);

assert.throws(
  () =>
    core.selectAysheiTargetTab(
      { id: 13, index: 4, windowId: 1, url: "https://vendor.test/ad/789" },
      [
        {
          id: 24,
          index: 3,
          windowId: 1,
          url: "https://marketplace.example.invalid/place-ad/left/images"
        },
        {
          id: 25,
          index: 5,
          windowId: 1,
          url: "https://marketplace.example.invalid/place-ad/right/images"
        }
      ]
    ),
  /More than one Ayshei place-ad tab/
);
assert.throws(
  () =>
    core.selectAysheiTargetTab(
      { id: 14, index: 1, windowId: 1, url: "https://vendor.test/ad/999" },
      [
        {
          id: 26,
          index: 1,
          windowId: 2,
          url: "https://marketplace.example.invalid/place-ad/one/images"
        },
        {
          id: 27,
          index: 2,
          windowId: 3,
          url: "https://marketplace.example.invalid/place-ad/two/images"
        }
      ]
    ),
  /More than one Ayshei place-ad tab/
);
assert.throws(
  () =>
    core.selectAysheiTargetTab(
      { id: 15, index: 1, windowId: 1, url: "https://vendor.test/ad/none" },
      [{ id: 28, index: 2, windowId: 1, url: "https://example.com/place-ad/not-ayshei" }]
    ),
  /Open one Ayshei place-ad image step/
);

const html = read("sidepanel.html");
const ui = read("src/features/images/image-scraper.js");
const source = read("src/features/images/image-scraper-source.js");
const fill = read("src/features/images/image-scraper-fill.js");
const uploadCoreSource = read("src/features/images/image-upload-core.js");
const css = read("src/features/images/image-scraper.css");
const rotatingHarness = read("tests/fixtures/image-scraper-rotating-harness.html");
const manifest = JSON.parse(read("manifest.json"));

[
  "image-scraper-collect",
  "image-scraper-import",
  "image-scraper-list",
  "image-scraper-undo",
  "src/features/images/image-scraper-core.js",
  "src/features/images/image-scraper.js"
].forEach((value) => assert.match(html, new RegExp(value)));
assert.match(html, /Scrollable car images in upload order/);
const imageGalleryTag = html.match(/<ul\b[^>]*id="image-scraper-list"[^>]*>/)?.[0];
assert.ok(imageGalleryTag, "Manual Images must retain the image review gallery.");
assert.match(imageGalleryTag, /tabindex="0"/);
assert.match(imageGalleryTag, /aria-describedby="image-scraper-help"/);
assert.match(html, /id="image-scraper-help"/);
const listingsSectionIndex = html.indexOf('<section class="listings-scraper-view"');
const manualSectionIndex = html.indexOf('<section class="manual-ad-view"');
const imageCardIndex = html.indexOf('<article class="image-scraper-card"');
assert.ok(listingsSectionIndex >= 0 && manualSectionIndex > listingsSectionIndex);
assert.ok(
  imageCardIndex > manualSectionIndex,
  "The image scraper card must appear only inside Manual Ad Assistant."
);
assert.equal(html.split('<article class="image-scraper-card"').length - 1, 1);
assert.match(ui, /luna\.imageScraper\.upload/);
assert.match(ui, /Make main/);
assert.doesNotMatch(ui, /Drag any photo/);
assert.match(ui, /Move image \$\{index \+ 1\} up/);
assert.match(ui, /Undo last removal|Removed image restored/);
assert.doesNotMatch(ui, /dragstart|dragover|dropEffect/);
assert.match(ui, /url: "https:\/\/marketplace\.example\.invalid\/place-ad\/\*"/);
assert.match(ui, /selectAysheiTargetTab/);
assert.match(ui, /sectionId === "manual-ad-assistant"/);
assert.match(ui, /const UPLOAD_TIMEOUT_MS = 90000/);
assert.match(ui, /const sendImagesToTab = async \(tabId, onSelected\)/);
assert.match(ui, /chrome\.runtime\.onMessage\.addListener\(selectedListener\)/);
assert.match(ui, /sender\?\.tab\?\.id !== tabId/);
assert.match(ui, /uploadId/);
assert.match(ui, /thumbnailFallback/);
assert.match(ui, /backgroundFetchAttempted/);
assert.match(ui, /data:\$\{contentType\};base64/);
assert.match(ui, /messageTypes\.imageFetch/);
assert.match(
  ui,
  /files:\s*\[\s*"src\/features\/images\/image-upload-core\.js",\s*"src\/features\/images\/image-scraper-fill\.js"\s*\]/
);
assert.match(ui, /async collectForManualAd\(\)/);
assert.match(ui, /async uploadToAysheiTab\(tabId, onSelected\)/);
assert.match(ui, /verifyOnAysheiTab/);
assert.match(ui, /response\.result\?\.retained !== true/);
assert.match(ui, /async clearForManualAd\(\)/);
assert.match(ui, /Ayshei did not confirm that its gallery kept the images within 90 seconds/);
assert.doesNotMatch(ui, /chrome\.tabs\.(?:create|update)/);
const failedImportGuardIndex = ui.indexOf("if (!response?.ok)");
assert.ok(failedImportGuardIndex >= 0);
assert.match(ui, /Luna kept this image review/);
assert.match(ui, /event\.key === "Home"/);
assert.match(ui, /event\.key === "Delete"/);
assert.match(source, /unrelatedWords/);
assert.match(source, /related|similar/);
assert.match(source, /lightbox/);
assert.match(source, /data-full-src/);
assert.match(source, /location\.origin[\s\S]*location\.pathname[\s\S]*location\.search/);
assert.doesNotMatch(source, /url\.href === location\.href/);
assert.doesNotMatch(source, /lindaCarsImages|lindacars\.com/);
assert.match(source, /content\.deal-drive\.com/);
assert.match(source, /indexDubiCarsLargeImages/);
assert.match(source, /dubiCarsPhotoKey/);
assert.match(source, /const bestSource = bestSourceFor\(image\)/);
assert.match(source, /wp-content\\\/uploads/);
assert.match(source, /thumbnailLike/);
assert.match(source, /preferStableThumbnails/);
assert.match(source, /stableThumbnails/);
assert.match(source, /collectRotatingCarouselImages/);
assert.match(source, /\.sell-car-slider-main \.car-slider-top/);
assert.match(source, /\.mobile-dot-indicators \.dot/);
assert.match(source, /dot\.click\(\)/);
assert.match(source, /waitForDotSelection/);
assert.doesNotMatch(source, /homecards-arrow-btn/);
assert.match(source, /await collectRotatingCarouselImages\(\)/);
assert.match(source, /rotatingCarouselImages\.length/);
assert.match(source, /slice\(0, 20\)/);
assert.match(rotatingHarness, /length: 18/);
assert.match(rotatingHarness, /let activeIndex = 7/);
assert.match(rotatingHarness, /image-scraper-source\.js/);
assert.doesNotMatch(ui, /differenceHash|createImageBitmap|selectUniqueCandidates/);
assert.doesNotMatch(ui, /luna\.manualAd\.fetchImage/);
assert.match(fill, /Promise\.all/);
assert.match(fill, /images\.map\(async \(image, index\)/);
assert.match(fill, /createImageBitmap/);
assert.match(fill, /canvas\.toBlob/);
assert.match(fill, /makeUploadPlan/);
assert.match(fill, /130x76/);
assert.match(fill, /input\.accept/);
assert.match(fill, /normalized/);
assert.match(uploadCoreSource, /MIN_DIMENSION = 320/);
assert.match(uploadCoreSource, /SAFE_TYPES/);
assert.match(uploadCoreSource, /image\/png/);
assert.match(uploadCoreSource, /MAX_CONVERTED_EDGE = 2400/);
assert.doesNotMatch(fill, /Math\.min\(3, images\.length\)|sha256|const hashes/);
assert.match(fill, /DataTransfer/);
assert.match(fill, /waitForRetention/);
assert.match(fill, /retainedCount/);
assert.match(fill, /luna\.imageScraper\.verify/);
assert.match(fill, /composed: true/);
assert.doesNotMatch(fill, /\.click\(/);
assert.doesNotMatch(fill, /requestSubmit|\.submit\(/);
assert.match(css, /\.image-scraper-item-actions button/);
assert.match(css, /grid-template-columns:\s*82px minmax\(0, 1fr\)/);
assert.match(css, /max-height:\s*min\(300px, 45vh\)/);
assert.match(css, /overflow-y:\s*auto/);
assert.match(css, /scrollbar-width:\s*thin/);
assert.match(
  css,
  /@media \(max-width: 420px\)[\s\S]*\.image-scraper-item-actions \.is-remove[\s\S]*grid-column:\s*1 \/ -1/
);
assert.doesNotMatch(css, /overflow-x:\s*auto/);
assert.equal(manifest.version, "2.0.2");
assert.ok(manifest.optional_host_permissions.includes("https://*/*"));

console.log("Image scraper tests passed.");
