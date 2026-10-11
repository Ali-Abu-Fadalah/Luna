globalThis.LunaInventoryChecker = (() => {
  const storageKey = globalThis.LunaFoundation?.storageKeys.inventory || "luna.inventoryChecker.v1";
  const sheetDataStorageKey =
    globalThis.LunaFoundation?.storageKeys.inventorySheetData || "luna.inventorySheetData.v1";
  const storageArea = globalThis.chrome?.storage?.local;
  const view = document.querySelector(".inventory-checker-view");
  const captureButton = document.querySelector("#inventory-capture-page");
  const clearButton = document.querySelector("#inventory-clear");
  const compareButton = document.querySelector("#inventory-compare");
  const pasteButton = document.querySelector("#inventory-add-paste");
  const pasteText = document.querySelector("#inventory-paste-text");
  const sheetText = document.querySelector("#inventory-sheet-text");
  const useSheetButton = document.querySelector("#inventory-use-sheet-data");
  const clearSheetButton = document.querySelector("#inventory-clear-sheet-data");
  const sheetCount = document.querySelector("#inventory-sheet-count");
  const comparisonSource = document.querySelector("#inventory-comparison-source");
  const viewSelect = document.querySelector("#inventory-view-select");
  const message = document.querySelector("#inventory-message");
  const account = document.querySelector("#inventory-account");
  const pageCount = document.querySelector("#inventory-page-count");
  const nameCount = document.querySelector("#inventory-name-count");
  const pageList = document.querySelector("#inventory-page-list");
  const resultsView = document.querySelector("#inventory-results");
  const resultSections = document.querySelectorAll(".inventory-result-card");
  const copyMissing = document.querySelector("#inventory-copy-missing");
  const copyRepeated = document.querySelector("#inventory-copy-repeated");
  const totals = {
    matched: document.querySelector("#inventory-total-matched"),
    missing: document.querySelector("#inventory-total-missing"),
    possible: document.querySelector("#inventory-total-possible"),
    repeated: document.querySelector("#inventory-total-repeated")
  };
  const lists = {
    matched: document.querySelector("#inventory-list-matched"),
    missing: document.querySelector("#inventory-list-missing"),
    possible: document.querySelector("#inventory-list-possible"),
    repeated: document.querySelector("#inventory-list-repeated")
  };
  let state = globalThis.LunaInventoryCore.makeEmptyState();
  let sheetData = globalThis.LunaInventoryCore.makeEmptySheetData();
  let comparison = null;

  const saveState = async () => {
    if (storageArea) {
      await storageArea.set({ [storageKey]: state });
    }
  };

  const saveSheetData = async () => {
    if (storageArea) {
      await storageArea.set({ [sheetDataStorageKey]: sheetData });
    }
  };

  const setMessage = (text, kind = "info") => {
    message.textContent = text;
    message.dataset.kind = kind;
  };

  const copyText = async (text, successMessage) => {
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (clipboardError) {
      const fallback = document.createElement("textarea");
      fallback.value = text;
      fallback.setAttribute("readonly", "");
      fallback.className = "inventory-copy-fallback";
      document.body.append(fallback);
      fallback.select();
      const copied = document.execCommand("copy");
      fallback.remove();
      if (!copied) {
        throw clipboardError;
      }
    }

    setMessage(successMessage, "success");
  };

  const resetComparison = () => {
    comparison = null;
    resultsView.hidden = true;
    copyMissing.disabled = true;
    copyRepeated.disabled = true;
  };

  const updateCompareControls = () => {
    const pastedCount = sheetData.names.length;
    const inventoryCount = globalThis.LunaInventoryCore.getInventoryEntries(state).length;
    compareButton.disabled = pastedCount === 0 || inventoryCount === 0;
    const accountNote = state.accountLabel
      ? ` Account: ${state.accountLabel}.`
      : state.pages.length
        ? " Account could not be detected; confirm all captures belong to one vendor."
        : "";
    comparisonSource.textContent = pastedCount
      ? `${pastedCount} pasted names will be checked against ${inventoryCount} captured inventory names. Only pasted names can be missing.${accountNote}`
      : "Paste advertisement names above, then capture the inventory pages.";
  };

  const renderCapturedPages = () => {
    pageList.replaceChildren();
    const entries = globalThis.LunaInventoryCore.getInventoryEntries(state);
    account.textContent = state.accountLabel || "Account not detected";
    pageCount.textContent = String(state.pages.length);
    nameCount.textContent = String(entries.length);
    clearButton.disabled = state.pages.length === 0;
    updateCompareControls();

    if (!state.pages.length) {
      const empty = document.createElement("p");
      empty.className = "inventory-empty";
      empty.textContent = "No inventory pages captured yet.";
      pageList.append(empty);
      return;
    }

    state.pages.forEach((page) => {
      const item = document.createElement("article");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const detail = document.createElement("span");
      const source = document.createElement("small");

      title.textContent = page.label;
      const capturedAt = new Date(page.capturedAt);
      const ageMinutes = Number.isFinite(capturedAt.getTime())
        ? Math.max(0, Math.floor((Date.now() - capturedAt.getTime()) / 60000))
        : null;
      const age =
        ageMinutes === null
          ? "capture time unavailable"
          : ageMinutes < 60
            ? `${ageMinutes} min ago`
            : `${Math.floor(ageMinutes / 60)}h ago${ageMinutes >= 120 ? " · stale" : ""}`;
      detail.textContent = `${page.names.length}${page.expectedCount ? ` visible of ${page.expectedCount}` : ""} names · ${age}`;
      source.textContent = page.source === "paste" ? "Paste fallback" : "Automatic capture";
      copy.append(title, detail);
      item.append(copy, source);
      pageList.append(item);
    });
  };

  const renderSheetData = () => {
    const count = sheetData.names.length;
    sheetCount.textContent = `${count} name${count === 1 ? "" : "s"}`;
    clearSheetButton.disabled = count === 0;
    updateCompareControls();
  };

  const makeResultRow = (primary, secondary = "", copyValue = "") => {
    const item = document.createElement("li");
    const text = document.createElement("div");
    const title = document.createElement("strong");

    title.textContent = primary;
    text.append(title);
    if (secondary) {
      const detail = document.createElement("span");
      detail.textContent = secondary;
      text.append(detail);
    }
    item.append(text);

    if (copyValue) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Copy";
      button.addEventListener("click", () => copyText(copyValue, `Copied: ${copyValue}`));
      item.append(button);
    }

    return item;
  };

  const fillList = (list, items) => {
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "inventory-result-empty";
      empty.textContent = "None";
      list.append(empty);
      return;
    }
    items.forEach((item) => list.append(item));
  };

  const renderResults = () => {
    if (!comparison) {
      resetComparison();
      return;
    }

    totals.matched.textContent = String(comparison.totals.matched);
    totals.missing.textContent = String(comparison.totals.missing);
    totals.repeated.textContent =
      `${comparison.totals.repeated} names · ` +
      `${comparison.totals.repeatedSheetOccurrences} pasted occurrences`;
    totals.possible.textContent = String(comparison.totals.possible);

    fillList(
      lists.matched,
      comparison.matched.map((entry) =>
        makeResultRow(
          entry.name,
          `Ad ${entry.adNumber} · ${entry.inventory.pageLabel}, row ${entry.inventory.rowIndex + 1}`
        )
      )
    );
    fillList(
      lists.missing,
      comparison.missing.map((entry) =>
        makeResultRow(entry.name, `Ad ${entry.adNumber}`, entry.name)
      )
    );
    fillList(
      lists.repeated,
      comparison.repeated.map((entry) => {
        const pages = [
          ...new Set(entry.occurrences.map((occurrence) => occurrence.pageLabel))
        ].join(", ");
        return makeResultRow(
          entry.name,
          `Pasted ${entry.sheetCount} · Inventory copies ${entry.inventoryCount} · Covered ${entry.matchedCount}/${entry.sheetCount} · Missing ${entry.missingCount}${pages ? ` · ${pages}` : ""}`,
          entry.name
        );
      })
    );
    fillList(
      lists.possible,
      comparison.possible.map((entry) =>
        makeResultRow(
          entry.queueName,
          `Possible inventory name: ${entry.inventoryName} · ${entry.score}% similarity · manual check only`
        )
      )
    );

    copyMissing.disabled = comparison.missing.length === 0;
    copyRepeated.disabled = comparison.repeated.length === 0;
    resultSections.forEach((section) => {
      section.open = false;
    });
    resultsView.hidden = false;
  };

  const requestPageCapture = async (tabId) => {
    const message = {
      type: globalThis.LunaFoundation?.messageTypes.inventoryCapture || "luna.inventory.capture"
    };

    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      const missingReceiver = /could not establish connection|receiving end does not exist/i.test(
        String(error?.message || error)
      );
      if (!missingReceiver) {
        throw error;
      }
    }

    setMessage("Reconnecting Luna to the current inventory page...");
    try {
      await chrome.scripting.executeScript({
        files: ["src/features/inventory/inventory-capture.js"],
        target: { tabId }
      });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      throw new Error(
        "Open the Ayshei inventory page, wait for its rows to load, and try capturing again."
      );
    }
  };

  const captureCurrentPage = async () => {
    setMessage("Reading the current Ayshei inventory page...");
    captureButton.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });
      if (!tab?.id) {
        throw new Error("Luna could not find the active browser tab.");
      }

      const response = await requestPageCapture(tab.id);
      if (!response?.ok) {
        throw new Error(response?.detail || "Luna could not read this inventory page.");
      }

      state = globalThis.LunaInventoryCore.addCapturedPage(state, response.data);
      await saveState();
      resetComparison();
      renderCapturedPages();
      setMessage(
        `${response.data.label} captured with ${response.data.names.length} names. Other captured pages were kept.`,
        "success"
      );
    } catch (error) {
      setMessage(`${error.message} You can use the paste fallback below.`, "error");
    } finally {
      captureButton.disabled = false;
    }
  };

  const addPastedPage = async () => {
    try {
      const pastedPageNumber = state.pages.filter((page) => page.source === "paste").length + 1;
      const payload = globalThis.LunaInventoryCore.makePastePayload(
        pasteText.value,
        pastedPageNumber
      );
      state = globalThis.LunaInventoryCore.addCapturedPage(state, payload);
      await saveState();
      pasteText.value = "";
      resetComparison();
      renderCapturedPages();
      setMessage(
        `${payload.label} added with ${payload.names.length} names. Earlier pages were kept.`,
        "success"
      );
    } catch (error) {
      setMessage(error.message, "error");
    }
  };

  const usePastedSheetData = async () => {
    try {
      sheetData = globalThis.LunaInventoryCore.parseAdNamesText(sheetText.value);
      await saveSheetData();
      sheetText.value = "";
      resetComparison();
      renderSheetData();
      setMessage(
        `${sheetData.names.length} advertisement names are ready for comparison.`,
        "success"
      );
      if (viewSelect) {
        viewSelect.value = "inventory-capture";
        viewSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } catch (error) {
      setMessage(error.message, "error");
    }
  };

  const compareNamesWithInventory = () => {
    const queueAds = globalThis.LunaInventoryCore.sheetDataToQueueAds(sheetData);
    if (!queueAds.length) {
      setMessage("Paste advertisement names before comparing.", "error");
      return;
    }

    comparison = globalThis.LunaInventoryCore.compareInventory(queueAds, state);
    renderResults();
    setMessage(
      `Checked ${comparison.totals.checked} pasted ads: ${comparison.totals.matched} found · ${comparison.totals.missing} missing. Other inventory ads were ignored.`,
      "success"
    );
  };

  captureButton.addEventListener("click", captureCurrentPage);
  pasteButton.addEventListener("click", addPastedPage);
  useSheetButton.addEventListener("click", usePastedSheetData);
  clearSheetButton.addEventListener("click", async () => {
    sheetData = globalThis.LunaInventoryCore.makeEmptySheetData();
    await saveSheetData();
    resetComparison();
    renderSheetData();
    setMessage("Pasted advertisement names cleared.");
  });
  compareButton.addEventListener("click", () => {
    try {
      compareNamesWithInventory();
    } catch (error) {
      setMessage(error.message, "error");
    }
  });
  clearButton.addEventListener("click", async () => {
    if (
      !globalThis.confirm(
        "Clear every captured inventory page? The current Work Queue will not be changed."
      )
    ) {
      return;
    }

    state = globalThis.LunaInventoryCore.makeEmptyState();
    await saveState();
    resetComparison();
    renderCapturedPages();
    setMessage("Captured inventory cleared. The Work Queue was not changed.");
  });
  copyMissing.addEventListener("click", () =>
    copyText(comparison?.missing.map((entry) => entry.name).join("\n"), "All missing names copied.")
  );
  copyRepeated.addEventListener("click", () =>
    copyText(
      comparison?.repeated.map((entry) => entry.name).join("\n"),
      "All repeated names copied."
    )
  );

  const restore = async () => {
    if (storageArea) {
      try {
        const saved = await storageArea.get({
          [sheetDataStorageKey]: null,
          [storageKey]: null
        });
        state = globalThis.LunaInventoryCore.sanitizeState(saved[storageKey]);
        sheetData = globalThis.LunaInventoryCore.sanitizeSheetData(saved[sheetDataStorageKey]);
      } catch (error) {
        setMessage("Luna could not restore captured inventory.", "error");
      }
    }
    renderCapturedPages();
    renderSheetData();
  };

  restore();

  return Object.freeze({
    onSectionShown(sectionId) {
      if (sectionId === "inventory-checker" && !view.hidden) {
        renderCapturedPages();
      }
    }
  });
})();
