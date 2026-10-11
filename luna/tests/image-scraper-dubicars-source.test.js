const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src/features/images/image-scraper-source.js"),
  "utf8"
);
const origin = "https://www.dubicars.com";
const photoIds = ["front.jpeg", "rear.jpeg", "cabin.jpeg"];
const fullSize = photoIds.map(
  (name, index) => `${origin}/images/large${index}/w_1300x760/dealer/${name}`
);
const thumbnails = photoIds.map(
  (name, index) => `${origin}/images/thumb${index}/130x76/dealer/${name}`
);

const makeRoot = (className, images = []) => ({
  className,
  closest: () => null,
  getAttribute: () => null,
  matches: () => false,
  querySelector: () => null,
  querySelectorAll: (selector) => (selector === "img" ? images : []),
  textContent: ""
});
const gallery = makeRoot("gallery thumbnails");
const main = makeRoot("main vehicle page");
gallery.parentElement = main;
const makeImage = (src, parentElement, naturalWidth, naturalHeight) => ({
  alt: "Land Rover Defender 110",
  className: "car photo",
  closest: () => null,
  currentSrc: src,
  getAttribute: (name) => (name === "src" ? src : null),
  naturalHeight,
  naturalWidth,
  parentElement,
  src,
  title: ""
});
const largeImages = fullSize.map((url) => makeImage(url, main, 1300, 731));
const smallImages = thumbnails.map((url) => makeImage(url, gallery, 130, 76));
gallery.querySelectorAll = (selector) => (selector === "img" ? smallImages : []);
main.querySelectorAll = (selector) => (selector === "img" ? [...largeImages, ...smallImages] : []);
const location = {
  hostname: "www.dubicars.com",
  href: `${origin}/2026-land-rover-defender-110.html`,
  origin,
  pathname: "/2026-land-rover-defender-110.html",
  search: ""
};
const document = {
  body: main,
  title: "Land Rover Defender 110",
  querySelector: (selector) => (selector === "main,[role='main']" ? main : null),
  querySelectorAll: (selector) => {
    if (selector === "img") return [...largeImages, ...smallImages];
    if (selector.includes("[class*='gallery'")) return [gallery];
    return [];
  }
};

(async () => {
  const capture = await vm.runInNewContext(source, {
    URL,
    document,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    location,
    setTimeout
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(capture.images.map((image) => image.url))),
    fullSize,
    "Ordered DubiCars thumbnails must resolve to their matching large gallery photos."
  );
  console.log("DubiCars full-size image selection tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
