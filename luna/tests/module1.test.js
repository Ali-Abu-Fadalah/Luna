const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extensionRoot = path.resolve(__dirname, "..");

const readExtensionFile = (fileName) => fs.readFileSync(path.join(extensionRoot, fileName), "utf8");

const manifest = JSON.parse(readExtensionFile("manifest.json"));
const sidePanelHtml = readExtensionFile("sidepanel.html");
const sidePanelCss = readExtensionFile("styles/sidepanel.css");
const allCss = [
  "styles/sidepanel.css",
  "src/features/inventory/inventory-checker.css",
  "src/features/listings/listings-scraper.css",
  "src/features/images/image-scraper.css",
  "src/features/manual-ad/manual-ad-assistant.css",
  "src/features/jenkins/jenkins-assistant.css",
  "styles/luna-polish.css"
]
  .map(readExtensionFile)
  .join("\n");

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, "Luna");
assert.equal(manifest.side_panel.default_path, "sidepanel.html");
assert.equal(manifest.background.service_worker, "src/background/background.js");
assert.deepEqual(
  manifest.permissions.sort(),
  ["activeTab", "scripting", "sidePanel", "storage"].sort()
);
assert.ok(manifest.host_permissions.every((origin) => !origin.includes("example.invalid")));
assert.ok(manifest.host_permissions.every((origin) => !origin.includes("example.invalid")));
assert.ok(manifest.host_permissions.every((origin) => !origin.includes("example.invalid")));
assert.deepEqual(manifest.content_scripts, []);
assert.equal((sidePanelHtml.match(/class="nav-item/g) || []).length, 9);
const moduleButtons = [...sidePanelHtml.matchAll(/<button\b([^>]*\bclass="nav-item\b[^>]*)>/g)];
assert.deepEqual(
  moduleButtons.map(([, attributes]) => /data-section="([^"]+)"/.exec(attributes)?.[1]).sort(),
  [
    "home",
    "sheet-statistics",
    "work-queue",
    "inventory-checker",
    "scraper-images",
    "manual-ad-assistant",
    "auctions",
    "jenkins-assistant",
    "settings"
  ].sort(),
  "Every module must retain a direct navigation button."
);
assert.match(sidePanelHtml, /\bclass="[^"]*\bluna-emblem\b/);
assert.doesNotMatch(sidePanelHtml, /<span class="nav-icon"[^>]*>[⌂▥☷⌕◇◫⌘⚙]/);
assert.match(sidePanelCss, /select\s*\{[\s\S]*appearance:\s*none/);
assert.match(sidePanelCss, /select option/);
assert.doesNotMatch(sidePanelHtml, /Not built yet|class="empty-state"/);
assert.match(sidePanelHtml, /id="section-title"/);
assert.equal(
  (sidePanelHtml.match(/<article\b[^>]*class="[^"]*\bmini-status\b[^>]*>/g) || []).length,
  4
);
assert.match(sidePanelHtml, /id="vendor-counter-form"/);
assert.match(sidePanelHtml, /vendor-counter-core\.js/);
assert.match(sidePanelHtml, /id="tracker-agent"/);
assert.match(sidePanelHtml, /agent-tracker-core\.js/);
assert.match(sidePanelHtml, /work-queue-core\.js/);
assert.match(sidePanelHtml, /id="queue-start"/);
assert.doesNotMatch(sidePanelHtml, /data-section="ayshei-lookup"/);
assert.doesNotMatch(sidePanelHtml, /class="ayshei-lookup-view"/);
assert.match(sidePanelHtml, /ayshei-core\.js/);
assert.match(sidePanelHtml, /ayshei-client\.js/);
assert.match(sidePanelHtml, /foundation\.js/);
assert.match(sidePanelHtml, /diagnostics\.js/);
assert.match(sidePanelHtml, /home-status\.js/);
assert.match(sidePanelHtml, /ayshei-status\.js/);
assert.match(sidePanelHtml, /permission-settings\.js/);
assert.match(sidePanelHtml, /settings-overview\.js/);
assert.match(sidePanelHtml, /id="home-resume-work-queue"[^>]+hidden/);
assert.match(sidePanelHtml, /id="settings-test-ayshei-endpoint"/);
assert.match(sidePanelHtml, /id="settings-revoke-websites"/);
assert.match(sidePanelHtml, /id="settings-copy-diagnostics"/);
assert.doesNotMatch(sidePanelHtml, /Your complete workspace is ready/);
assert.doesNotMatch(sidePanelHtml, /ayshei-lookup\.js/);
assert.doesNotMatch(sidePanelCss, /\.ayshei-(?:lookup|card|result|copy|recent)/);
assert.match(sidePanelHtml, /Inventory Checker/);
assert.match(sidePanelHtml, /inventory-core\.js/);
assert.match(sidePanelHtml, /id="scraper-start"/);
assert.match(sidePanelHtml, /id="image-scraper-collect"/);
assert.match(sidePanelHtml, /image-scraper-core\.js/);
assert.match(sidePanelHtml, /scraper-core\.js/);
assert.match(sidePanelHtml, /data-section="manual-ad-assistant"/);
assert.match(sidePanelHtml, /class="[^"]*\bmanual-ad-view\b/);
assert.match(sidePanelHtml, /class="[^"]*\bjenkins-assistant-view\b/);
assert.match(sidePanelHtml, /jenkins-core\.js/);
assert.match(sidePanelHtml, /jenkins-page\.js/);
assert.match(sidePanelHtml, /jenkins-assistant\.js/);
assert.doesNotMatch(allCss, /cursor:\s*(?:wait|not-allowed)/);
assert.match(
  sidePanelCss,
  /:disabled,[\s\S]*\[aria-disabled="true"\][\s\S]*cursor:\s*default !important/
);

[...sidePanelHtml.matchAll(/<select[^>]*>([\s\S]*?)<\/select>/g)].forEach(([, optionsHtml]) => {
  const labels = [...optionsHtml.matchAll(/<option(?:\s[^>]*)?>([^<]*)<\/option>/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  const otherIndex = labels.findIndex((label) => label.toLocaleLowerCase("en") === "other");
  if (otherIndex >= 0) {
    assert.equal(otherIndex, labels.length - 1, `Other must be last in ${labels.join(", ")}`);
  }
});

const registeredListeners = {};
const panelBehaviorCalls = [];
const backgroundContext = {
  LunaFoundation: {
    messageTypes: {
      aysheiLookup: "luna.ayshei.lookup",
      imageFetch: "luna.manualAd.fetchImage"
    },
    storageKeys: { aysheiEndpoint: "luna.aysheiEndpoint.v1" }
  },
  chrome: {
    runtime: {
      onInstalled: {
        addListener(listener) {
          registeredListeners.installed = listener;
        }
      },
      id: "luna-test",
      onMessage: {
        addListener(listener) {
          registeredListeners.message = listener;
        }
      },
      onStartup: {
        addListener(listener) {
          registeredListeners.startup = listener;
        }
      }
    },
    sidePanel: {
      setPanelBehavior(options) {
        panelBehaviorCalls.push(options);
        return Promise.resolve();
      }
    }
  },
  console,
  importScripts() {}
};

vm.runInNewContext(readExtensionFile("src/services/ai/groq-core.js"), backgroundContext);
vm.runInNewContext(readExtensionFile("src/background/background.js"), backgroundContext);
assert.equal(panelBehaviorCalls.length, 1);
assert.equal(panelBehaviorCalls[0].openPanelOnActionClick, true);
assert.equal(typeof registeredListeners.installed, "function");
assert.equal(typeof registeredListeners.startup, "function");

class FakeClassList {
  constructor(initialClasses = []) {
    this.classes = new Set(initialClasses);
  }

  toggle(className, force) {
    if (force) {
      this.classes.add(className);
    } else {
      this.classes.delete(className);
    }
  }

  contains(className) {
    return this.classes.has(className);
  }
}

class FakeNavigationItem {
  constructor(sectionId, isActive = false) {
    this.dataset = { section: sectionId };
    this.classList = new FakeClassList(isActive ? ["is-active"] : []);
    this.attributes = new Map();
    this.listeners = new Map();
  }

  addEventListener(eventName, listener) {
    this.listeners.set(eventName, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }
}

const sectionIds = [
  "home",
  "sheet-statistics",
  "work-queue",
  "inventory-checker",
  "scraper-images",
  "manual-ad-assistant",
  "auctions",
  "jenkins-assistant",
  "settings"
];
const navigationItems = sectionIds.map(
  (sectionId) => new FakeNavigationItem(sectionId, sectionId === "home")
);
const sectionTitle = { textContent: "Home" };
const content = { classList: new FakeClassList(), offsetWidth: 300 };
const homeDashboard = { hidden: false };
const sheetConnectionView = { hidden: true };
const workQueueView = { hidden: true };
const inventoryCheckerView = { hidden: true };
const listingsScraperView = { hidden: true };
const manualAdView = { hidden: true };
const jenkinsAssistantView = { hidden: true };
const settingsView = { hidden: true };
const savedStorageValues = [];
const sectionNotifications = [];
const sidePanelContext = {
  LunaConnection: {
    onSectionShown(sectionId) {
      sectionNotifications.push(sectionId);
    }
  },
  chrome: {
    storage: {
      local: {
        async get(defaults) {
          return { ...defaults, "luna.activeSection": "work-queue" };
        },
        async set(value) {
          savedStorageValues.push(value);
        }
      }
    }
  },
  console,
  document: {
    title: "Luna",
    querySelectorAll(selector) {
      assert.equal(selector, ".nav-item");
      return navigationItems;
    },
    querySelector(selector) {
      const elements = {
        "#section-title": sectionTitle,
        ".content": content,
        ".home-dashboard": homeDashboard,
        ".sheet-connection-view": sheetConnectionView,
        ".work-queue-view": workQueueView,
        ".inventory-checker-view": inventoryCheckerView,
        ".listings-scraper-view": listingsScraperView,
        ".manual-ad-view": manualAdView,
        ".auctions-view": { hidden: true },
        ".jenkins-assistant-view": jenkinsAssistantView,
        ".settings-view": settingsView
      };
      assert.ok(Object.hasOwn(elements, selector));
      return elements[selector];
    }
  },
  Object,
  Promise
};

vm.runInNewContext(readExtensionFile("src/panel/sidepanel.js"), sidePanelContext);

const waitForAsyncWork = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

(async () => {
  await waitForAsyncWork();

  assert.equal(sectionTitle.textContent, "Work Queue");
  assert.equal(sidePanelContext.document.title, "Work Queue · Luna");
  assert.equal(
    navigationItems
      .find((item) => item.dataset.section === "work-queue")
      .classList.contains("is-active"),
    true
  );
  assert.equal(homeDashboard.hidden, true);
  assert.equal(workQueueView.hidden, false);
  assert.equal(content.classList.contains("is-entering"), true);

  assert.equal(sheetConnectionView.hidden, true);
  assert.equal(settingsView.hidden, true);
  const inventoryItem = navigationItems.find(
    (item) => item.dataset.section === "inventory-checker"
  );
  await inventoryItem.listeners.get("click")();

  assert.equal(sectionTitle.textContent, "Inventory Checker");
  assert.equal(inventoryCheckerView.hidden, false);
  assert.equal(workQueueView.hidden, true);

  const listingsScraperItem = navigationItems.find(
    (item) => item.dataset.section === "scraper-images"
  );
  await listingsScraperItem.listeners.get("click")();

  assert.equal(sectionTitle.textContent, "Listings Scraper");
  assert.equal(listingsScraperView.hidden, false);
  assert.equal(inventoryCheckerView.hidden, true);

  const manualAdItem = navigationItems.find(
    (item) => item.dataset.section === "manual-ad-assistant"
  );
  await manualAdItem.listeners.get("click")();

  assert.equal(sectionTitle.textContent, "Manual Ad Assistant");
  assert.equal(manualAdView.hidden, false);
  assert.equal(listingsScraperView.hidden, true);

  const jenkinsItem = navigationItems.find((item) => item.dataset.section === "jenkins-assistant");
  await jenkinsItem.listeners.get("click")();

  assert.equal(sectionTitle.textContent, "Jenkins Assistant");
  assert.equal(jenkinsAssistantView.hidden, false);
  assert.equal(manualAdView.hidden, true);

  const settingsItem = navigationItems.find((item) => item.dataset.section === "settings");
  await settingsItem.listeners.get("click")();

  assert.equal(sectionTitle.textContent, "Settings");
  assert.equal(sidePanelContext.document.title, "Settings · Luna");
  assert.equal(savedStorageValues.length, 5);
  assert.equal(savedStorageValues[0]["luna.activeSection"], "inventory-checker");
  assert.equal(savedStorageValues[1]["luna.activeSection"], "scraper-images");
  assert.equal(savedStorageValues[2]["luna.activeSection"], "manual-ad-assistant");
  assert.equal(savedStorageValues[3]["luna.activeSection"], "jenkins-assistant");
  assert.equal(savedStorageValues[4]["luna.activeSection"], "settings");
  assert.deepEqual(
    sectionNotifications,
    [
      "work-queue",
      "inventory-checker",
      "scraper-images",
      "manual-ad-assistant",
      "jenkins-assistant",
      "settings"
    ],
    "Navigation must retain controller visibility notifications."
  );

  assert.equal(settingsView.hidden, false);
  assert.equal(sheetConnectionView.hidden, true);
  assert.equal(workQueueView.hidden, true);
  assert.equal(inventoryCheckerView.hidden, true);
  assert.equal(listingsScraperView.hidden, true);
  assert.equal(jenkinsAssistantView.hidden, true);

  await navigationItems
    .find((item) => item.dataset.section === "sheet-statistics")
    .listeners.get("click")();
  assert.equal(sheetConnectionView.hidden, false);
  assert.equal(settingsView.hidden, true);
  assert.equal(sectionTitle.textContent, "Sheet Statistics");
  await navigationItems.find((item) => item.dataset.section === "home").listeners.get("click")();
  assert.equal(homeDashboard.hidden, false);
  assert.equal(sheetConnectionView.hidden, true);
  assert.equal(await sidePanelContext.LunaNavigation.show("unknown-section"), "home");
  assert.equal(sidePanelContext.document.title, "Home · Luna");
  assert.equal(savedStorageValues.at(-1)["luna.activeSection"], "home");
  assert.equal(
    navigationItems.filter((item) => item.attributes.get("aria-current") === "page").length,
    1
  );
  assert.equal(sectionNotifications.at(-1), "home");
  console.log("Module 1 tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
