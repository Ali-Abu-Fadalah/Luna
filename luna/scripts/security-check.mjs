import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const excluded = new Set([".git", "node_modules", "dist"]);
const failures = [];
let checked = 0;
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub credential", /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  [
    "provider credential",
    /(?:gsk_[A-Za-z0-9]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{40,}|AIza[A-Za-z0-9_-]{35})/
  ],
  ["live Apps Script deployment", /\bAKfy[a-zA-Z0-9_-]{35,}\b/],
  [
    "spreadsheet link",
    /docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/(?:e\/)?[A-Za-z0-9_-]{20,}/i
  ],
  [
    "online sheet/file link",
    /(?:docs\.google\.com\/open\?id=|drive\.google\.com\/(?:file\/d\/|drive\/folders\/))[A-Za-z0-9_-]{20,}/i
  ],
  ["account ID", /"(?:account_id|spreadsheetId)"\s*:\s*"[a-zA-Z0-9_-]{20,}"/],
  ["non-example SharePoint tenant", /https:\/\/(?!example(?:[-.]|\/))[a-z0-9-]+\.sharepoint\.com/i],
  ["local user path", /[A-Z]:[\\/]+Users[\\/]+(?!Public(?:[\\/]|$))/i]
];
function walk(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const file = path.join(folder, entry.name),
      relative = path.relative(root, file).replaceAll("\\", "/");
    if (entry.isSymbolicLink()) {
      failures.push(`${relative}: symlink is not allowed in publication`);
      continue;
    }
    if (entry.isDirectory()) {
      if (
        [
          "private",
          "apps-script",
          "raw-data-apps-script",
          "cloudflare-groq-worker",
          "design-preview"
        ].includes(entry.name)
      )
        failures.push(`${relative}: excluded private/deployment folder`);
      walk(file);
      continue;
    }
    if (
      /^(?:\.env(?:\.|$)|\.dev\.vars|config\.(?:local|private)\.|credentials|cookies)|\.(?:pem|key|sqlite|db|har|zip|7z|rar|tar|gz)$/i.test(
        entry.name
      )
    )
      failures.push(`${relative}: private file name`);
    if (
      /\.(?:xlsx?|xlsm|xlsb|xltx?|xltm|xlam?|csv|tsv|ods|ots|fods|numbers|gsheet|iqy|odc|dbf)(?:$|\.)/i.test(
        entry.name
      )
    )
      failures.push(`${relative}: worksheet or spreadsheet export must not be published`);
    checked++;
    if (!/\.(?:js|mjs|json|html|css|svg|md|txt|yml|yaml)$/.test(entry.name)) continue;
    const text = readFileSync(file, "utf8");
    for (const [rule, pattern] of patterns)
      if (pattern.test(text)) failures.push(`${relative}: ${rule}`);
  }
}
walk(root);
const extension = path.join(root, "luna");
const configContext = {};
configContext.globalThis = configContext;
vm.runInNewContext(
  readFileSync(path.join(extension, "src/shared/config.js"), "utf8"),
  configContext
);
if (
  configContext.LunaConfig?.publicBuild !== true ||
  configContext.LunaConfig.sheetEndpoint ||
  configContext.LunaConfig.rawDataWriterEndpoint
)
  failures.push("Public configuration must contain no live endpoint.");
const manifest = JSON.parse(readFileSync(path.join(extension, "manifest.json"), "utf8"));
const approved = [
  "https://*.dubicars.com/*",
  "https://*.dubizzle.com/*",
  "https://*.noon.com/*",
  "https://*.bayut.com/*"
];
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(approved))
  failures.push("Unexpected required host access.");
if (manifest.content_scripts?.length)
  failures.push("Automatic page capture must not be enabled in the public edition.");
if (JSON.stringify(manifest.optional_host_permissions) !== JSON.stringify(["https://*/*"]))
  failures.push("Unexpected optional host access.");
const background = readFileSync(path.join(extension, "src/background/background.js"), "utf8");
const auctionFolder = path.join(extension, "src/features/auctions");
for (const name of [
  "auction-republish-page.js",
  "auction-republish-runner.js",
  "auction-republish-link.js",
  "auction-republish-archive.js"
])
  if (readdirSync(auctionFolder).includes(name))
    failures.push(`${name}: private account/background implementation is excluded.`);
const republishTransport = readFileSync(
  path.join(auctionFolder, "auction-republish-api.js"),
  "utf8"
);
if (
  /\bfetch\s*\(|executeScript|credentials\s*:|Authorization|operation-v\d+\./i.test(
    republishTransport
  )
)
  failures.push("An authenticated admin transport was added to the public edition.");
const previewContext = {};
vm.runInNewContext(
  readFileSync(path.join(auctionFolder, "auction-republish-core.js"), "utf8"),
  previewContext
);
if (["payload", "audit", "choose"].some((name) => previewContext.LunaAuctionRepublishCore?.[name]))
  failures.push("Private account payload/audit helpers must not enter the public preview.");
if (
  /resumeAuction|luna\.auctionPhotos\.v1/.test(
    readFileSync(path.join(extension, "src/features/images/image-scraper-fill.js"), "utf8")
  )
)
  failures.push("Account-bound auction photo recovery is excluded from the public edition.");
if (
  /api\.groq\.com|generativelanguage\.googleapis\.com|openrouter\.ai\/api|\/api\/v\d+\/search/.test(
    background
  )
)
  failures.push("A private/API transport was added to the public background.");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Publication check passed: ${checked} files; private configuration and deployed-service identifiers are absent.`
);
