globalThis.LunaAysheiCore = (() => {
  const isOtherLabel = (value) =>
    String(value || "")
      .trim()
      .toLocaleLowerCase("en") === "other";

  const compareLabels = (left, right) => {
    const leftIsOther = isOtherLabel(left);
    const rightIsOther = isOtherLabel(right);
    if (leftIsOther !== rightIsOther) {
      return leftIsOther ? 1 : -1;
    }
    return left.localeCompare(right, "en", {
      numeric: true,
      sensitivity: "base"
    });
  };

  const validateCatalogPayload = (payload) => {
    if (!payload || !Array.isArray(payload.car)) {
      throw new Error("Ayshei returned an invalid catalog response.");
    }

    return payload;
  };

  const validateKeyword = (value) => {
    const keyword = String(value || "").trim();

    if (keyword.length < 2 || keyword.length > 80) {
      throw new Error("Search with 2 to 80 characters.");
    }

    return keyword;
  };

  const validateCode = (value) => {
    const code = Number(value);

    if (!Number.isInteger(code) || code < 0 || code > 100000000) {
      throw new Error("Ayshei returned an invalid vehicle code.");
    }

    return code;
  };

  const validateYear = (value) => {
    const year = String(value || "").trim();
    if (!/^\d{4}$/.test(year) || Number(year) < 1950 || Number(year) > 2100) {
      throw new Error("Enter a valid Ayshei vehicle year.");
    }
    return year;
  };

  const validateYearCode = (value) => {
    const yearCode = validateCode(value);
    if (yearCode === 0) {
      throw new Error("Ayshei returned an invalid year code.");
    }
    return yearCode;
  };

  const uniqueSorted = (items, keyForItem) => {
    const seen = new Set();

    return items
      .filter((item) => {
        const key = keyForItem(item);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .sort((left, right) => compareLabels(left.label, right.label));
  };

  const extractModels = (payload) =>
    uniqueSorted(
      validateCatalogPayload(payload)
        .car.filter(
          (item) =>
            typeof item?.make === "string" &&
            item.make.trim() &&
            typeof item?.model === "string" &&
            item.model.trim()
        )
        .map((item) => ({
          label: `${item.make} ${item.model}`,
          make: item.make,
          makeCode: validateCode(item.makeCode),
          model: item.model,
          modelCode: validateCode(item.modelCode)
        })),
      (item) => `${item.makeCode}:${item.modelCode}`
    );

  const extractTrims = (payload) =>
    uniqueSorted(
      validateCatalogPayload(payload)
        .car.filter((item) => typeof item?.trim === "string" && item.trim.trim())
        .map((item) => ({
          label: item.trim,
          trimCode: validateCode(item.trimCode)
        })),
      (item) => `${item.trimCode}:${item.label}`
    );

  const extractYearCode = (payload, expectedYear) => {
    const year = validateYear(expectedYear);
    const match = validateCatalogPayload(payload).car.find(
      (item) => String(item?.year || "").trim() === year
    );
    if (!match) {
      throw new Error(`Ayshei does not list vehicle year ${year}.`);
    }
    return validateYearCode(match.yearCode);
  };

  const formatUaeTime = (isoValue) => {
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) {
      return "Unknown time";
    }

    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Dubai"
    }).format(date);
  };

  return Object.freeze({
    extractModels,
    extractTrims,
    extractYearCode,
    formatUaeTime,
    validateCatalogPayload,
    validateCode,
    validateKeyword,
    validateYear,
    validateYearCode
  });
})();
