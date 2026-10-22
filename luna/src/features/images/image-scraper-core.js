globalThis.LunaImageScraperCore = (() => {
  const MIN_IMAGES = 3;
  const MAX_IMAGES = 20;

  const cleanText = (value) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");

  const fullSizeImageUrl = (value, baseUrl = value) => {
    try {
      const url = new URL(cleanText(value), baseUrl);
      if (!["http:", "https:"].includes(url.protocol)) return "";
      if (url.hostname === "content.deal-drive.com") {
        url.pathname = url.pathname.replace(
          /(\/thumbs\/[a-f0-9]{32,}\/)(?:crop|fit)-[^/]+\.(?:avif|jpe?g|png|webp)$/i,
          "$1orig.webp"
        );
      }
      if (/\/wp-content\/uploads\//i.test(url.pathname)) {
        url.pathname = url.pathname.replace(/-\d+x\d+(?=\.(?:avif|jpe?g|png|webp)$)/i, "");
      }
      return url.href;
    } catch (error) {
      return "";
    }
  };

  const canonicalImageKey = (value, baseUrl = value) => {
    try {
      const url = new URL(fullSizeImageUrl(value, baseUrl));
      url.hash = "";
      ["auto", "fit", "format", "h", "height", "quality", "q", "resize", "w", "width"].forEach(
        (parameter) => url.searchParams.delete(parameter)
      );
      url.searchParams.sort();
      return url.href;
    } catch (error) {
      return "";
    }
  };

  const prepareImages = (images, baseUrl, maxImages = MAX_IMAGES) => {
    const seen = new Set();
    const prepared = [];
    const safeLimit = Math.max(1, Math.min(Number(maxImages) || MAX_IMAGES, MAX_IMAGES));

    (Array.isArray(images) ? images : []).forEach((image) => {
      const source = typeof image === "string" ? image : image?.url || image?.src || "";
      const uploadUrl = fullSizeImageUrl(source, baseUrl);
      const key = canonicalImageKey(uploadUrl, baseUrl);
      if (!key || seen.has(key) || prepared.length >= safeLimit) return;
      seen.add(key);
      prepared.push({
        alt: cleanText(typeof image === "object" ? image?.alt : ""),
        id:
          cleanText(typeof image === "object" ? image?.id : "") ||
          `car-image-${prepared.length + 1}`,
        url: uploadUrl
      });
    });

    return prepared;
  };

  const sanitizeCapture = (capture, maxImages = MAX_IMAGES) => {
    const sourceUrl = cleanText(capture?.sourceUrl);
    return {
      images: prepareImages(capture?.images, sourceUrl, maxImages),
      sourceTitle: cleanText(capture?.sourceTitle),
      sourceUrl
    };
  };

  const moveImage = (images, imageId, targetIndex) => {
    const ordered = Array.isArray(images) ? [...images] : [];
    const currentIndex = ordered.findIndex((image) => image.id === imageId);
    if (currentIndex < 0 || !ordered.length) return ordered;
    const [image] = ordered.splice(currentIndex, 1);
    const safeTarget = Math.max(0, Math.min(Number(targetIndex) || 0, ordered.length));
    ordered.splice(safeTarget, 0, image);
    return ordered;
  };

  const moveBefore = (images, imageId, targetId) => {
    const targetIndex = (Array.isArray(images) ? images : []).findIndex(
      (image) => image.id === targetId
    );
    if (targetIndex < 0) return Array.isArray(images) ? [...images] : [];
    const currentIndex = images.findIndex((image) => image.id === imageId);
    const adjustedTarget =
      currentIndex >= 0 && currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
    return moveImage(images, imageId, adjustedTarget);
  };

  const removeImage = (images, imageId) =>
    (Array.isArray(images) ? images : []).filter((image) => image.id !== imageId);

  const validate = (draft) => {
    const imageCount = Array.isArray(draft?.images) ? draft.images.length : 0;
    return {
      imageCount,
      isReady: imageCount >= MIN_IMAGES,
      message:
        imageCount >= MIN_IMAGES
          ? `${imageCount} car images ready`
          : `${imageCount}/${MIN_IMAGES} images — keep at least ${MIN_IMAGES}`
    };
  };

  const isAysheiPlaceAdTab = (tab) => {
    if (!Number.isInteger(tab?.id)) return false;
    try {
      const url = new URL(tab.url);
      return (
        url.origin === "https://marketplace.example.invalid" &&
        url.pathname.startsWith("/place-ad/") &&
        (!url.searchParams.has("step") || url.searchParams.get("step") === "2")
      );
    } catch {
      return false;
    }
  };

  const selectAysheiTargetTab = (activeTab, openTabs) => {
    if (isAysheiPlaceAdTab(activeTab)) {
      return activeTab;
    }

    const candidates = (Array.isArray(openTabs) ? openTabs : []).filter(isAysheiPlaceAdTab);

    if (!candidates.length) {
      throw new Error(
        "Open one Ayshei place-ad image step before importing. Luna will keep the vendor tab active."
      );
    }

    const sameWindow = Number.isInteger(activeTab?.windowId)
      ? candidates.filter((tab) => tab.windowId === activeTab.windowId)
      : [];
    const eligible = sameWindow.length ? sameWindow : candidates;

    if (eligible.length === 1) {
      return eligible[0];
    }

    if (
      sameWindow.length > 1 &&
      Number.isInteger(activeTab?.index) &&
      sameWindow.every((tab) => Number.isInteger(tab.index))
    ) {
      const ordered = sameWindow
        .map((tab) => ({
          distance: Math.abs(tab.index - activeTab.index),
          tab
        }))
        .sort((left, right) => left.distance - right.distance);

      if (ordered[0].distance < ordered[1].distance) {
        return ordered[0].tab;
      }
    }

    throw new Error(
      "More than one Ayshei place-ad tab could be the target. Keep only the correct draft open, or place it uniquely closest to the vendor tab."
    );
  };

  return Object.freeze({
    MAX_IMAGES,
    MIN_IMAGES,
    canonicalImageKey,
    cleanText,
    fullSizeImageUrl,
    moveBefore,
    moveImage,
    prepareImages,
    removeImage,
    sanitizeCapture,
    selectAysheiTargetTab,
    validate
  });
})();
