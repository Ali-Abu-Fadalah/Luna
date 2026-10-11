(() => {
  if (globalThis.__lunaImageScraperFillInstalled) return;
  globalThis.__lunaImageScraperFillInstalled = true;

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

  const downloadImages = async (images) => {
    return Promise.all(
      images.map(async (image, index) => {
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
      })
    );
  };

  const findImageInput = () => {
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
            (input.disabled ? -100 : 0)
        };
      })
      .filter(({ input }) => !input.disabled)
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

  const upload = async (images, uploadId) => {
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
    const downloaded = await downloadImages(images);
    const files = [];
    let normalized = 0;
    let skipped = 0;
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
    if (files.length < 3) {
      throw new Error(`Only ${files.length} images could be downloaded; Ayshei needs at least 3.`);
    }
    if (!input.multiple && files.length > 1) {
      throw new Error("The current Ayshei upload control does not accept multiple images.");
    }
    assignFiles(input, files);
    if (uploadId) {
      chrome.runtime
        .sendMessage({
          count: files.length,
          type: "luna.imageScraper.selected",
          uploadId
        })
        .catch(() => {});
    }
    const retention = await waitForRetention(files.length);
    if (!retention.retained) {
      const observed = retention.previewCount;
      throw new Error(
        `Ayshei ${retention.disappeared ? "removed the temporary image previews" : `did not keep all ${files.length} images in its gallery${observed ? ` (only ${observed} remained)` : ""}`}. Luna kept the reviewed images. Check Ayshei's Network panel for a failed image upload before retrying.`
      );
    }
    return {
      imported: files.length,
      normalized,
      retained: true,
      retainedCount: retention.previewCount,
      skipped
    };
  };

  const verify = async (expectedCount) => {
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
    return {
      retained: true,
      retainedCount: retention.previewCount
    };
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      !["luna.imageScraper.upload", "luna.imageScraper.verify"].includes(message?.type) ||
      sender?.id !== chrome.runtime.id
    ) {
      return undefined;
    }
    const operation =
      message.type === "luna.imageScraper.verify"
        ? verify(message.expectedCount)
        : upload(Array.isArray(message.images) ? message.images : [], message.uploadId);
    operation
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ detail: error.message, ok: false }));
    return true;
  });
})();
