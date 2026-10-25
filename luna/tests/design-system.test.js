const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const lunaRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(lunaRoot, "sidepanel.html"), "utf8");

const stylesheetNames = [
  ...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)
].map((match) => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map((match) => match[1]);

// Presentation remains locally packaged and loads after the existing features.
assert.equal(stylesheetNames.at(-2), "styles/luna-friendly.css");
assert.equal(stylesheetNames.at(-1), "styles/public-edition.css");
assert.equal(scripts.at(-1), "src/panel/luna-friendly.js");
for (const resource of [...stylesheetNames, ...scripts]) {
  assert.ok(!/^(?:https?:)?\/\//i.test(resource), `Remote UI dependency: ${resource}`);
  assert.ok(fs.existsSync(path.join(lunaRoot, resource)), `Missing UI dependency: ${resource}`);
}
assert.ok(
  scripts.indexOf("src/panel/sidepanel.js") < scripts.indexOf("src/panel/luna-friendly.js")
);
assert.ok(!stylesheetNames.includes("styles/luna-neumorphism.css"));
assert.ok(!stylesheetNames.includes("styles/luna-polish.css"));

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const idSet = new Set(ids);
assert.equal(idSet.size, ids.length, "Every side-panel ID must be unique.");

const buttons = [...html.matchAll(/<button\b([^>]*)>/g)].map((match) => match[1]);
assert.ok(buttons.length > 0);
for (const attributes of buttons) {
  assert.match(attributes, /\stype="button"|\stype="submit"/);
}

// These native controls bind real workflows. Appearance work must not replace
// their elements, remove their IDs, or bypass their original controllers.
const preservedControls = {
  "sheet-date-window": "input",
  "sheet-connection-refresh": "button",
  "queue-unlisted-reason": "input",
  "queue-mark-unlisted": "button",
  "manual-ad-prepare": "button",
  "manual-ad-fill-ayshei": "button",
  "inventory-paste-text": "textarea",
  "inventory-add-paste": "button",
  "jenkins-paste": "textarea",
  "auction-paste": "textarea",
  "auction-title": "input",
  "auction-republish-primary": "button",
  "auction-republish-copy": "button",
  "luna-ai-provider": "select"
};
for (const [id, tag] of Object.entries(preservedControls)) {
  assert.match(html, new RegExp(`<${tag}\\b[^>]*\\bid="${id}"`), `${id} remains a native ${tag}`);
}
for (const destination of [
  "home",
  "sheet-statistics",
  "work-queue",
  "manual-ad-assistant",
  "auctions",
  "scraper-images",
  "inventory-checker",
  "jenkins-assistant",
  "settings"
]) {
  assert.match(html, new RegExp(`data-(?:luna-)?section="${destination}"`));
}

const primaryGroups = [
  ...html.matchAll(/<button\b([^>]*\bclass="[^"]*\bluna-group-button\b[^>]*)>/g)
];
assert.deepEqual(
  primaryGroups.map(([, attributes]) => /data-group="([^"]+)"/.exec(attributes)?.[1]).sort(),
  ["home", "work", "tools", "insights"].sort()
);
assert.equal((html.match(/\bdata-sheet-subview-button=/g) || []).length, 5);
assert.match(html, /src="src\/panel\/luna-controls\.js"/);
assert.match(html, /src="src\/panel\/luna-motion\.js"/);
assert.match(html, /src="src\/panel\/luna-ui\.js"/);
assert.match(html, /src="vendor\/gsap\.min\.js"/);
for (const [, targets] of html.matchAll(/\saria-controls="([^"]+)"/g)) {
  for (const target of targets.split(/\s+/)) {
    assert.ok(idSet.has(target), `aria-controls target does not exist: ${target}`);
  }
}
assert.match(html, /<dialog\b[^>]*\bid="luna-command-dialog"/);
for (const id of [
  "luna-jump-open",
  "luna-command-input",
  "luna-command-results",
  "luna-command-close",
  "luna-appearance-toggle",
  "luna-quick-open",
  "luna-quick-menu"
]) {
  assert.ok(idSet.has(id), `Friendly Workspace interaction is missing: ${id}`);
}

assert.match(html, /<body[^>]*class="public-edition friendly-workspace"/);
const publicStyle = fs.readFileSync(path.join(lunaRoot, "styles/public-edition.css"), "utf8");
for (const id of [
  "manual-ad-fill-ayshei",
  "image-scraper-import",
  "jenkins-fill",
  "inventory-capture-page",
  "queue-ai-result"
])
  assert.ok(publicStyle.includes("#" + id), "Public service guard missing: " + id);
assert.ok(
  publicStyle.includes("#queue-vehicle-ai-tools"),
  "Private AI actions remain unavailable."
);
assert.ok(
  !/#queue-note|\.queue-ai-strip\s*\{/.test(publicStyle),
  "Local notes remain available in the public edition."
);
console.log("Public Friendly Workspace integration and control-preservation checks passed.");
