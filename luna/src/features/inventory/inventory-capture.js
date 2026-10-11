(() => {
  if (globalThis.__lunaInventoryCaptureInstalled) {
    return;
  }
  globalThis.__lunaInventoryCaptureInstalled = true;

  const MESSAGE_TYPE = "luna.inventory.capture";

  const cleanText = (value) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");

  const isUsableElement = (element) => {
    if (!element || element.hidden || element.getAttribute("aria-hidden") === "true") {
      return false;
    }

    const style = globalThis.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  };

  const readTableNames = () => {
    for (const table of document.querySelectorAll("table")) {
      const headers = [...table.querySelectorAll("thead th")];
      const productIndex = headers.findIndex(
        (header) => cleanText(header.textContent).toLowerCase() === "product name"
      );

      if (productIndex < 0) {
        continue;
      }

      return [...table.querySelectorAll("tbody tr")]
        .filter(isUsableElement)
        .map((row) => row.querySelectorAll("td")[productIndex])
        .filter(isUsableElement)
        .map((cell) => cleanText(cell.textContent))
        .filter(Boolean);
    }

    return [];
  };

  const readGridNames = () => {
    const headers = [...document.querySelectorAll('[role="columnheader"]')];
    const productIndex = headers.findIndex(
      (header) => cleanText(header.textContent).toLowerCase() === "product name"
    );

    if (productIndex < 0) {
      return [];
    }

    return [...document.querySelectorAll('[role="row"]')]
      .filter(isUsableElement)
      .map((row) => row.querySelectorAll('[role="cell"]')[productIndex])
      .filter(isUsableElement)
      .map((cell) => cleanText(cell.textContent))
      .filter(Boolean);
  };

  const readAccountLabel = () => {
    const selectors = [
      '[data-testid*="store-name" i]',
      '[data-testid*="vendor-name" i]',
      '[data-testid*="account" i]',
      'aside [class*="store-name" i]',
      'aside [class*="vendor-name" i]',
      '[class*="account" i]',
      "aside h2",
      "aside h3",
      "nav h2",
      "nav h3"
    ];
    const ignored = new Set(["inventory", "overview", "settings", "store management"]);

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = cleanText(element?.textContent);
      if (value && value.length <= 120 && !ignored.has(value.toLowerCase())) {
        return value;
      }
    }

    return "";
  };

  const isLoading = () => {
    const selectors = [
      '[aria-busy="true"]',
      '[role="progressbar"]',
      '[data-testid*="loading" i]',
      '[class*="loading" i]',
      '[class*="skeleton" i]'
    ];
    return selectors.some((selector) =>
      [...document.querySelectorAll(selector)].some(isUsableElement)
    );
  };

  const readExpectedCount = () => {
    const text = cleanText(document.body?.innerText);
    const match = text.match(
      /(?:showing\s+)?\d+\s*(?:-|–|to)\s*\d+\s+of\s+([\d,]+)|([\d,]+)\s+(?:items|results|products)\b/i
    );
    const value = match?.[1] || match?.[2];
    return value ? Number(value.replace(/,/g, "")) : null;
  };

  const makeCaptureKey = (url, accountLabel) => {
    const parameters = [...url.searchParams.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    return `${cleanText(accountLabel).toLowerCase() || "account-unavailable"}|${url.pathname}?${parameters}`;
  };

  const readPageLabel = (url) => {
    const selectors = ['[aria-current="page"]', '[class*="pagination" i] [class*="active" i]'];

    for (const selector of selectors) {
      const value = cleanText(document.querySelector(selector)?.textContent);
      if (/^\d+$/.test(value)) {
        return `Page ${value}`;
      }
    }

    return `Inventory offset ${url.searchParams.get("offset") || "0"}`;
  };

  const captureInventory = () => {
    const url = new URL(globalThis.location.href);

    if (
      url.origin !== "https://marketplace.example.invalid" ||
      !url.pathname.startsWith("/v-shop/dashboard/inventory")
    ) {
      throw new Error("Open the Ayshei inventory page before capturing.");
    }

    if (isLoading()) {
      throw new Error(
        "Inventory is still loading. Wait until the rows finish loading, then capture again."
      );
    }

    const tableNames = readTableNames();
    const names = tableNames.length ? tableNames : readGridNames();
    const offset = url.searchParams.get("offset") || "0";

    if (!names.length) {
      throw new Error(
        "No Product Name rows were found. Scroll until the inventory rows load, or use the paste fallback."
      );
    }

    const accountLabel = readAccountLabel();
    return {
      accountLabel,
      capturedAt: new Date().toISOString(),
      expectedCount: readExpectedCount(),
      key: makeCaptureKey(url, accountLabel),
      label: readPageLabel(url),
      names,
      source: "automatic",
      url: url.href
    };
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== MESSAGE_TYPE || sender?.id !== chrome.runtime.id) {
      return undefined;
    }

    try {
      sendResponse({ data: captureInventory(), ok: true });
    } catch (error) {
      sendResponse({
        detail: error?.message || "Luna could not read this inventory page.",
        ok: false
      });
    }

    return undefined;
  });
})();
