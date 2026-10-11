globalThis.LunaScraperCore = (() => {
  const MAX_ITEMS = 250;
  const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$/;

  const cleanText = (value) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");

  const normalizeTitle = (value) => cleanText(value).toLowerCase();
  const normalizePrice = (value) => cleanText(value).toLowerCase();

  const normalizeUrl = (value, baseUrl) => {
    try {
      const url = new URL(cleanText(value), baseUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        return "";
      }

      const hashRoute = /^#(?:!\/|\/)/.test(url.hash) ? url.hash : "";
      url.hash = hashRoute;
      [
        "fbclid",
        "gclid",
        "mc_cid",
        "mc_eid",
        "ref",
        "return_filters",
        "return_url",
        "source",
        "utm_campaign",
        "utm_content",
        "utm_medium",
        "utm_source",
        "utm_term"
      ].forEach((parameter) => url.searchParams.delete(parameter));
      url.searchParams.sort();

      return url.href;
    } catch (error) {
      return "";
    }
  };

  const validateEndpoint = (value) => {
    const cleaned = cleanText(value);
    if (!cleaned) {
      return "";
    }

    let url;
    try {
      url = new URL(cleaned);
    } catch (error) {
      throw new Error("Enter a complete Google Apps Script /exec URL.");
    }

    const validHost = url.protocol === "https:" && url.hostname === "script.google.com";
    const validPath =
      /^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) ||
      /^\/a\/macros\/[^/]+\/s\/[^/]+\/exec$/.test(url.pathname);

    if (!validHost || !validPath || url.search || url.hash) {
      throw new Error("Use only the private Luna Apps Script /exec URL.");
    }

    return url.href;
  };

  const sanitizeItem = (item, baseUrl) => ({
    id: cleanText(item?.id),
    price: cleanText(item?.price),
    title: cleanText(item?.title),
    url: normalizeUrl(item?.url, baseUrl)
  });

  const sanitizeCapture = (capture) => {
    const baseUrl = normalizeUrl(capture?.pageUrl, capture?.pageUrl);
    const accepted = [];
    const unlisted = [];
    const excluded = [];

    const addItem = (collection, rawItem, extra = {}) => {
      const item = { ...sanitizeItem(rawItem, baseUrl), ...extra };
      if (!item.url) {
        excluded.push({ ...item, reason: "Invalid URL" });
        return;
      }
      collection.push(item);
    };

    (Array.isArray(capture?.accepted) ? capture.accepted : [])
      .slice(0, MAX_ITEMS + 1)
      .forEach((item) => {
        const sanitized = sanitizeItem(item, baseUrl);
        if (!sanitized.title) {
          excluded.push({
            ...sanitized,
            reason: "Missing title"
          });
          return;
        }
        addItem(accepted, sanitized);
      });

    (Array.isArray(capture?.unlisted) ? capture.unlisted : [])
      .slice(0, MAX_ITEMS)
      .forEach((item) => {
        const reason = ["Sold", "POR", "Duplicate"].includes(item?.reason) ? item.reason : "POR";
        addItem(unlisted, item, { reason });
      });

    (Array.isArray(capture?.excluded) ? capture.excluded : [])
      .slice(0, MAX_ITEMS)
      .forEach((item) => {
        excluded.push({
          ...sanitizeItem(item, baseUrl),
          reason: cleanText(item?.reason) || "Suspicious result"
        });
      });

    return {
      accepted,
      detected: Number(capture?.detected) || accepted.length + unlisted.length + excluded.length,
      excluded,
      genericWarning: capture?.mode === "generic",
      mode: capture?.mode === "generic" ? "generic" : "adapter",
      pageTitle: cleanText(capture?.pageTitle),
      pageUrl: baseUrl,
      site: cleanText(capture?.site) || "Unsupported website",
      unlisted
    };
  };

  const mergeCaptures = (captures, { filterDuplicates = true } = {}) => {
    const merged = {
      accepted: [],
      detected: 0,
      excluded: [],
      mode: "generic",
      pageTitle: "",
      pageUrl: "",
      site: "Unsupported website",
      unlisted: []
    };
    const observedOccurrences = new Map();
    const acceptedListingKeys = new Set();
    (Array.isArray(captures) ? captures : []).forEach((rawCapture, batchIndex) => {
      const capture = sanitizeCapture(rawCapture);
      const pageKey = capture.pageUrl || `capture-${batchIndex + 1}`;
      const snapshotOccurrences = new Map();
      ["accepted", "unlisted", "excluded"].forEach((kind) =>
        capture[kind].forEach((item) => {
          const signature = [pageKey, kind, item.url, item.reason].join("\u0000");
          const occurrence = (snapshotOccurrences.get(signature) || 0) + 1;
          snapshotOccurrences.set(signature, occurrence);
          if (occurrence <= (observedOccurrences.get(signature) || 0)) return;
          observedOccurrences.set(signature, occurrence);
          const mergedItem = { ...item, batch: batchIndex + 1 };
          if (kind === "accepted" && filterDuplicates) {
            const listingKey = [normalizeTitle(item.title), normalizePrice(item.price)].join(
              "\u0000"
            );
            if (acceptedListingKeys.has(listingKey)) {
              merged.unlisted.push({ ...mergedItem, reason: "Duplicate" });
              return;
            }
            acceptedListingKeys.add(listingKey);
          }
          merged[kind].push(mergedItem);
        })
      );
      if (batchIndex === 0) {
        merged.mode = capture.mode;
        merged.pageTitle = capture.pageTitle;
        merged.pageUrl = capture.pageUrl;
        merged.site = capture.site;
      }
    });
    merged.limitExceeded = merged.accepted.length > MAX_ITEMS;
    merged.accepted = merged.accepted.map((item, index) => ({
      ...item,
      id: `listing-${index + 1}`
    }));
    merged.detected = merged.accepted.length + merged.unlisted.length + merged.excluded.length;
    merged.genericWarning = merged.mode === "generic";
    return merged;
  };

  const buildUnlistedTsv = (items) =>
    (Array.isArray(items) ? items : [])
      .map((item) => {
        const reason = ["Sold", "POR", "Duplicate"].includes(item?.reason) ? item.reason : "POR";
        return `${cleanText(item.url)}\t${reason}`;
      })
      .join("\n");

  const buildPayload = (items) =>
    (Array.isArray(items) ? items : []).map((item) => ({
      title: cleanText(item.title),
      url: normalizeUrl(item.url, item.url),
      price: cleanText(item.price)
    }));

  const validateClientRequestId = (value) => {
    const requestId = cleanText(value);
    if (!CLIENT_REQUEST_ID_PATTERN.test(requestId)) {
      throw new Error("Luna could not create a safe Raw Data request ID.");
    }
    return requestId;
  };

  const buildWriteFingerprint = (items, addSeparator = false) =>
    JSON.stringify({
      addSeparator: addSeparator === true,
      items: buildPayload(items)
    });

  const buildWriteRequest = (items, addSeparator = false, clientRequestId = "") => {
    const payload = buildPayload(items);
    if (payload.length > MAX_ITEMS) {
      throw new Error(`Send no more than ${MAX_ITEMS} listings at once.`);
    }
    return {
      addSeparator: addSeparator === true,
      clientRequestId: validateClientRequestId(clientRequestId),
      items: payload
    };
  };

  const validateWriterResponse = (
    responseText,
    expectedCount,
    expectedSeparator = false,
    expectedMissingPrices = 0,
    expectedRequestId = ""
  ) => {
    let payload;
    try {
      payload = JSON.parse(String(responseText ?? ""));
    } catch (error) {
      throw new Error("Raw Data returned an unreadable response.");
    }

    if (
      payload?.ok !== true ||
      !Number.isInteger(payload.received) ||
      !Number.isInteger(payload.inserted) ||
      !Number.isInteger(payload.missingPrices)
    ) {
      throw new Error(cleanText(payload?.error) || "Raw Data did not confirm success.");
    }

    if (payload.received !== expectedCount || payload.inserted !== expectedCount) {
      throw new Error(`Raw Data confirmed ${payload.inserted} of ${expectedCount} items.`);
    }

    if (expectedSeparator === true && payload.separatorAdded !== true) {
      throw new Error("Raw Data did not confirm the requested separator row.");
    }

    if (payload.missingPrices !== expectedMissingPrices) {
      throw new Error(
        `Raw Data confirmed ${payload.missingPrices} of ${expectedMissingPrices} missing prices.`
      );
    }

    const requestId = cleanText(payload.requestId);
    const legacyConfirmation = Boolean(expectedRequestId) && !requestId;
    if (expectedRequestId && requestId && requestId !== expectedRequestId) {
      throw new Error("Raw Data confirmed a different request ID.");
    }
    if (requestId && !CLIENT_REQUEST_ID_PATTERN.test(requestId)) {
      throw new Error("Raw Data returned an invalid request ID.");
    }

    const appendedRange = cleanText(payload.appendedRange);
    const appendedRangeMatch = /^A(\d+):D(\d+)$/.exec(appendedRange);
    if (
      requestId &&
      (!appendedRangeMatch ||
        Number(appendedRangeMatch[1]) < 2 ||
        Number(appendedRangeMatch[2]) - Number(appendedRangeMatch[1]) + 1 !== expectedCount)
    ) {
      throw new Error("Raw Data did not confirm the appended A:D row range.");
    }

    return {
      appendedRange,
      duplicateRequest: payload.duplicateRequest === true,
      formattingCompleted:
        typeof payload.formattingCompleted === "boolean" ? payload.formattingCompleted : true,
      idempotencyApplied: legacyConfirmation ? false : payload.idempotencyApplied === true,
      inserted: payload.inserted,
      legacyConfirmation,
      missingPrices: payload.missingPrices,
      outcome: cleanText(payload.outcome) || "legacy_completed",
      received: payload.received,
      requestId: requestId || expectedRequestId,
      separatorAdded: payload.separatorAdded === true
    };
  };

  return Object.freeze({
    MAX_ITEMS,
    buildPayload,
    buildWriteFingerprint,
    buildWriteRequest,
    buildUnlistedTsv,
    cleanText,
    mergeCaptures,
    normalizePrice,
    normalizeTitle,
    normalizeUrl,
    sanitizeCapture,
    validateClientRequestId,
    validateEndpoint,
    validateWriterResponse
  });
})();
