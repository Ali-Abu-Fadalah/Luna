const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src/features/images/image-scraper-source.js"),
  "utf8"
);
const origin = "https://dubai.dubizzle.com";
const photoUrls = Array.from(
  { length: 12 },
  (_, index) =>
    `https://dbz-images.dubizzle.com/images/2026/09/24/photo-${index + 1}.jpg?impolicy=dpv`
);
const main = {
  className: "listing page",
  closest: () => null,
  getAttribute: () => null,
  matches: () => false,
  parentElement: null,
  querySelector: () => null,
  querySelectorAll: (selector) => (selector === "img" ? [] : []),
  textContent: ""
};
const document = {
  body: main,
  title: "Range Rover Sport",
  querySelector: (selector) => (selector === "main,[role='main']" ? main : null),
  querySelectorAll: (selector) => {
    if (selector.includes("application/json")) {
      return [
        {
          textContent: JSON.stringify({
            props: { pageProps: { listing: { photos: photoUrls } } }
          })
        }
      ];
    }
    return [];
  }
};

(async () => {
  const capture = await vm.runInNewContext(source, {
    URL,
    document,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    location: {
      hostname: "dubai.dubizzle.com",
      href: `${origin}/motors/used-cars/example`,
      origin,
      pathname: "/motors/used-cars/example",
      search: ""
    },
    setTimeout
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(capture.images.map((image) => image.url))),
    photoUrls,
    "Dubizzle's embedded listing gallery must be collected in full before a visitor opens it."
  );
  console.log("Dubizzle embedded gallery collection tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
