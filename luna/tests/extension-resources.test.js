const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

function resource(url, base = root) {
  assert.ok(!/^(?:[a-z]+:|\/)/i.test(url), `Resource must be local: ${url}`);
  const resolved = path.resolve(base, url);
  const relative = path.relative(root, resolved);
  assert.ok(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    `Resource must stay inside Luna: ${url}`
  );
  assert.ok(fs.statSync(resolved).isFile(), `Missing resource: ${url}`);
  return resolved;
}

function strings(source) {
  const result = [...source.matchAll(/(["'])([^"']+)\1/g)].map((match) => match[2]);
  assert.ok(result.length > 0, "A resource list must not be empty.");
  assert.equal(
    source.replace(/(["'])([^"']+)\1/g, "").replace(/[,\s]/g, ""),
    "",
    "Resource lists must contain literal paths."
  );
  return result;
}

function scriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? scriptFiles(file) : entry.name.endsWith(".js") ? [file] : [];
  });
}

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.minimum_chrome_version, "116");
for (const size of [16, 32, 48, 128]) {
  const iconPath = resource(manifest.icons[String(size)]);
  const bytes = fs.readFileSync(iconPath);
  assert.equal(bytes.subarray(1, 4).toString(), "PNG", "Chrome icons must be PNG files.");
  assert.equal(bytes.readUInt32BE(16), size, "Icon width must match its manifest size.");
  assert.equal(bytes.readUInt32BE(20), size, "Icon height must match its manifest size.");
}
for (const [size, url] of Object.entries(manifest.action.default_icon)) {
  assert.equal(url, manifest.icons[size], "Toolbar and extension-manager branding must match.");
}
assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "sidePanel", "storage"]);
assert.deepEqual(manifest.host_permissions, [
  "https://*.dubicars.com/*",
  "https://*.dubizzle.com/*",
  "https://*.noon.com/*",
  "https://*.bayut.com/*"
]);
assert.deepEqual(manifest.optional_host_permissions, ["https://*/*"]);
assert.equal(manifest.side_panel.default_path, "sidepanel.html");
assert.equal(manifest.background.service_worker, "src/background/background.js");
assert.deepEqual(manifest.content_scripts, []);

const panelPath = resource(manifest.side_panel.default_path);
const html = fs.readFileSync(panelPath, "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)].map(
  (match) => match[2]
);
const links = [...html.matchAll(/<link\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)].map(
  (match) => match[2]
);
const styles = [
  ...html.matchAll(/<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)
].map((match) => match[2]);
assert.equal(
  new Set([...scripts, ...links]).size,
  scripts.length + links.length,
  "Panel resource URLs must be unique."
);
assert.deepEqual(
  scripts.map((url) => path.basename(url)),
  [
    "foundation.js",
    "diagnostics.js",
    "home-status.js",
    "config.js",
    "sheet-client.js",
    "sheet-connection.js",
    "vendor-counter-core.js",
    "vendor-counter.js",
    "agent-tracker-core.js",
    "agent-tracker.js",
    "monthly-performance-core.js",
    "sheet-report-core.js",
    "xlsx-export-core.js",
    "monthly-performance.js",
    "daily-interactions-core.js",
    "daily-interactions.js",
    "sheet-report.js",
    "ayshei-core.js",
    "ayshei-client.js",
    "groq-core.js",
    "groq-client.js",
    "groq-settings.js",
    "ayshei-endpoint-settings.js",
    "ayshei-status.js",
    "permission-settings.js",
    "settings-overview.js",
    "work-queue-core.js",
    "vehicle-detail-core.js",
    "work-queue-notes-core.js",
    "work-queue-notes.js",
    "work-queue.js",
    "inventory-core.js",
    "inventory-checker.js",
    "image-scraper-core.js",
    "image-scraper.js",
    "scraper-core.js",
    "listings-scraper.js",
    "manual-ad-core.js",
    "manual-ad-assistant.js",
    "auction-core.js",
    "auction-draft-core.js",
    "auction-api.js",
    "auction-workbook.js",
    "auction-republish-core.js",
    "auction-republish-api.js",
    "auctions.js",
    "auction-republish.js",
    "jenkins-core.js",
    "jenkins-page.js",
    "jenkins-assistant.js",
    "gsap.min.js",
    "luna-controls.js",
    "luna-motion.js",
    "luna-ui.js",
    "sidepanel.js",
    "luna-friendly.js"
  ],
  "Panel script order must preserve dependencies."
);
assert.deepEqual(
  styles.map((url) => path.basename(url)),
  [
    "sidepanel.css",
    "inventory-checker.css",
    "listings-scraper.css",
    "image-scraper.css",
    "manual-ad-assistant.css",
    "jenkins-assistant.css",
    "auctions.css",
    "luna-friendly.css",
    "public-edition.css"
  ],
  "Stylesheet order must preserve the design's cascade."
);
links.forEach((url) => resource(url, path.dirname(panelPath)));

const workerPath = resource(manifest.background.service_worker);
const entrypoints = [
  workerPath,
  ...scripts.map((url) => resource(url, path.dirname(panelPath))),
  ...manifest.content_scripts.flatMap((entry) => entry.js.map((url) => resource(url)))
];
const expectedInjections = {
  "auctions.js": [["auction-page.js"], ["image-scraper-source.js"]],
  "image-scraper.js": [
    ["image-scraper-source.js"],
    ["image-upload-core.js", "image-scraper-fill.js"],
    ["image-upload-core.js", "image-scraper-fill.js"]
  ],
  "inventory-checker.js": [["inventory-capture.js"]],
  "listings-scraper.js": [["scraper-page.js"]],
  "manual-ad-assistant.js": [
    ["manual-ad-price-core.js", "manual-ad-description-core.js", "manual-ad-source.js"],
    ["manual-ad-fill.js"],
    ["manual-ad-fill.js"]
  ],
  "work-queue.js": [["vehicle-detail-page.js"]]
};

const reached = new Set();
const queue = [...entrypoints];
const injectionsByController = {};
while (queue.length) {
  const file = queue.shift();
  if (reached.has(file)) continue;
  reached.add(file);
  const source = fs.readFileSync(file, "utf8");
  const imports = [...source.matchAll(/\bimportScripts\s*\(([\s\S]*?)\)/g)];
  for (const match of imports) {
    if (path.basename(file) === "auction-workbook.js") {
      assert.equal(match[1].replace(/\s/g, ""), "localZipLibrary,localLibrary");
      for (const name of ["vendor/xlsx-0.20.3.full.min.js", "vendor/fflate-0.8.3.min.js"])
        resource(name);
      assert.match(
        source,
        /data\.libraryUrl !== localLibrary \|\| data\.zipUrl !== localZipLibrary/
      );
      continue;
    }
    const urls = strings(match[1]);
    if (file === workerPath)
      assert.deepEqual(
        urls.map((url) => path.basename(url)),
        ["foundation.js", "ayshei-core.js", "groq-core.js"]
      );
    queue.push(...urls.map((url) => resource(url, path.dirname(file))));
  }
  if (file === workerPath) assert.equal(imports.length, 1);
  const arrays = [...source.matchAll(/\bfiles\s*:\s*\[([\s\S]*?)\]/g)];
  assert.equal(
    arrays.length,
    (source.match(/\bfiles\s*:/g) || []).length,
    `Every injected file list must be checked: ${path.relative(root, file)}`
  );
  if (arrays.length) {
    const lists = arrays.map((match) => strings(match[1]));
    injectionsByController[path.basename(file)] = lists.map((urls) =>
      urls.map((url) => path.basename(url))
    );
    for (const urls of lists) {
      assert.equal(new Set(urls).size, urls.length, "Injected scripts must not repeat.");
      // Chrome scripting paths resolve from the extension root, not the controller folder.
      queue.push(...urls.map((url) => resource(url)));
    }
  }
}

assert.deepEqual(
  injectionsByController,
  expectedInjections,
  "Injection dependencies and their order must stay unchanged."
);
const runtimeFiles = scriptFiles(path.join(root, "src"));
assert.deepEqual(
  [...reached].sort(),
  [...runtimeFiles, path.join(root, "vendor/gsap.min.js")].sort(),
  "Every runtime script must be reachable from an entrypoint or an injected script list."
);
assert.equal(
  fs.readdirSync(root).filter((name) => name.endsWith(".js")).length,
  0,
  "Runtime JavaScript belongs inside src."
);
console.log(
  `Extension resource checks passed: ${runtimeFiles.length} scripts, ${styles.length} stylesheets.`
);
