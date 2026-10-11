const sections = {
  home: "Home",
  "sheet-statistics": "Sheet Statistics",
  "work-queue": "Work Queue",
  "inventory-checker": "Inventory Checker",
  "scraper-images": "Listings Scraper",
  "manual-ad-assistant": "Manual Ad Assistant",
  "jenkins-assistant": "Jenkins Assistant",
  settings: "Settings"
};

const storageKey = globalThis.LunaFoundation?.storageKeys.activeSection || "luna.activeSection";
const navigationItems = [...document.querySelectorAll(".nav-item")];
const sectionTitle = document.querySelector("#section-title");
const content = document.querySelector(".content");
const homeDashboard = document.querySelector(".home-dashboard");
const sheetConnectionView = document.querySelector(".sheet-connection-view");
const workQueueView = document.querySelector(".work-queue-view");
const inventoryCheckerView = document.querySelector(".inventory-checker-view");
const listingsScraperView = document.querySelector(".listings-scraper-view");
const manualAdView = document.querySelector(".manual-ad-view");
const jenkinsAssistantView = document.querySelector(".jenkins-assistant-view");
const settingsView = document.querySelector(".settings-view");
const localStorageArea = globalThis.chrome?.storage?.local;

const showSection = (sectionId) => {
  const safeSectionId = Object.hasOwn(sections, sectionId) ? sectionId : "home";

  navigationItems.forEach((item) => {
    const isActive = item.dataset.section === safeSectionId;
    item.classList.toggle("is-active", isActive);

    if (isActive) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });

  sectionTitle.textContent = sections[safeSectionId];
  const isHome = safeSectionId === "home";
  const isSheetStatistics = safeSectionId === "sheet-statistics";
  const isWorkQueue = safeSectionId === "work-queue";
  const isInventoryChecker = safeSectionId === "inventory-checker";
  const isListingsScraper = safeSectionId === "scraper-images";
  const isManualAdAssistant = safeSectionId === "manual-ad-assistant";
  const isJenkinsAssistant = safeSectionId === "jenkins-assistant";
  const isSettings = safeSectionId === "settings";
  homeDashboard.hidden = !isHome;
  sheetConnectionView.hidden = !isSheetStatistics;
  workQueueView.hidden = !isWorkQueue;
  inventoryCheckerView.hidden = !isInventoryChecker;
  listingsScraperView.hidden = !isListingsScraper;
  manualAdView.hidden = !isManualAdAssistant;
  jenkinsAssistantView.hidden = !isJenkinsAssistant;
  settingsView.hidden = !isSettings;
  globalThis.LunaConnection?.onSectionShown(safeSectionId);
  globalThis.LunaInventoryChecker?.onSectionShown(safeSectionId);
  globalThis.LunaImageScraper?.onSectionShown(safeSectionId);
  globalThis.LunaListingsScraper?.onSectionShown(safeSectionId);
  globalThis.LunaManualAdAssistant?.onSectionShown(safeSectionId);
  globalThis.LunaJenkinsAssistant?.onSectionShown(safeSectionId);
  globalThis.LunaWorkQueueNotes?.onSectionShown(safeSectionId);
  globalThis.LunaUI?.sectionChanged(safeSectionId);

  content.classList.toggle("is-entering", false);
  void content.offsetWidth;
  content.classList.toggle("is-entering", true);

  document.title = `${sections[safeSectionId]} · Luna`;

  return safeSectionId;
};

const saveSection = async (sectionId) => {
  if (localStorageArea) {
    await localStorageArea.set({ [storageKey]: sectionId });
  }
};

const navigate = async (sectionId) => {
  const safeSectionId = showSection(sectionId);
  await saveSection(safeSectionId);
  return safeSectionId;
};

globalThis.LunaNavigation = Object.freeze({ show: navigate });

navigationItems.forEach((item) => {
  item.addEventListener("click", async () => {
    try {
      await navigate(item.dataset.section);
    } catch (error) {
      console.error("Unable to save the active Luna section:", error);
    }
  });
});

const restoreSection = async () => {
  if (!localStorageArea) {
    showSection("home");
    return;
  }

  try {
    const saved = await localStorageArea.get({ [storageKey]: "home" });
    showSection(saved[storageKey]);
  } catch (error) {
    console.error("Unable to restore the active Luna section:", error);
    showSection("home");
  }
};

restoreSection();
