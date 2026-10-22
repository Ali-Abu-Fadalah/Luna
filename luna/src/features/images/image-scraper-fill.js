(() => {
  if (globalThis.__lunaImageScraperFillInstalledV2) return;
  globalThis.__lunaImageScraperFillInstalledV2 = true;

  const bytesFromData = (data) => {
    const binary = atob(data.base64);
    const bytes = new Uint8Array(binary.length);
    for (let offset = 0; offset < binary.length; offset += 1) {
      bytes[offset] = binary.charCodeAt(offset);
    }
    return bytes;
  };

  const extensionFor = (contentType) => (contentType === "image/png" ? "png" : "jpg");
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  const canvasBlob = (canvas, contentType) =>
    new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("The prepared image could not be encoded.")),
        contentType,
        contentType === "image/jpeg" ? 0.92 : undefined
      );
    });

  const prepareFile = async (data, index, accept) => {
    const core = globalThis.LunaImageUploadCore;
    if (!core?.makeUploadPlan) {
      throw new Error("Luna's image preparation module is unavailable.");
    }
    const bytes = bytesFromData(data);
    const sourceType = core.normalizeContentType(data.contentType);
    const sourceBlob = new Blob([bytes], { type: sourceType });
    const bitmap = await createImageBitmap(sourceBlob);
    try {
      const plan = core.makeUploadPlan({
        accept,
        contentType: sourceType,
        height: bitmap.height,
        width: bitmap.width
      });
      if (!plan.needsConversion) {
        return {
          file: new File(
            [bytes],
            `luna-car-${String(index + 1).padStart(2, "0")}.${extensionFor(plan.contentType)}`,
            { type: plan.contentType }
          ),
          normalized: false
        };
      }
      const canvas = document.createElement("canvas");
      canvas.width = plan.width;
      canvas.height = plan.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("The browser could not prepare this vehicle image.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, plan.width, plan.height);
      context.drawImage(bitmap, plan.offsetX, plan.offsetY, plan.drawWidth, plan.drawHeight);
      const preparedBlob = await canvasBlob(canvas, plan.contentType);
      return {
        file: new File(
          [preparedBlob],
          `luna-car-${String(index + 1).padStart(2, "0")}.${extensionFor(plan.contentType)}`,
          { type: plan.contentType }
        ),
        normalized: true
      };
    } finally {
      bitmap.close?.();
    }
  };

  const downloadImage = async (image, index) => {
    const sourceUrl = String(image?.url || "");
    const urls = [
      ...new Set([sourceUrl, sourceUrl.replace(/\/w_1300x760\//i, "/130x76/")].filter(Boolean))
    ];
    let lastError = "Download failed";
    for (const url of urls) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "luna.manualAd.fetchImage",
          url
        });
        if (response?.ok) return { data: response.data, index };
        lastError = response?.detail || lastError;
      } catch (error) {
        lastError = error.message || lastError;
      }
    }
    return { error: lastError, index };
  };

  const downloadImages = (images) => Promise.all(images.map(downloadImage));

  const findImageInput = (includeDisabled = false) => {
    const inputs = [...document.querySelectorAll("input[type='file']")];
    const candidates = inputs
      .map((input) => {
        const context = [
          input.accept,
          input.getAttribute("aria-label"),
          input.closest("label,section,form,div")?.textContent
        ].join(" ");
        return {
          input,
          score:
            (/^image\//i.test(input.accept || "") || /image\/\*/i.test(input.accept || "")
              ? 35
              : 0) +
            (/image|media|photo|upload/i.test(context) ? 20 : 0) +
            (input.multiple ? 10 : 0) +
            (input.disabled && !includeDisabled ? -100 : 0)
        };
      })
      .filter(({ input }) => includeDisabled || !input.disabled)
      .sort((left, right) => right.score - left.score);
    return candidates[0]?.input || null;
  };

  const galleryFor = (input) => {
    const dropzone = input?.closest("[role='presentation']");
    const layout = dropzone?.parentElement;
    return layout?.querySelector(".grid, [class*='overflow-x-scroll']") || null;
  };

  const previewCountFor = (input) => {
    const gallery = galleryFor(input);
    if (!gallery) return 0;
    return [...gallery.querySelectorAll("img")].filter((image) => {
      const source = String(image.currentSrc || image.src || "");
      return source && !/\/_next\/static\/|empty-placeholder|upload-icon/i.test(source);
    }).length;
  };

  const readUploadState = () => {
    const input = findImageInput();
    return {
      fileCount: input?.files?.length || 0,
      input,
      previewCount: previewCountFor(input),
      pending: !!galleryFor(input)?.querySelector(
        "[aria-busy='true'], [role='progressbar'], [class*='spinner'], [class*='loading']"
      )
    };
  };

  const waitForRetention = async (expectedCount, attempts = 120, stableRequired = 16) => {
    let stable = 0;
    let missingAfterComplete = 0;
    let everComplete = false;
    let lastState = readUploadState();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      lastState = readUploadState();
      // File inputs only show what Luna selected. Ayshei may still reject the
      // upload and remove its temporary previews after the server responds.
      const retained = lastState.previewCount >= expectedCount && !lastState.pending;
      stable = retained ? stable + 1 : 0;
      if (retained) everComplete = true;
      missingAfterComplete =
        everComplete && lastState.previewCount === 0 ? missingAfterComplete + 1 : 0;
      if (stable >= stableRequired) return { ...lastState, retained: true };
      if (missingAfterComplete >= 10) return { ...lastState, retained: false, disappeared: true };
      await delay(500);
    }
    return { ...lastState, retained: false };
  };

  const assignFiles = (input, files) => {
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    try {
      input.value = "";
    } catch (error) {
      // A few framework-wrapped file inputs expose a read-only value.
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  };

  const isSharePointSource = (sourceUrl) => {
    try {
      const url = new URL(sourceUrl);
      return url.protocol === "https:" && /^[a-z0-9-]+\.sharepoint\.com$/i.test(url.hostname);
    } catch {
      return false;
    }
  };

  const needsOrderedUpload = (sourceUrl) => {
    try {
      const url = new URL(sourceUrl);
      return (
        (/^https?:$/.test(url.protocol) && /^(www\.)?alwanworld\.com$/i.test(url.hostname)) ||
        isSharePointSource(sourceUrl)
      );
    } catch {
      return false;
    }
  };

  const orderedState = () => {
    const input = findImageInput(true);
    const gallery = galleryFor(input);
    // Ayshei renders accepted photos with alt="img". Upload placeholders use
    // blob URLs; decorative icons and empty slots must never count as receipts.
    const sources = [...(gallery?.querySelectorAll("img[alt='img']") || [])].map(
      (image) => image.getAttribute("src") || image.src || ""
    );
    return {
      input,
      sources,
      saved: sources.filter((source) => source && !/^(blob:|data:)/i.test(source))
    };
  };

  const waitForGalleryChange = (input, deadline) =>
    new Promise((resolve) => {
      const layout = input?.closest("[role='presentation']")?.parentElement;
      const canObserve = typeof MutationObserver === "function" && layout;
      let observer;
      let timer;
      const finish = () => {
        observer?.disconnect();
        clearTimeout(timer);
        resolve();
      };
      // Browser DOM notifications advance immediately, including in background
      // tabs where short polling timers may be throttled to a second or more.
      timer = setTimeout(
        finish,
        Math.min(canObserve ? 1000 : 50, Math.max(0, deadline - Date.now()))
      );
      if (canObserve) {
        observer = new MutationObserver(finish);
        observer.observe(layout, {
          attributes: true,
          attributeFilter: ["src", "disabled"],
          childList: true,
          subtree: true
        });
      }
    });

  const uploadInOrder = async (
    images,
    accept,
    onStarted,
    batchAfterMain = false,
    onMainRetained
  ) => {
    const initial = orderedState();
    if (
      !initial.input ||
      initial.input.disabled ||
      !initial.input.closest("[role='presentation']")?.parentElement ||
      initial.sources.length
    ) {
      throw new Error(
        "Ordered image upload needs an empty, idle Ayshei gallery. Open a fresh draft or clear its photos before retrying."
      );
    }
    // Start all downloads now; each prepared result can enter the ordered
    // uploader without waiting for the slowest download or the whole gallery.
    // Resolve failures as values so later failures cannot become unhandled
    // rejections while we are still waiting for an earlier photo.
    const preparations = images.map(async (image, index) => {
      try {
        const downloaded = await downloadImage(image, index);
        if (!downloaded.data) throw new Error(downloaded.error);
        return await prepareFile(downloaded.data, index, accept);
      } catch (error) {
        return { error: error.message || "Image preparation failed." };
      }
    });
    let accepted = [];
    let normalized = 0;
    for (let index = 0; index < images.length; ) {
      // SharePoint needs only the cover saved first. Send the rest together;
      // their completion order cannot replace the already saved cover.
      const end = batchAfterMain && index > 0 ? images.length : index + 1;
      const batch = await Promise.all(preparations.slice(index, end));
      for (const [offset, prepared] of batch.entries()) {
        if (prepared.error) {
          throw new Error(
            `Source photo ${index + offset + 1}/${images.length} could not be prepared: ${prepared.error}. ${accepted.length} photos were saved; check the gallery before retrying.`
          );
        }
        if (prepared.normalized) normalized += 1;
      }
      const current = orderedState();
      if (
        !current.input ||
        current.input.disabled ||
        current.sources.length !== accepted.length ||
        accepted.some((source, offset) => current.saved[offset] !== source)
      ) {
        throw new Error(
          "Ayshei's gallery changed during ordered image upload. Check the photos before retrying."
        );
      }
      assignFiles(
        current.input,
        batch.map((prepared) => prepared.file)
      );
      if (index === 0) onStarted();
      // Individual photos have a short stall budget; the remaining SharePoint
      // batch gets longer to finish its concurrent uploads.
      const timeoutMs = batch.length > 1 ? 60000 : 15000;
      const deadline = Date.now() + timeoutMs;
      let confirmed = false;
      while (Date.now() < deadline) {
        const state = orderedState();
        if (accepted.some((source, offset) => state.saved[offset] !== source)) {
          throw new Error(
            "Ayshei changed the saved photo order during upload. Check the gallery before retrying."
          );
        }
        if (
          state.input &&
          !state.input.disabled &&
          state.sources.length === end &&
          state.saved.length === end
        ) {
          accepted = state.saved;
          confirmed = true;
          break;
        }
        // Read actual server-backed gallery state, not elapsed time or whether
        // the local thumbnail finished loading. No per-photo settling delay.
        await waitForGalleryChange(state.input, deadline);
      }
      if (!confirmed) {
        throw new Error(
          `Ordered upload stopped at photo ${index + 1}/${images.length}: Ayshei did not confirm ${batch.length > 1 ? "the remaining photos were" : "this photo was"} saved within ${timeoutMs / 1000} seconds. ${accepted.length} photos were saved; check the gallery before retrying.`
        );
      }
      if (index === 0 && onMainRetained) await onMainRetained(accepted[0]);
      index = end;
    }
    return { accepted, normalized };
  };

  const upload = async (images, uploadId, sourceUrl) => {
    if (
      location.hostname !== "marketplace.example.invalid" ||
      !location.pathname.startsWith("/place-ad/")
    ) {
      throw new Error("Open Ayshei place-ad step 2 before importing images.");
    }
    const input = findImageInput();
    if (!input) {
      throw new Error("Ayshei’s image upload area was not found on this step.");
    }
    const ordered = needsOrderedUpload(sourceUrl);
    const batchAfterMain = isSharePointSource(sourceUrl);
    const files = [];
    let normalized = 0;
    let skipped = 0;
    // Alwan and SharePoint prepare and upload as a pipeline below. Other vendors retain
    // their existing download-all / batch-upload path.
    const downloaded = ordered ? [] : await downloadImages(images);
    for (const result of downloaded) {
      if (!result?.data) {
        skipped += 1;
        continue;
      }
      try {
        const prepared = await prepareFile(result.data, result.index, input.accept);
        files.push(prepared.file);
        if (prepared.normalized) normalized += 1;
      } catch (error) {
        throw new Error(
          `Image ${result.index + 1} could not be prepared for Ayshei: ${error.message}`
        );
      }
    }
    const count = ordered ? images.length : files.length;
    if (count < 3) {
      throw new Error(`Only ${count} images could be downloaded; Ayshei needs at least 3.`);
    }
    if (!input.multiple && count > 1) {
      throw new Error("The current Ayshei upload control does not accept multiple images.");
    }
    const notifySelected = () => {
      if (!uploadId) return;
      chrome.runtime
        .sendMessage({
          count,
          type: "luna.imageScraper.selected",
          uploadId
        })
        .catch(() => {});
    };
    let accepted;
    if (ordered) {
      const result = await uploadInOrder(
        images,
        input.accept,
        notifySelected,
        batchAfterMain,
        async () => {
          if (!uploadId) return;
          // Unlike "selected", this signal requires Ayshei's saved cover receipt.
          // Await delivery of the signal, not the field work it starts in Luna.
          await chrome.runtime
            .sendMessage({
              type: "luna.imageScraper.mainRetained",
              uploadId,
              count
            })
            .catch(() => {});
        }
      );
      accepted = result.accepted;
      normalized = result.normalized;
    } else {
      assignFiles(input, files);
      notifySelected();
    }
    const retention = ordered ? await waitForRetention(count, 8, 4) : await waitForRetention(count);
    if (ordered) {
      const state = orderedState();
      if (
        state.sources.length !== count ||
        (batchAfterMain ? accepted.slice(0, 1) : accepted).some(
          (source, index) => state.saved[index] !== source
        )
      ) {
        throw new Error(
          "Ayshei did not retain the saved photo order. Check the gallery before retrying."
        );
      }
    }
    if (!retention.retained) {
      const observed = retention.previewCount;
      throw new Error(
        `Ayshei ${retention.disappeared ? "removed the temporary image previews" : `did not keep all ${count} images in its gallery${observed ? ` (only ${observed} remained)` : ""}`}. Luna kept the reviewed images. Check Ayshei's Network panel for a failed image upload before retrying.`
      );
    }
    return {
      imported: count,
      normalized,
      retained: true,
      retainedCount: ordered ? accepted.length : retention.previewCount,
      mainImage: ordered ? accepted[0] : "",
      skipped
    };
  };

  const verify = async (expectedCount, expectedMain = "") => {
    const count = Number(expectedCount);
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error("Ayshei image verification needs a valid image count.");
    }
    const retention = await waitForRetention(count, 6, 4);
    if (!retention.retained) {
      const observed = retention.previewCount;
      throw new Error(
        `Ayshei no longer shows the expected ${count} images${observed ? ` (only ${observed} remained)` : ""}.`
      );
    }
    if (expectedMain && orderedState().saved[0] !== expectedMain) {
      throw new Error("Ayshei’s main image changed. Review the first photo before continuing.");
    }
    return {
      retained: true,
      retainedCount: retention.previewCount
    };
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      !["luna.imageScraper.upload.v2", "luna.imageScraper.verify.v2"].includes(message?.type) ||
      sender?.id !== chrome.runtime.id
    ) {
      return undefined;
    }
    const operation =
      message.type === "luna.imageScraper.verify.v2"
        ? verify(message.expectedCount, message.expectedMain)
        : upload(
            Array.isArray(message.images) ? message.images : [],
            message.uploadId,
            message.sourceUrl
          );
    operation
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ detail: error.message, ok: false }));
    return true;
  });
})();
