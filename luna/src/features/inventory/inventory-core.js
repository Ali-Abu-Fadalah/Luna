globalThis.LunaInventoryCore = (() => {
  const MAX_PAGES = 100;
  const MAX_NAMES_PER_PAGE = 2000;

  const cleanName = (value) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");

  const normalizeName = (value) => cleanName(value).toLocaleLowerCase("en");

  const makeEmptyState = () => ({
    accountLabel: "",
    pages: [],
    version: 2
  });

  const makeEmptySheetData = () => ({
    importedAt: "",
    names: [],
    version: 1
  });

  const sanitizeSheetData = (value) => {
    if (value?.version !== 1 || !Array.isArray(value.names)) {
      return makeEmptySheetData();
    }

    return {
      importedAt: String(value.importedAt || ""),
      names: value.names.slice(0, MAX_NAMES_PER_PAGE).map(cleanName).filter(Boolean),
      version: 1
    };
  };

  const sanitizeState = (value) => {
    if (![1, 2].includes(value?.version) || !Array.isArray(value.pages)) {
      return makeEmptyState();
    }

    return {
      accountLabel: cleanName(value.accountLabel),
      pages: value.pages
        .slice(0, MAX_PAGES)
        .map((page) => ({
          capturedAt: String(page.capturedAt || ""),
          key: cleanName(page.key),
          label: cleanName(page.label) || "Captured page",
          expectedCount: Number.isSafeInteger(page.expectedCount) ? page.expectedCount : null,
          names: Array.isArray(page.names)
            ? page.names.slice(0, MAX_NAMES_PER_PAGE).map(cleanName).filter(Boolean)
            : [],
          source: page.source === "paste" ? "paste" : "automatic",
          staleAfter: String(page.staleAfter || ""),
          url: String(page.url || "")
        }))
        .filter((page) => page.key && page.names.length),
      version: 2
    };
  };

  const addCapturedPage = (currentState, payload) => {
    const state = sanitizeState(currentState);
    const key = cleanName(payload?.key);
    const label = cleanName(payload?.label);
    const accountLabel = cleanName(payload?.accountLabel);
    const rawNames = Array.isArray(payload?.names) ? payload.names : [];
    if (rawNames.length > MAX_NAMES_PER_PAGE) {
      throw new Error(
        "This page has too many names to capture safely. Narrow the inventory filters, then capture again."
      );
    }
    const names = rawNames.map(cleanName).filter(Boolean);

    if (!key || !names.length) {
      throw new Error("No inventory Product Name values were found.");
    }

    if (
      state.accountLabel &&
      accountLabel &&
      normalizeName(state.accountLabel) !== normalizeName(accountLabel)
    ) {
      throw new Error(
        `This capture appears to belong to ${accountLabel}. Clear the captured inventory before switching from ${state.accountLabel}.`
      );
    }

    const page = {
      capturedAt: String(payload.capturedAt || new Date().toISOString()),
      expectedCount: Number.isSafeInteger(payload.expectedCount) ? payload.expectedCount : null,
      key,
      label: label || "Captured page",
      names,
      source: payload.source === "paste" ? "paste" : "automatic",
      staleAfter: String(payload.staleAfter || ""),
      url: String(payload.url || "")
    };
    const existingIndex = state.pages.findIndex((savedPage) => savedPage.key === key);

    if (existingIndex >= 0) {
      state.pages[existingIndex] = page;
    } else {
      if (state.pages.length >= MAX_PAGES) {
        throw new Error("Clear old inventory captures before adding more pages.");
      }
      state.pages.push(page);
    }

    if (!state.accountLabel && accountLabel) {
      state.accountLabel = accountLabel;
    }

    return state;
  };

  const ignoredPasteLines = new Set(
    [
      "actions",
      "all items",
      "category",
      "drafts",
      "id",
      "info requested",
      "inventory",
      "pending approval",
      "price",
      "price (aed)",
      "product name",
      "published",
      "rejected",
      "sort: last updated",
      "status",
      "unpublished",
      "updated at"
    ].map(normalizeName)
  );

  const isPlausiblePastedName = (value) => {
    const normalized = normalizeName(value);
    return normalized && !ignoredPasteLines.has(normalized) && !/^#?\d{6,}$/.test(normalized);
  };

  const parsePastedText = (text) => {
    const lines = String(text ?? "")
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.trim());
    const headerIndex = lines.findIndex((line) =>
      line.split("\t").some((cell) => normalizeName(cell) === "product name")
    );

    if (headerIndex >= 0) {
      const headers = lines[headerIndex].split("\t").map(normalizeName);
      const productIndex = headers.indexOf("product name");
      const names = lines
        .slice(headerIndex + 1)
        .map((line) => cleanName(line.split("\t")[productIndex]))
        .filter(isPlausiblePastedName);

      return { mode: "table", names };
    }

    const names = lines.map((line) => cleanName(line)).filter(isPlausiblePastedName);

    return { mode: "lines", names };
  };

  const fingerprintNames = (names) => {
    let hash = 2166136261;

    names.map(normalizeName).forEach((name) => {
      for (const character of `${name}\n`) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 16777619);
      }
    });

    return (hash >>> 0).toString(16).padStart(8, "0");
  };

  const makePastePayload = (text, pageNumber) => {
    const parsed = parsePastedText(text);

    if (!parsed.names.length) {
      throw new Error("Paste a copied Product Name table or one inventory name per line.");
    }

    return {
      capturedAt: new Date().toISOString(),
      key: `paste:${fingerprintNames(parsed.names)}`,
      label: `Pasted page ${pageNumber}`,
      names: parsed.names,
      source: "paste",
      url: ""
    };
  };

  const ignoredSheetNames = new Set(
    ["ad name", "advertisement", "name", "product name"].map(normalizeName)
  );

  const parseAdNamesText = (text) => {
    const lines = String(text ?? "")
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.trim());

    if (lines.some((line) => line.includes("\t"))) {
      const headers = lines[0].split("\t").map(normalizeName);
      const productIndex = headers.findIndex((header) =>
        ["advertisement", "advertisement name", "ad name", "product name", "name"].includes(header)
      );
      if (productIndex < 0) {
        throw new Error(
          "This looks like multiple Sheet columns. Copy column D (advertisement name) only, or include an Advertisement Name header."
        );
      }
      const names = lines
        .slice(1)
        .map((line) => cleanName(line.split("\t")[productIndex]))
        .filter(Boolean);
      if (!names.length) {
        throw new Error(
          "Copy only the advertisement-name column. No advertisement names were found below that header."
        );
      }
      return {
        importedAt: new Date().toISOString(),
        names: names.slice(0, MAX_NAMES_PER_PAGE),
        version: 1
      };
    }

    const names = lines
      .map(cleanName)
      .filter((name) => name && !ignoredSheetNames.has(normalizeName(name)));

    if (!names.length) {
      throw new Error("Paste one advertisement name per line.");
    }

    return {
      importedAt: new Date().toISOString(),
      names: names.slice(0, MAX_NAMES_PER_PAGE),
      version: 1
    };
  };

  const sheetDataToQueueAds = (value) =>
    sanitizeSheetData(value).names.map((name, index) => ({
      id: index + 1,
      source: { adName: name }
    }));

  const getInventoryEntries = (state) =>
    sanitizeState(state).pages.flatMap((page) =>
      page.names.map((name, rowIndex) => ({
        name,
        pageKey: page.key,
        pageLabel: page.label,
        rowIndex
      }))
    );

  const tokenSet = (value) =>
    new Set(
      normalizeName(value)
        .split(" ")
        .filter((token) => token.length > 1)
    );

  const bigrams = (value) => {
    const compact = normalizeName(value).replace(/\s/g, "");
    const values = [];

    for (let index = 0; index < compact.length - 1; index += 1) {
      values.push(compact.slice(index, index + 2));
    }

    return values;
  };

  const diceScore = (leftValues, rightValues) => {
    if (!leftValues.length || !rightValues.length) {
      return 0;
    }

    const remaining = [...rightValues];
    let intersections = 0;

    leftValues.forEach((value) => {
      const matchIndex = remaining.indexOf(value);
      if (matchIndex >= 0) {
        intersections += 1;
        remaining.splice(matchIndex, 1);
      }
    });

    return (2 * intersections) / (leftValues.length + rightValues.length);
  };

  const similarityScore = (left, right) => {
    const leftTokens = [...tokenSet(left)];
    const rightTokens = [...tokenSet(right)];
    const tokenScore = diceScore(leftTokens, rightTokens);
    const characterScore = diceScore(bigrams(left), bigrams(right));

    return Math.max(tokenScore, characterScore);
  };

  const compareInventory = (queueAds, state) => {
    const queueEntries = (Array.isArray(queueAds) ? queueAds : [])
      .map((ad, index) => ({
        adNumber: Number(ad?.id) || index + 1,
        key: normalizeName(ad?.source?.adName),
        name: cleanName(ad?.source?.adName)
      }))
      .filter((entry) => entry.key);
    const inventoryGroups = new Map();
    const sheetGroups = new Map();

    queueEntries.forEach((entry) => {
      if (!sheetGroups.has(entry.key)) {
        sheetGroups.set(entry.key, { key: entry.key, name: entry.name, occurrences: [] });
      }
      sheetGroups.get(entry.key).occurrences.push(entry);
    });

    getInventoryEntries(state).forEach((entry) => {
      const key = normalizeName(entry.name);
      if (!key) {
        return;
      }

      if (!inventoryGroups.has(key)) {
        inventoryGroups.set(key, {
          count: 0,
          key,
          name: entry.name,
          occurrences: []
        });
      }

      const group = inventoryGroups.get(key);
      group.count += 1;
      group.occurrences.push(entry);
    });

    const matched = [];
    const missing = [];
    const repeated = [];
    const consumedInventoryCounts = new Map();
    sheetGroups.forEach((sheet, key) => {
      const inventory = inventoryGroups.get(key) || { name: sheet.name, count: 0, occurrences: [] };
      const matchedCount = Math.min(sheet.occurrences.length, inventory.count);
      const missingOccurrences = sheet.occurrences.slice(matchedCount);
      consumedInventoryCounts.set(key, matchedCount);
      for (let index = 0; index < matchedCount; index += 1) {
        matched.push({ ...sheet.occurrences[index], inventory: inventory.occurrences[index] });
      }
      missing.push(...missingOccurrences);
      if (sheet.occurrences.length > 1 || inventory.count > 1) {
        repeated.push({
          key,
          name: sheet.name || inventory.name,
          occurrences: inventory.occurrences,
          sheetCount: sheet.occurrences.length,
          inventoryCount: inventory.count,
          matchedCount,
          missingCount: missingOccurrences.length
        });
      }
    });
    const unmatchedInventory = [...inventoryGroups.values()].flatMap((inventory) =>
      inventory.occurrences.slice(consumedInventoryCounts.get(inventory.key) || 0)
    );
    const suggestedInventoryRows = new Set();
    const possible = missing
      .map((queueEntry) => {
        let best = null;

        unmatchedInventory.forEach((inventoryEntry) => {
          const occurrenceKey = `${inventoryEntry.pageKey}:${inventoryEntry.rowIndex}`;
          if (suggestedInventoryRows.has(occurrenceKey)) {
            return;
          }
          const score = similarityScore(queueEntry.name, inventoryEntry.name);
          if (!best || score > best.score) {
            best = { inventory: inventoryEntry, queue: queueEntry, score };
          }
        });

        if (best && best.score >= 0.58) {
          suggestedInventoryRows.add(`${best.inventory.pageKey}:${best.inventory.rowIndex}`);
        }
        return best;
      })
      .filter(
        (candidate) =>
          candidate &&
          candidate.score >= 0.58 &&
          normalizeName(candidate.queue.name) !== normalizeName(candidate.inventory.name)
      )
      .map((candidate) => ({
        inventoryName: candidate.inventory.name,
        queueAdNumber: candidate.queue.adNumber,
        queueName: candidate.queue.name,
        score: Math.round(candidate.score * 100)
      }));

    const byName = (left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" });

    return {
      matched,
      missing,
      possible,
      repeated: repeated.sort(byName),
      totals: {
        checked: queueEntries.length,
        matched: matched.length,
        missing: missing.length,
        possible: possible.length,
        repeated: repeated.length,
        repeatedSheetOccurrences: repeated.reduce((total, entry) => total + entry.sheetCount, 0)
      }
    };
  };

  return Object.freeze({
    addCapturedPage,
    cleanName,
    compareInventory,
    getInventoryEntries,
    makeEmptySheetData,
    makeEmptyState,
    makePastePayload,
    normalizeName,
    parsePastedText,
    parseAdNamesText,
    sanitizeSheetData,
    sanitizeState,
    sheetDataToQueueAds,
    similarityScore
  });
})();
