globalThis.LunaListingsScraper = (() => {
  const view = document.querySelector(".listings-scraper-view");
  const scrapeButton = document.querySelector("#scraper-start");
  const collectMoreButton = document.querySelector("#scraper-collect-more");
  const stopCollectionButton = document.querySelector("#scraper-stop");
  const otherSitesButton = document.querySelector("#scraper-enable-other-sites");
  const otherSitesStatus = document.querySelector("#scraper-other-sites-status");
  const scrapeStatus = document.querySelector("#scraper-status");
  const scrapeMode = document.querySelector("#scraper-mode");
  const message = document.querySelector("#scraper-message");
  const lastSendView = document.querySelector("#scraper-last-send");
  const lastSendSummary = document.querySelector("#scraper-last-send-summary");
  const preview = document.querySelector("#scraper-preview");
  const genericWarning = document.querySelector("#scraper-generic-warning");
  const acceptedList = document.querySelector("#scraper-accepted-list");
  const acceptedSearch = document.querySelector("#scraper-search");
  const excludedList = document.querySelector("#scraper-excluded-list");
  const selectAllButton = document.querySelector("#scraper-select-all");
  const unselectAllButton = document.querySelector("#scraper-unselect-all");
  const sendButton = document.querySelector("#scraper-send-selected");
  const duplicateFilterOption = document.querySelector("#scraper-filter-duplicates");
  const duplicateFilterNote = document.querySelector("#scraper-duplicate-note");
  const separatorOption = document.querySelector("#scraper-add-separator");
  const selectedCount = document.querySelector("#scraper-selected-count");
  const unlistedOutput = document.querySelector("#scraper-unlisted-output");
  const copyUnlistedButton = document.querySelector("#scraper-copy-unlisted");
  const unlistedCount = document.querySelector("#scraper-unlisted-count");
  const totals = {
    accepted: document.querySelector("#scraper-total-accepted"),
    detected: document.querySelector("#scraper-total-detected"),
    excluded: document.querySelector("#scraper-total-excluded")
  };
  let capture = null;
  let endpoint = "";
  let selected = new Set();
  let busy = false;
  let captureBatches = [];
  let collecting = false;
  let collectionCancelled = false;
  let pendingSend = null;
  const ALL_SITE_ORIGINS = Object.freeze(["https://*/*"]);
  const SEPARATOR_PREFERENCE_KEY =
    globalThis.LunaFoundation?.storageKeys.listingSeparator || "luna.scraper.addSeparator.v1";
  const RAW_DATA_SEND_KEY =
    globalThis.LunaFoundation?.storageKeys.rawDataSend || "luna.rawDataSend.v1";
  const WRITE_TIMEOUT_MS = 20000;

  try {
    endpoint = globalThis.LunaScraperCore.validateEndpoint(
      globalThis.LunaConfig?.rawDataWriterEndpoint
    );
  } catch (error) {
    endpoint = "";
  }

  const setScrapeState = (state, text) => {
    scrapeStatus.dataset.scraperState = state;
    scrapeStatus.textContent = text;
  };

  const setMessage = (text, kind = "info") => {
    message.dataset.kind = kind;
    message.textContent = text;
  };

  const createClientRequestId = () => {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
      .slice(6, 8)
      .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  };

  const renderLastSend = (summary) => {
    if (!summary) {
      lastSendView.hidden = true;
      lastSendSummary.textContent = "";
      return;
    }
    const range = summary.appendedRange ? ` · ${summary.appendedRange}` : "";
    const retry = summary.duplicateRequest ? " · retry already completed" : "";
    const formatting = summary.formattingCompleted ? "" : " · formatting incomplete";
    lastSendView.dataset.kind = summary.formattingCompleted ? "success" : "warning";
    lastSendSummary.textContent = `${summary.inserted} rows confirmed${range}${retry}${formatting}`;
    lastSendView.hidden = false;
  };

  const saveLastSend = async (confirmation) => {
    const summary = {
      appendedRange: confirmation.appendedRange,
      completedAt: new Date().toISOString(),
      duplicateRequest: confirmation.duplicateRequest,
      formattingCompleted: confirmation.formattingCompleted,
      inserted: confirmation.inserted,
      missingPrices: confirmation.missingPrices,
      outcome: confirmation.outcome,
      requestId: confirmation.requestId,
      separatorAdded: confirmation.separatorAdded
    };
    renderLastSend(summary);
    await chrome.storage.local.set({
      [RAW_DATA_SEND_KEY]: { last: summary, version: 1 }
    });
  };

  const restoreLastSend = async () => {
    const saved = await chrome.storage.local.get({ [RAW_DATA_SEND_KEY]: null });
    const payload = saved[RAW_DATA_SEND_KEY];
    const summary = payload?.version === 1 ? payload.last : null;
    if (
      !summary ||
      !Number.isInteger(summary.inserted) ||
      summary.inserted < 0 ||
      typeof summary.formattingCompleted !== "boolean"
    ) {
      renderLastSend(null);
      return;
    }
    renderLastSend(summary);
  };

  const updateOtherSitesAccess = async () => {
    const enabled = await chrome.permissions.contains({
      origins: [...ALL_SITE_ORIGINS]
    });
    otherSitesStatus.dataset.accessState = enabled ? "enabled" : "limited";
    otherSitesStatus.textContent = enabled
      ? "Other websites enabled"
      : "DubiCars + Dubizzle + Noon";
    otherSitesButton.disabled = enabled;
    otherSitesButton.textContent = enabled ? "Other Websites Enabled" : "Enable Other Websites";
    return enabled;
  };

  const requestOtherSitesAccess = async () => {
    otherSitesButton.disabled = true;
    setMessage("Waiting for Chrome’s website access confirmation...");

    try {
      const granted = await chrome.permissions.request({
        origins: [...ALL_SITE_ORIGINS]
      });
      await updateOtherSitesAccess();
      if (!granted) {
        setMessage(
          "Other-website access was not enabled. DubiCars, Dubizzle, and Noon still work normally.",
          "error"
        );
        return;
      }
      setMessage("Other websites are enabled. Open a listings page and click Scrape.", "success");
    } catch (error) {
      setMessage(`Chrome could not enable other websites: ${error.message}`, "error");
      await updateOtherSitesAccess();
    }
  };

  const restoreSeparatorPreference = async () => {
    const stored = await chrome.storage.local.get(SEPARATOR_PREFERENCE_KEY);
    if (typeof stored[SEPARATOR_PREFERENCE_KEY] === "boolean") {
      separatorOption.checked = stored[SEPARATOR_PREFERENCE_KEY];
    }
  };

  const getExcludedTotal = () => (capture ? capture.excluded.length + capture.unlisted.length : 0);

  const updateSendControls = () => {
    const count = selected.size;
    selectedCount.textContent = String(count);
    sendButton.disabled = busy || count === 0 || !endpoint;
    sendButton.textContent = count ? `Send ${count} Selected` : "Send Selected Items";
  };

  const setBusy = (value) => {
    busy = Boolean(value);
    scrapeButton.disabled = busy;
    collectMoreButton.disabled = busy;
    stopCollectionButton.disabled = !collecting;
    selectAllButton.disabled = busy;
    unselectAllButton.disabled = busy;
    duplicateFilterOption.disabled = busy;
    separatorOption.disabled = busy;
    updateSendControls();
  };

  const duplicateMergeOptions = () => ({
    filterDuplicates: duplicateFilterOption.checked
  });

  const updateDuplicateFilterNote = () => {
    duplicateFilterNote.textContent = duplicateFilterOption.checked
      ? "On: repeated exact name + price listings move to Unlisted as Duplicate."
      : "Off: repeated exact name + price listings stay in Accepted.";
  };

  const captureActivePage = async (tabId) => {
    const results = await chrome.scripting.executeScript({
      files: ["src/features/listings/scraper-page.js"],
      target: { tabId }
    });
    const rawCapture = results?.[0]?.result;
    if (!rawCapture || !Array.isArray(rawCapture.accepted)) {
      throw new Error("The page did not return a valid scraper preview.");
    }
    return rawCapture;
  };

  const advanceLoadMoreOrScroll = async (tabId) => {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const visible = (element) => {
          if (!element || element.hidden || element.getAttribute("aria-hidden") === "true")
            return false;
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        };
        const beforeHeight = document.documentElement.scrollHeight;
        const controls = [
          ...document.querySelectorAll("button, a[role='button'], input[type='button'], a[href]")
        ].filter((element) => visible(element));
        const nextPage = Number(new URL(location.href).searchParams.get("page") || "1") + 1;
        const control =
          controls.find((element) =>
            /^(?:load|show|view)\s+(?:more|all)(?:\s+(?:cars|vehicles|listings|results))?$|more\s+(?:cars|vehicles|listings|results)$/i.test(
              (element.innerText || element.value || "").trim()
            )
          ) ||
          controls.find((element) =>
            /^(?:next|next\s*[›»→])$/i.test((element.innerText || element.value || "").trim())
          ) ||
          controls
            .filter((element) => {
              try {
                const url = new URL(element.href, location.href);
                return (
                  url.origin === location.origin &&
                  Number(url.searchParams.get("page")) === nextPage
                );
              } catch (_) {
                return false;
              }
            })
            .pop();
        if (control) {
          control.click();
        } else {
          window.scrollTo({
            top: Math.max(beforeHeight, window.innerHeight) + window.innerHeight,
            behavior: "auto"
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 750));
        return {
          action: control
            ? /next/i.test((control.innerText || control.value || "").trim()) ||
              Number(
                new URL(control.href || location.href, location.href).searchParams.get("page")
              ) === nextPage
              ? "next-page"
              : "load-more"
            : "scroll",
          height: document.documentElement.scrollHeight
        };
      }
    });
    return results?.[0]?.result;
  };

  const postWriterRequest = async (request) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify(request),
        cache: "no-store",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8"
        },
        method: "POST",
        redirect: "follow",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Raw Data returned HTTP ${response.status}.`);
      }

      return response.text();
    } catch (error) {
      if (controller.signal.aborted) {
        const timeoutError = new Error(
          "Raw Data confirmation timed out after 20 seconds. The Sheet may already contain these rows. Retry Send without changing the selection; Luna will reuse the same request ID so the updated writer cannot append a second copy."
        );
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const makeAcceptedRow = (item) => {
    const row = document.createElement("li");
    const selection = document.createElement("label");
    const checkbox = document.createElement("input");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    const price = document.createElement("span");
    const url = document.createElement("span");
    const removeButton = document.createElement("button");

    checkbox.type = "checkbox";
    checkbox.checked = selected.has(item.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selected.add(item.id);
      } else {
        selected.delete(item.id);
      }
      updateSendControls();
    });
    selection.append(checkbox);
    selection.setAttribute("aria-label", `Select ${item.title}`);

    title.textContent = item.title;
    price.textContent = item.price || "Price not shown — Sheet cell will be empty and red";
    if (!item.price) {
      price.classList.add("scraper-missing-price");
    }
    url.textContent = item.url;
    copy.append(title, price, url);

    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      selected.delete(item.id);
      capture.accepted = capture.accepted.filter((candidate) => candidate.id !== item.id);
      capture.excluded.push({
        ...item,
        reason: "Removed during preview"
      });
      captureBatches = [capture];
      render();
      setMessage("Item removed from this preview. A new page scrape will reset removals.");
    });

    row.append(selection, copy, removeButton);
    return row;
  };

  const render = () => {
    if (!capture) {
      preview.hidden = true;
      updateSendControls();
      return;
    }

    totals.detected.textContent = String(capture.detected);
    totals.accepted.textContent = String(capture.accepted.length);
    totals.excluded.textContent = String(getExcludedTotal());
    scrapeMode.textContent = capture.mode === "generic" ? "Generic mode" : capture.site;
    scrapeMode.dataset.mode = capture.mode;
    genericWarning.hidden = !capture.genericWarning;

    acceptedList.replaceChildren();
    const query = String(acceptedSearch?.value || "")
      .trim()
      .toLocaleLowerCase("en");
    const visibleAccepted = capture.accepted.filter((item) =>
      [item.title, item.url, item.price].some((value) =>
        String(value || "")
          .toLocaleLowerCase("en")
          .includes(query)
      )
    );
    if (!visibleAccepted.length) {
      const empty = document.createElement("li");
      empty.className = "scraper-empty-row";
      empty.textContent = capture.accepted.length
        ? "No listings match this search. Your selection is kept."
        : "No sendable vendor listings were accepted.";
      acceptedList.append(empty);
    } else {
      visibleAccepted.forEach((item) => acceptedList.append(makeAcceptedRow(item)));
    }

    if (excludedList) {
      excludedList.replaceChildren();
      capture.excluded.forEach((item) => {
        const row = document.createElement("li");
        const title = document.createElement("strong");
        const url = document.createElement("span");
        const reason = document.createElement("span");
        title.textContent = item.title || "Untitled listing";
        url.textContent = item.url || "No valid URL";
        reason.textContent = item.reason || "Excluded from this batch";
        row.append(title, url, reason);
        excludedList.append(row);
      });
      if (!capture.excluded.length) {
        const empty = document.createElement("li");
        empty.className = "scraper-empty-row";
        empty.textContent = "No excluded listings.";
        excludedList.append(empty);
      }
    }

    unlistedOutput.value = globalThis.LunaScraperCore.buildUnlistedTsv(capture.unlisted);
    unlistedCount.textContent = String(capture.unlisted.length);
    copyUnlistedButton.disabled = capture.unlisted.length === 0;
    preview.hidden = false;
    updateSendControls();
  };

  const scrapeCurrentPage = async () => {
    if (busy) return;
    if (!capture?.accepted.length) {
      capture = null;
      captureBatches = [];
      selected = new Set();
    }
    pendingSend = null;
    render();
    setBusy(true);
    setScrapeState("scraping", "Scraping");
    setMessage(
      captureBatches.length
        ? `Adding this manually opened page to the current batch. Maximum ${globalThis.LunaScraperCore.MAX_ITEMS} accepted ads.`
        : `Reading this page to start a batch. Maximum ${globalThis.LunaScraperCore.MAX_ITEMS} accepted ads. Nothing will be sent.`
    );

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });
      if (!tab?.id) {
        throw new Error("Luna could not find the current website tab.");
      }

      const rawCapture = await captureActivePage(tab.id);
      const previousIds = new Set(capture?.accepted.map((item) => item.id) || []);
      const nextBatches = [...captureBatches, rawCapture];
      const nextCapture = globalThis.LunaScraperCore.mergeCaptures(
        nextBatches,
        duplicateMergeOptions()
      );
      if (nextCapture.limitExceeded) {
        throw new Error(
          `This page would take the batch above ${globalThis.LunaScraperCore.MAX_ITEMS} accepted ads. Send the current batch first, then scrape this page as a new batch.`
        );
      }
      captureBatches = nextBatches;
      capture = nextCapture;
      selected = new Set(
        capture.accepted
          .filter((item) => selected.has(item.id) || !previousIds.has(item.id))
          .map((item) => item.id)
      );
      render();
      setScrapeState("ready", "Preview ready");
      const duplicates = capture.unlisted.filter((item) => item.reason === "Duplicate").length;
      setMessage(
        `${capture.site}: ${capture.accepted.length} accepted across ${captureBatches.length} page${captureBatches.length === 1 ? "" : "s"}, ${getExcludedTotal()} excluded${duplicates ? ` including ${duplicates} duplicate${duplicates === 1 ? "" : "s"}` : ""}. Open the next page manually and click Scrape again, or review and send once.`,
        "success"
      );
    } catch (error) {
      setScrapeState("failed", "Failed");
      const accessFailure = /cannot access|permission|host|not allowed|chrome:\/\//i.test(
        error.message
      );
      setMessage(
        accessFailure
          ? "This website needs access. Click Enable Other Websites, approve Chrome’s prompt once, then scrape again."
          : `${error.message} Confirm that this is a normal HTTP(S) listings page and try again.`,
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const collectMore = async () => {
    if (busy) return;
    collectionCancelled = false;
    collecting = true;
    setBusy(true);
    setScrapeState("scraping", "Collecting");
    setMessage(
      `Collecting visible listings incrementally, up to ${globalThis.LunaScraperCore.MAX_ITEMS} accepted ads. Nothing will be sent.`
    );
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("Luna could not find the current website tab.");
      const captures = [await captureActivePage(tab.id)];
      let stablePasses = 0;
      let previousCount = globalThis.LunaScraperCore.mergeCaptures(
        captures,
        duplicateMergeOptions()
      ).accepted.length;
      let reason = "stable";
      for (let pass = 0; pass < 24; pass += 1) {
        if (collectionCancelled) {
          reason = "cancelled";
          break;
        }
        await advanceLoadMoreOrScroll(tab.id);
        if (collectionCancelled) {
          reason = "cancelled";
          break;
        }
        captures.push(await captureActivePage(tab.id));
        const merged = globalThis.LunaScraperCore.mergeCaptures(captures, duplicateMergeOptions());
        if (merged.accepted.length >= globalThis.LunaScraperCore.MAX_ITEMS) {
          reason = "item limit";
          break;
        }
        if (merged.accepted.length === previousCount) stablePasses += 1;
        else stablePasses = 0;
        previousCount = merged.accepted.length;
        setMessage(
          `Collection pass ${pass + 1}: ${merged.accepted.length} sendable listings found.`
        );
        if (stablePasses >= 3) break;
      }
      const collectedCapture = globalThis.LunaScraperCore.mergeCaptures(
        captures,
        duplicateMergeOptions()
      );
      if (collectedCapture.limitExceeded) {
        throw new Error(
          `Collection reached more than ${globalThis.LunaScraperCore.MAX_ITEMS} accepted ads. Use manual page-by-page scraping so Luna can stop before the limit.`
        );
      }
      captureBatches = captures;
      capture = collectedCapture;
      selected = new Set(capture.accepted.map((item) => item.id));
      render();
      setScrapeState("ready", "Preview ready");
      const duplicates = capture.unlisted.filter((item) => item.reason === "Duplicate").length;
      setMessage(
        `Collection ${reason}: ${capture.accepted.length} accepted, ${getExcludedTotal()} excluded${duplicates ? ` including ${duplicates} duplicate${duplicates === 1 ? "" : "s"}` : ""}. Review before sending once.`,
        "success"
      );
    } catch (error) {
      setScrapeState("failed", "Failed");
      setMessage(
        `${error.message} Confirm this is a normal HTTP(S) listings page and try again.`,
        "error"
      );
    } finally {
      collecting = false;
      setBusy(false);
    }
  };

  const copyUnlisted = async () => {
    const text = unlistedOutput.value;
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (clipboardError) {
      unlistedOutput.focus();
      unlistedOutput.select();
      if (!document.execCommand("copy")) {
        throw clipboardError;
      }
    }
    setMessage("Unlisted URLs and reasons copied as two tab-separated columns.", "success");
  };

  const sendSelected = async () => {
    if (busy) return;
    const items = capture?.accepted.filter((item) => selected.has(item.id)) || [];
    if (!items.length) {
      setMessage("Select at least one accepted listing.", "error");
      return;
    }
    if (!endpoint) {
      setMessage("Luna's built-in company Raw Data writer is unavailable.", "error");
      return;
    }

    const addSeparator = separatorOption.checked;
    const fingerprint = globalThis.LunaScraperCore.buildWriteFingerprint(items, addSeparator);
    if (!pendingSend || pendingSend.fingerprint !== fingerprint) {
      pendingSend = {
        fingerprint,
        requestId: createClientRequestId()
      };
    }
    const request = globalThis.LunaScraperCore.buildWriteRequest(
      items,
      addSeparator,
      pendingSend.requestId
    );
    const missingPriceCount = request.items.filter((item) => !item.price).length;
    setBusy(true);
    setScrapeState("sending", "Sending");
    setMessage(
      `Sending ${request.items.length} selected items to Raw Data${
        addSeparator ? " with a separator row" : ""
      }...`
    );

    try {
      const confirmation = globalThis.LunaScraperCore.validateWriterResponse(
        await postWriterRequest(request),
        request.items.length,
        addSeparator,
        missingPriceCount,
        request.clientRequestId
      );
      const sentIds = new Set(items.map((item) => item.id));
      capture.accepted = capture.accepted.filter((item) => !sentIds.has(item.id));
      captureBatches = capture.accepted.length ? [capture] : [];
      selected.clear();
      pendingSend = null;
      render();
      setScrapeState("successful", "Successful");
      await saveLastSend(confirmation).catch(() => {});
      const resultPrefix = confirmation.duplicateRequest
        ? "Protected retry: Raw Data confirmed the earlier send and added no second copy."
        : confirmation.legacyConfirmation
          ? "Rows confirmed, but retry protection needs the updated Raw Data writer deployment."
          : confirmation.formattingCompleted
            ? "Successful."
            : "Rows were added, but optional formatting was incomplete. Do not resend them.";
      setMessage(
        `${resultPrefix} Raw Data confirmed ${confirmation.inserted} items${
          confirmation.separatorAdded ? " and one colored separator added" : ""
        }${
          confirmation.missingPrices
            ? `; ${confirmation.missingPrices} empty price ${
                confirmation.missingPrices === 1 ? "cell was" : "cells were"
              } colored red`
            : ""
        }.`,
        confirmation.formattingCompleted && !confirmation.legacyConfirmation ? "success" : "warning"
      );
    } catch (error) {
      setScrapeState("failed", "Failed");
      setMessage(
        error.name === "TimeoutError"
          ? error.message
          : `${error.message} No success was recorded because Raw Data did not fully confirm the write.`,
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  scrapeButton.addEventListener("click", scrapeCurrentPage);
  acceptedSearch?.addEventListener("input", render);
  collectMoreButton.addEventListener("click", collectMore);
  stopCollectionButton.addEventListener("click", () => {
    collectionCancelled = true;
    setMessage("Stopping after the current read completes.");
  });
  otherSitesButton.addEventListener("click", requestOtherSitesAccess);
  [chrome.permissions?.onAdded, chrome.permissions?.onRemoved].forEach((event) =>
    event?.addListener?.(() => updateOtherSitesAccess())
  );
  separatorOption.addEventListener("change", () => {
    chrome.storage.local.set({
      [SEPARATOR_PREFERENCE_KEY]: separatorOption.checked
    });
  });
  duplicateFilterOption.addEventListener("change", updateDuplicateFilterNote);
  selectAllButton.addEventListener("click", () => {
    selected = new Set(capture?.accepted.map((item) => item.id) || []);
    render();
  });
  unselectAllButton.addEventListener("click", () => {
    selected.clear();
    render();
  });
  sendButton.addEventListener("click", sendSelected);
  copyUnlistedButton.addEventListener("click", () => {
    copyUnlisted().catch(() => setMessage("Luna could not copy the Unlisted output.", "error"));
  });
  render();
  updateDuplicateFilterNote();
  updateOtherSitesAccess().catch(() => {});
  restoreSeparatorPreference().catch(() => {});
  restoreLastSend().catch(() => renderLastSend(null));

  return Object.freeze({
    onSectionShown(sectionId) {
      if (sectionId === "scraper-images" && !view.hidden) {
        render();
        updateOtherSitesAccess().catch(() => {});
      }
    }
  });
})();
