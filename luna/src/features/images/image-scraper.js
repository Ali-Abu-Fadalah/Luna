globalThis.LunaImageScraper = (() => {
  const collectButton = document.querySelector("#image-scraper-collect");
  const importButton = document.querySelector("#image-scraper-import");
  const clearButton = document.querySelector("#image-scraper-clear");
  const preview = document.querySelector("#image-scraper-preview");
  const imageList = document.querySelector("#image-scraper-list");
  const undoButton = document.querySelector("#image-scraper-undo");
  const count = document.querySelector("#image-scraper-count");
  const status = document.querySelector("#image-scraper-status");
  const message = document.querySelector("#image-scraper-message");
  const storageKey =
    globalThis.LunaFoundation?.storageKeys.imageDraft || "luna.imageScraper.draft.v1";
  let draft = null;
  let lastRemoved = null;
  let busy = false;
  let uploadSequence = 0;
  const UPLOAD_TIMEOUT_MS = 90000;

  const withTimeout = (promise, milliseconds, messageText) =>
    new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => reject(new Error(messageText)), milliseconds);
      Promise.resolve(promise).then(
        (value) => {
          globalThis.clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          globalThis.clearTimeout(timer);
          reject(error);
        }
      );
    });

  const setStatus = (state, text) => {
    status.dataset.imageState = state;
    status.textContent = text;
  };
  const setMessage = (text, kind = "info") => {
    message.dataset.kind = kind;
    message.textContent = text;
  };
  const save = async () => {
    if (draft) {
      await chrome.storage.local.set({ [storageKey]: draft });
    } else {
      await chrome.storage.local.remove(storageKey);
    }
  };
  const currentTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("Open a normal car-ad page first.");
    }
    return tab;
  };
  const findAysheiTargetTab = async () => {
    const activeTab = await currentTab();
    const openAysheiTabs = await chrome.tabs.query({
      url: "https://marketplace.example.invalid/place-ad/*"
    });

    return globalThis.LunaImageScraperCore.selectAysheiTargetTab(activeTab, openAysheiTabs);
  };
  const updateDraft = (images, successMessage = "") => {
    draft.images = images;
    render();
    save().catch(() => {});
    if (successMessage) setMessage(successMessage, "success");
  };
  const removeImage = (image) => {
    if (!draft) return;
    const index = draft.images.findIndex((candidate) => candidate.id === image.id);
    if (index < 0) return;
    lastRemoved = { image, index };
    updateDraft(
      globalThis.LunaImageScraperCore.removeImage(draft.images, image.id),
      "Image removed from this review only. Use Undo if needed."
    );
  };

  const renderImages = () => {
    imageList.replaceChildren();
    (draft?.images || []).forEach((image, index) => {
      const item = document.createElement("li");
      const picture = document.createElement("img");
      const details = document.createElement("div");
      const label = document.createElement("strong");
      const actions = document.createElement("div");
      const mainButton = document.createElement("button");
      const upButton = document.createElement("button");
      const downButton = document.createElement("button");
      const removeButton = document.createElement("button");
      item.tabIndex = 0;
      item.dataset.imageId = image.id;
      item.classList.toggle("is-main", index === 0);
      item.setAttribute(
        "aria-label",
        `${index === 0 ? "Main image" : `Image ${index + 1}`}. Use the visible buttons to change its position or remove it.`
      );
      picture.src = image.url;
      picture.alt = image.alt || `Car image ${index + 1}`;
      picture.draggable = false;
      picture.referrerPolicy = "no-referrer";
      const thumbnailFallback = image.url.replace(/\/w_1300x760\//i, "/130x76/");
      picture.addEventListener("error", async () => {
        if (!picture.dataset.thumbnailFallbackApplied && thumbnailFallback !== image.url) {
          picture.dataset.thumbnailFallbackApplied = "true";
          picture.src = thumbnailFallback;
          return;
        }
        if (picture.dataset.backgroundFetchAttempted) return;
        picture.dataset.backgroundFetchAttempted = "true";
        const urls = [...new Set([image.url, thumbnailFallback].filter(Boolean))];
        for (const url of urls) {
          try {
            const response = await chrome.runtime.sendMessage({
              type: globalThis.LunaFoundation.messageTypes.imageFetch,
              url
            });
            if (!response?.ok || !response.data?.base64) continue;
            const contentType = String(response.data.contentType || "image/jpeg")
              .split(";", 1)[0]
              .toLowerCase();
            picture.src = `data:${contentType};base64,${response.data.base64}`;
            return;
          } catch (error) {
            // The Ayshei upload path still reports the precise download error.
          }
        }
      });
      label.className = "image-scraper-item-label";
      label.textContent = index === 0 ? "1 · Main image" : `Image ${index + 1}`;
      actions.className = "image-scraper-item-actions";

      mainButton.type = "button";
      mainButton.textContent = index === 0 ? "Main" : "Make main";
      mainButton.disabled = index === 0;
      mainButton.addEventListener("click", () => {
        lastRemoved = null;
        updateDraft(
          globalThis.LunaImageScraperCore.moveImage(draft.images, image.id, 0),
          "Main image changed."
        );
      });

      upButton.type = "button";
      upButton.textContent = "↑";
      upButton.title = "Move up";
      upButton.setAttribute("aria-label", `Move image ${index + 1} up`);
      upButton.disabled = index === 0;
      upButton.addEventListener("click", () => {
        lastRemoved = null;
        updateDraft(
          globalThis.LunaImageScraperCore.moveImage(draft.images, image.id, index - 1),
          "Image moved up."
        );
      });

      downButton.type = "button";
      downButton.textContent = "↓";
      downButton.title = "Move down";
      downButton.setAttribute("aria-label", `Move image ${index + 1} down`);
      downButton.disabled = index === draft.images.length - 1;
      downButton.addEventListener("click", () => {
        lastRemoved = null;
        updateDraft(
          globalThis.LunaImageScraperCore.moveImage(draft.images, image.id, index + 1),
          "Image moved down."
        );
      });

      removeButton.type = "button";
      removeButton.className = "is-remove";
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", `Remove image ${index + 1}`);
      removeButton.addEventListener("click", () => removeImage(image));

      actions.append(mainButton, upButton, downButton, removeButton);
      details.className = "image-scraper-item-details";
      details.append(label, actions);
      item.append(picture, details);
      item.addEventListener("keydown", (event) => {
        const currentIndex = draft.images.findIndex((candidate) => candidate.id === image.id);
        let targetIndex = currentIndex;
        if (event.key === "Home") targetIndex = 0;
        else if (event.key === "ArrowUp") targetIndex = currentIndex - 1;
        else if (event.key === "ArrowDown") targetIndex = currentIndex + 1;
        else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          removeImage(image);
          return;
        } else {
          return;
        }
        event.preventDefault();
        lastRemoved = null;
        updateDraft(
          globalThis.LunaImageScraperCore.moveImage(draft.images, image.id, targetIndex),
          targetIndex <= 0 ? "Main image changed." : "Image order changed."
        );
      });
      imageList.append(item);
    });
  };

  const render = () => {
    const validation = globalThis.LunaImageScraperCore.validate(draft);
    preview.hidden = !draft?.images?.length;
    count.textContent = validation.message;
    importButton.disabled = busy || !validation.isReady;
    collectButton.disabled = busy;
    clearButton.disabled = busy || !draft;
    undoButton.hidden = !lastRemoved || busy;
    renderImages();
  };

  const collect = async () => {
    busy = true;
    render();
    setStatus("working", "Scanning");
    setMessage("Finding the active advertisement’s car gallery…");
    try {
      const tab = await currentTab();
      const hasAllSites = await chrome.permissions.contains({
        origins: ["https://*/*"]
      });
      if (!hasAllSites) {
        const granted = await chrome.permissions.request({
          origins: ["https://*/*"]
        });
        if (!granted) {
          throw new Error(
            "Allow website access once so Luna can read and transfer the reviewed images."
          );
        }
      }
      const [verifiedTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (
        !/^https?:/i.test(verifiedTab?.url || "") ||
        /^https:\/\/marketplace\.example\.invalid\/place-ad\//i.test(verifiedTab.url)
      ) {
        throw new Error("Open the vendor’s car advertisement before collecting.");
      }
      const result = await chrome.scripting.executeScript({
        files: ["src/features/images/image-scraper-source.js"],
        target: { tabId: tab.id }
      });
      const capture = globalThis.LunaImageScraperCore.sanitizeCapture(
        result?.[0]?.result,
        globalThis.LunaImageScraperCore.MAX_IMAGES
      );
      draft = capture;
      lastRemoved = null;
      if (!draft.images.length) {
        throw new Error(
          "No reliable car gallery was found. Open the advertisement detail page and try again."
        );
      }
      await save();
      const validation = globalThis.LunaImageScraperCore.validate(draft);
      setStatus(validation.isReady ? "ready" : "review", validation.isReady ? "Ready" : "Review");
      setMessage(
        validation.isReady
          ? `Found ${validation.imageCount} car images in gallery order. Use Make main or the arrow buttons to adjust them.`
          : `Only ${validation.imageCount} car images were found; Ayshei needs at least 3.`,
        validation.isReady ? "success" : "warning"
      );
    } catch (error) {
      draft = null;
      lastRemoved = null;
      await save().catch(() => {});
      setStatus("failed", "Failed");
      setMessage(error.message, "error");
    } finally {
      busy = false;
      render();
    }
  };

  const sendImagesToTab = async (tabId, onSelected) => {
    const uploadId = typeof onSelected === "function" ? `${Date.now()}-${++uploadSequence}` : "";
    const selectedListener = (message, sender) => {
      if (
        message?.type !== "luna.imageScraper.selected" ||
        message.uploadId !== uploadId ||
        sender?.id !== chrome.runtime.id ||
        sender?.tab?.id !== tabId
      )
        return;
      chrome.runtime.onMessage.removeListener(selectedListener);
      onSelected({ count: message.count, selected: true });
    };
    if (uploadId) chrome.runtime.onMessage.addListener(selectedListener);
    try {
      await chrome.scripting.executeScript({
        files: [
          "src/features/images/image-upload-core.js",
          "src/features/images/image-scraper-fill.js"
        ],
        target: { tabId }
      });
      const response = await withTimeout(
        chrome.tabs.sendMessage(tabId, {
          images: draft.images,
          type: globalThis.LunaFoundation?.messageTypes.imageUpload || "luna.imageScraper.upload",
          uploadId
        }),
        UPLOAD_TIMEOUT_MS,
        "Ayshei did not confirm that its gallery kept the images within 90 seconds. The reviewed images remain in Luna; check Ayshei before retrying."
      );
      if (!response?.ok) {
        throw new Error(response?.detail || "Ayshei did not accept the images.");
      }
      if (response.result?.retained !== true) {
        throw new Error("Ayshei did not confirm that the selected images stayed present.");
      }
      return response.result;
    } finally {
      if (uploadId) chrome.runtime.onMessage.removeListener(selectedListener);
    }
  };

  const verifyImagesOnTab = async (tabId, expectedCount) => {
    await chrome.scripting.executeScript({
      files: [
        "src/features/images/image-upload-core.js",
        "src/features/images/image-scraper-fill.js"
      ],
      target: { tabId }
    });
    const response = await withTimeout(
      chrome.tabs.sendMessage(tabId, {
        expectedCount,
        type: "luna.imageScraper.verify"
      }),
      5000,
      "Ayshei did not confirm that the vehicle images are still present."
    );
    if (!response?.ok) {
      throw new Error(response?.detail || "Ayshei no longer shows the vehicle images.");
    }
    return response.result;
  };

  const importToAyshei = async () => {
    const validation = globalThis.LunaImageScraperCore.validate(draft);
    if (!validation.isReady) {
      setMessage(validation.message, "error");
      return;
    }
    busy = true;
    render();
    setStatus("working", "Importing");
    setMessage("Finding the safest open Ayshei placement tab…");
    try {
      const tab = await findAysheiTargetTab();
      setMessage(
        tab.active
          ? "Downloading the reviewed images for the current Ayshei tab…"
          : "Downloading the reviewed images for the nearest open Ayshei tab while this vendor page stays active…"
      );
      const { imported, normalized, skipped } = await sendImagesToTab(tab.id);
      setStatus("done", "Imported");
      setMessage(
        `${imported} images imported in this order; image 1 is main.${
          normalized
            ? ` ${normalized} image${normalized === 1 ? " was" : "s were"} resized or converted for Ayshei.`
            : ""
        }${
          skipped ? ` ${skipped} unavailable image${skipped === 1 ? "" : "s"} skipped.` : ""
        } Review them on Ayshei before continuing. Luna kept this image review in case Ayshei removes a photo later.`,
        "success"
      );
    } catch (error) {
      setStatus("failed", "Failed");
      setMessage(error.message, "error");
    } finally {
      busy = false;
      render();
    }
  };

  const clear = async () => {
    draft = null;
    lastRemoved = null;
    await save();
    setStatus("idle", "Ready");
    setMessage("Open any vendor car ad and collect its images.");
    render();
  };

  undoButton.addEventListener("click", () => {
    if (!draft || !lastRemoved) return;
    const restored = [...draft.images];
    restored.splice(Math.min(lastRemoved.index, restored.length), 0, lastRemoved.image);
    lastRemoved = null;
    updateDraft(restored, "Removed image restored.");
  });
  collectButton.addEventListener("click", collect);
  importButton.addEventListener("click", importToAyshei);
  clearButton.addEventListener("click", clear);

  chrome.storage.local
    .get({ [storageKey]: null })
    .then((saved) => {
      if (saved[storageKey]) {
        draft = globalThis.LunaImageScraperCore.sanitizeCapture(saved[storageKey]);
      }
      render();
    })
    .catch(() => render());

  return Object.freeze({
    async clearForManualAd() {
      await clear();
    },
    async collectForManualAd() {
      await collect();
      const validation = globalThis.LunaImageScraperCore.validate(draft);
      return {
        detail: validation.message,
        imageCount: validation.imageCount,
        isReady: validation.isReady
      };
    },
    getReview() {
      const validation = globalThis.LunaImageScraperCore.validate(draft);
      return {
        detail: validation.message,
        hasDraft: Boolean(draft),
        imageCount: validation.imageCount,
        isReady: validation.isReady
      };
    },
    onSectionShown(sectionId) {
      if (sectionId === "manual-ad-assistant") render();
    },
    render,
    async uploadToAysheiTab(tabId, onSelected) {
      const validation = globalThis.LunaImageScraperCore.validate(draft);
      if (!validation.isReady) throw new Error(validation.message);
      busy = true;
      render();
      setStatus("working", "Importing");
      try {
        const result = await sendImagesToTab(tabId, onSelected);
        setStatus("ready", "Uploaded");
        setMessage(
          `${result.imported} images were retained by Ayshei. Finishing the vehicle details…`,
          "success"
        );
        return result;
      } finally {
        busy = false;
        render();
      }
    },
    async verifyOnAysheiTab(tabId, expectedCount) {
      return verifyImagesOnTab(tabId, expectedCount);
    }
  });
})();
