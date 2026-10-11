const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const lunaRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(lunaRoot, "sidepanel.html"), "utf8");
const polish = fs.readFileSync(path.join(lunaRoot, "styles/luna-polish.css"), "utf8");

const stylesheetNames = [
  ...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)
].map((match) => match[1]);
assert.equal(stylesheetNames.at(-1), "styles/luna-neumorphism.css");

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "Every side-panel ID must be unique.");

const buttons = [...html.matchAll(/<button\b([^>]*)>/g)].map((match) => match[1]);
assert.ok(buttons.length > 0);
for (const attributes of buttons) {
  assert.match(attributes, /\stype="button"|\stype="submit"/);
}

assert.match(polish, /:focus-visible/);
assert.match(polish, /cursor:\s*default\s*!important/);
assert.match(polish, /prefers-reduced-motion:\s*reduce/);
assert.match(polish, /overflow-wrap:\s*anywhere/);

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

console.log("Luna design-system regression checks passed.");
