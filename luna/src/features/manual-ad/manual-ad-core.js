globalThis.LunaManualAdCore = (() => {
  const cleanText = (value) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");

  const cleanDescription = (value) =>
    String(value ?? "")
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .filter(
        (line) =>
          !/^(?:related posts?|no related posts?|related cars?|no related cars?)\s*[:.\-–—]?$/i.test(
            line.trim()
          )
      )
      .join("\n")
      .replace(
        /(?:\s+(?:related posts?|no related posts?|related cars?|no related cars?)\s*[:.\-–—]?)+\s*$/i,
        ""
      )
      .replace(/\n{3,}/g, "\n\n")
      .replace(
        /^\s*(?:(?:read|show)\s+(?:more|less)|(?:see|show|hide|read)\s+(?:(?:the|this)\s+)?(?:full\s+)?description)\s*$/gim,
        ""
      )
      .replace(
        /\s*\b(?:(?:read|show)\s+(?:more|less)|(?:see|show|hide|read)\s+(?:(?:the|this)\s+)?(?:full\s+)?description)\b\s*$/gim,
        ""
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .replace(/^description\s*[:\-]?\s*\n+/i, "")
      .replace(/^description\s*[:\-]\s*/i, "")
      .trim()
      .slice(0, 8000);

  const normalize = (value) =>
    cleanText(value)
      .toLocaleLowerCase("en")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(?:mercedes benz|mercedez benz|mercedec benz)\b/g, "mercedes")
      .trim();

  const containsExactWords = (text, label) => {
    const source = normalize(text);
    const wanted = normalize(label);
    return Boolean(source && wanted && ` ${source} `.includes(` ${wanted} `));
  };

  const chooseUniqueCatalogMatch = (options, evidence, minimumWords = 1) => {
    const sourceValues = (Array.isArray(evidence) ? evidence : [evidence])
      .map(cleanText)
      .filter(Boolean);
    const matches = (Array.isArray(options) ? options : []).filter((option) => {
      const label = cleanText(option?.label);
      return (
        label &&
        normalize(label) !== "other" &&
        normalize(label).split(" ").length >= minimumWords &&
        sourceValues.some((value) => containsExactWords(value, label))
      );
    });
    if (!matches.length) return null;
    const longestLength = Math.max(...matches.map((option) => normalize(option.label).length));
    const longest = matches.filter((option) => normalize(option.label).length === longestLength);
    const identities = new Set(
      longest.map((option) =>
        [
          normalize(option.label),
          option.makeCode ?? "",
          option.modelCode ?? "",
          option.trimCode ?? ""
        ].join(":")
      )
    );
    return identities.size === 1 ? longest[0] : null;
  };

  const chooseNearestCatalogMatch = (options, evidence) => {
    const sourceTokens = new Set(
      normalize((Array.isArray(evidence) ? evidence : [evidence]).join(" "))
        .split(" ")
        .filter((token) => token.length > 1)
    );
    const ranked = (Array.isArray(options) ? options : [])
      .filter((option) => normalize(option?.label) !== "other")
      .map((option) => {
        const labelTokens = normalize(option.label).split(" ").filter(Boolean);
        const overlap = labelTokens.filter((token) => sourceTokens.has(token)).length;
        return { option, overlap, score: overlap * 100 + normalize(option.label).length };
      })
      .sort((left, right) => right.score - left.score);
    return ranked[0]?.overlap ? ranked[0].option : null;
  };

  const buildCatalogSearchTerms = (capture) => {
    const terms = [];
    const add = (value) => {
      const cleaned = cleanText(value).slice(0, 80);
      const key = normalize(cleaned);
      if (key.length >= 2 && !terms.some((term) => normalize(term) === key)) {
        terms.push(cleaned);
      }
    };
    add(capture?.makeModel);
    (Array.isArray(capture?.specs) ? capture.specs : [])
      .map((item) => cleanText(item).match(/^(?:make|model)\s*:\s*(.+)$/i)?.[1])
      .filter(Boolean)
      .forEach(add);
    return terms.slice(0, 5);
  };

  const parsePrice = (value) => {
    const text = cleanText(value);
    if (
      !text ||
      /\b(?:POR|sold|price\s+(?:on|upon)\s+request|contact\s+(?:us|for\s+price))\b/i.test(text)
    ) {
      return "";
    }
    const normalizedText = text.replace(/,/g, "");
    const currencyMatch = normalizedText.match(
      /(?:AED|DHS?\.?|USD|SAR|\$|د\.?إ)\s*(\d{3,9})(?:\.\d{1,2})?|(\d{3,9})(?:\.\d{1,2})?\s*(?:AED|DHS?\.?|USD|SAR|\$|د\.?إ)/i
    );
    const match = currencyMatch;
    return match ? String(Number(match[1] || match[2])) : "";
  };

  const parseKilometers = (value) => {
    const text = cleanText(value);
    if (!text) return "";
    const match = text.match(/\d[\d\s,.]*/);
    if (!match) return "";
    const kilometers = Number(match[0].replace(/\D/g, ""));
    return Number.isSafeInteger(kilometers) && kilometers >= 0 && kilometers <= 10000000
      ? String(kilometers)
      : "";
  };

  const resolveCategory = (category, kilometers) => {
    const value = normalize(category);
    if (/^(?:export|export only)$/.test(value) || /\b(?:only export|for export only)\b/.test(value))
      return "EXPORT";
    const mileage = parseKilometers(kilometers);
    if (mileage !== "") return Number(mileage) <= 80 ? "NEW" : "USED";
    if (/\bnew\b/.test(value)) return "NEW";
    if (/\bused\b|\bpre owned\b/.test(value)) return "USED";
    return "";
  };

  const normalizeRegionalSpec = (value) => {
    const text = normalize(value);
    if (!text) return "";
    const mappings = [
      ["gcc", "GCC"],
      ["american", "American"],
      ["canadian", "Canadian"],
      ["chinese", "Chinese"],
      ["european", "European"],
      ["japanese", "Japanese"],
      ["korean", "Korean"]
    ];
    const exactGcc = /\bgcc\s+specs?\b/.test(text);
    if (exactGcc) return "GCC";
    const matches = mappings.filter(([needle]) => new RegExp(`\\b${needle}\\b`).test(text));
    if (matches.length === 1) return matches[0][1];
    if (/^(?:other|other specs?|other regional specs?)$/.test(text)) return "Other";
    return "";
  };

  const inferYear = (text) => {
    const years = cleanText(text).match(/\b(?:19|20)\d{2}\b/g) || [];
    const currentYear = new Date().getUTCFullYear() + 2;
    return years.find((year) => Number(year) >= 1900 && Number(year) <= currentYear) || "";
  };

  const inferFuel = (text) => {
    const value = normalize(text);
    if (/\belectric\b|\bev\b/.test(value)) return "Electric";
    if (/\bhybrid\b/.test(value)) return "Hybrid";
    if (/\bdiesel\b/.test(value)) return "Diesel";
    if (/\bpetrol\b|\bgasoline\b/.test(value)) return "Gasoline";
    return "";
  };

  const inferTransmission = (text) => {
    const value = normalize(text);
    if (/\bmanual\b|\bmt\b/.test(value)) return "Manual";
    if (/\bautomatic\b|\bcvt\b|\bdct\b|\bat\b/.test(value)) return "Automatic";
    return "";
  };

  const inferBodyType = (text) => {
    const value = normalize(text);
    const mappings = [
      ["convertible", "Convertible"],
      ["crossover", "SUV"],
      ["hatchback", "Hatchback"],
      ["minivan", "Minivan"],
      ["pickup", "Pickup"],
      ["wagon", "Wagon"],
      ["coupe", "Coupe"],
      ["sedan", "Sedan"],
      ["suv", "SUV"],
      ["van", "Van"]
    ];
    const matches = [
      ...new Set(
        mappings
          .filter(([word]) => new RegExp(`\\b${word}\\b`).test(value))
          .map(([, bodyType]) => bodyType)
      )
    ];
    return matches.length === 1 ? matches[0] : "";
  };

  const inferExteriorColor = (value) => {
    const text = normalize(value).replace(/\bgray\b/g, "grey");
    if (!text) return "";
    const composites = [
      [/\b(?:black matt|matte black)\b/, "Black matt"],
      [/\b(?:white pearl|pearl white)\b/, "White Pearl"],
      [/\bdark green\b/, "Dark Green"],
      [/\blight green\b/, "Light Green"],
      [/\bdark grey\b/, "Dark Grey"]
    ];
    const composite = composites.find(([pattern]) => pattern.test(text));
    if (composite) return composite[1];
    const colors = [
      "Beige",
      "Black",
      "Blueberry",
      "Blue",
      "Brown",
      "Cyan",
      "Grey",
      "Orange",
      "Pink",
      "Purple",
      "Red",
      "Silver",
      "White",
      "Yellow"
    ].filter((color) => new RegExp(`\\b${normalize(color)}\\b`).test(text));
    return colors.length === 1 ? colors[0] : "";
  };

  const descriptionFromSpecs = (specs = []) =>
    (Array.isArray(specs) ? specs : [])
      .map(cleanText)
      .filter(Boolean)
      .filter((value, index, items) => items.indexOf(value) === index)
      .join("\n");

  const specificationValue = (specs, label) =>
    (Array.isArray(specs) ? specs : [])
      .map(cleanText)
      .map((item) => item.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "i"))?.[1] || "")
      .find(Boolean) || "";

  const verifiedSpecificationSummary = (capture = {}) => {
    const year = cleanText(capture.year);
    const makeModel = cleanText(capture.makeModel);
    const bodyType = inferBodyType(capture.bodyType);
    const category = cleanText(capture.category);
    const fuel = inferFuel(capture.fuelType);
    const transmission = inferTransmission(capture.transmission);
    const engine = specificationValue(capture.specs, "Engine");
    const drive = specificationValue(capture.specs, "Drive").toUpperCase();
    const driveLabels = {
      AWD: "all-wheel drive (AWD)",
      FWD: "front-wheel drive (FWD)",
      RWD: "rear-wheel drive (RWD)",
      "4WD": "four-wheel drive (4WD)",
      "4X4": "four-wheel drive (4x4)"
    };
    const identity = [year, makeModel].filter(Boolean).join(" ");
    if (!identity || ![bodyType, fuel, transmission, engine, drive].some(Boolean)) return "";
    const condition = category === "NEW" ? "brand new" : category === "USED" ? "used" : "";
    const conditionAndBody = [condition, bodyType].filter(Boolean).join(" ");
    const subject = [identity, conditionAndBody].filter(Boolean).join(", ");
    const normalizedEngine = cleanText(engine).replace(
      /^(\d+(?:\.\d+)?)\s*(?:l|lit(?:er|re)s?)?$/i,
      "$1L"
    );
    const power = normalizedEngine
      ? `${normalizedEngine}${fuel ? ` ${fuel.toLocaleLowerCase("en")}` : ""} engine`
      : fuel
        ? `${fuel.toLocaleLowerCase("en")} engine`
        : "";
    const drivetrain = driveLabels[drive] || "";
    const details =
      transmission && drivetrain
        ? `Features an ${transmission.toLocaleLowerCase("en")} transmission with ${drivetrain}.`
        : transmission
          ? `Features an ${transmission.toLocaleLowerCase("en")} transmission.`
          : drivetrain
            ? `Features ${drivetrain}.`
            : "";
    return cleanDescription(`${subject}${power ? ` powered by a ${power}` : ""}. ${details}`);
  };

  const polishDescription = (description) => {
    const cleaned = cleanDescription(description);
    const placeholder = cleaned
      .replace(
        /^\s*(?:(?:overview)\s*)?(?:about\s+this\s+vehicle|vehicle\s+overview)\s*[:\-]?\s*/i,
        ""
      )
      .replace(/^(?:seller|vehicle|car)?\s*(?:notes?|comments?|description)\s*[:\-]?\s*/i, "")
      .replace(/[.\-–—\s]+$/g, "")
      .trim();
    return /^(?:n\/?a|na|none|nil|not available|not applicable|not provided|not specified|no (?:description|details|comments?|notes?))$/i.test(
      placeholder
    )
      ? ""
      : cleaned;
  };

  const mergeCaptures = (captures) => {
    const records = (Array.isArray(captures) ? captures : []).filter(
      (capture) => capture && typeof capture === "object"
    );
    if (!records.length) return {};
    const merged = {};
    const mergedEvidence = {};
    const mergedSpecs = [];
    const specKeys = new Set();
    records.forEach((capture) => {
      Object.entries(capture).forEach(([field, value]) => {
        if (["evidence", "specs"].includes(field)) return;
        const usable = Array.isArray(value)
          ? value.length > 0
          : value !== null && value !== undefined && cleanText(value) !== "";
        if (!usable || Object.hasOwn(merged, field)) return;
        merged[field] = value;
        if (capture.evidence?.[field]) mergedEvidence[field] = capture.evidence[field];
      });
      (Array.isArray(capture.specs) ? capture.specs : []).forEach((spec) => {
        const cleaned = cleanText(spec);
        const key = normalize(cleaned);
        if (!cleaned || specKeys.has(key)) return;
        specKeys.add(key);
        mergedSpecs.push(cleaned);
      });
      Object.entries(capture.evidence || {}).forEach(([field, item]) => {
        if (!mergedEvidence[field]) mergedEvidence[field] = item;
      });
    });
    merged.evidence = mergedEvidence;
    merged.specs = mergedSpecs.slice(0, 160);
    if (cleanDescription(merged.description)) delete merged.descriptionSource;
    return merged;
  };

  const sanitizeEvidence = (evidence) => {
    const allowedStates = ["confirmed", "strong", "review", "missing", "conflicting"];
    return Object.fromEntries(
      Object.entries(evidence && typeof evidence === "object" ? evidence : {})
        .map(([field, item]) => [
          field,
          {
            raw: cleanText(item?.raw).slice(0, 1000),
            source: cleanText(item?.source).slice(0, 240),
            state: allowedStates.includes(item?.state) ? item.state : "review"
          }
        ])
        .filter(([, item]) => item.raw || item.source)
    );
  };

  const sanitizeCapture = (capture) => {
    const sourceUrl = cleanText(capture?.sourceUrl);
    const specs = Array.isArray(capture?.specs) ? capture.specs.map(cleanText) : [];
    const specValue = (...labels) => {
      const wanted = new Set(labels.map(normalize));
      for (const line of specs) {
        const match = line.match(/^([^:]+):\s*(.+)$/);
        if (match && wanted.has(normalize(match[1]))) return match[2];
      }
      return "";
    };
    const combinedText = [capture?.description, ...specs].join(" ");
    const bodyType =
      inferBodyType(capture?.bodyType) || inferBodyType(specValue("Body Type", "Body"));

    const allowedColors = [
      "Beige",
      "Black",
      "Black matt",
      "Blue",
      "Blueberry",
      "Brown",
      "Cyan",
      "Dark Green",
      "Dark Grey",
      "Grey",
      "Light Green",
      "Orange",
      "Pink",
      "Purple",
      "Red",
      "Silver",
      "White",
      "White Pearl",
      "Yellow",
      "Other"
    ];
    const reportedExteriorColor = inferExteriorColor(capture?.exteriorColor);
    const inferredExteriorColor = reportedExteriorColor;
    const exteriorColor = allowedColors.includes(inferredExteriorColor)
      ? inferredExteriorColor
      : normalize(capture?.exteriorColor) === "other"
        ? "Other"
        : "";

    const allowedRegionalSpecs = [
      "GCC",
      "American",
      "Canadian",
      "Chinese",
      "European",
      "Japanese",
      "Korean",
      "Other"
    ];
    const normalizedSpec = normalizeRegionalSpec(
      capture?.regionalSpec || specValue("Regional Spec", "Regional Specs", "Specs") || combinedText
    );
    const regionalSpec = allowedRegionalSpecs.includes(normalizedSpec) ? normalizedSpec : "";
    const insured = "No";

    const kilometers = parseKilometers(capture?.kilometers || capture?.mileage);
    const category = resolveCategory(capture?.category || capture?.condition, kilometers);
    const description = polishDescription(capture?.description);
    const descriptionSource = description ? "" : cleanDescription(capture?.descriptionSource);
    const evidence = sanitizeEvidence(capture?.evidence);
    if (inferredExteriorColor && !evidence.exteriorColor) {
      evidence.exteriorColor = {
        raw: reportedExteriorColor ? cleanText(capture?.exteriorColor) : inferredExteriorColor,
        source: "Vendor vehicle detail",
        state: "strong"
      };
    }
    if (category === "USED") {
      evidence.condition = {
        raw: "Very Good - No accidents, very few faults",
        source: "Ayshei used-car rule confirmed by the agent",
        state: "confirmed"
      };
    }
    evidence.insured = {
      raw: "No",
      source: "Ayshei insurance rule confirmed by the agent",
      state: "confirmed"
    };

    return {
      bodyType,
      capturedAt: /^\d{4}-\d{2}-\d{2}T/.test(cleanText(capture?.capturedAt))
        ? cleanText(capture.capturedAt)
        : new Date().toISOString(),
      category,
      condition: category === "USED" ? "Very Good - No accidents, very few faults" : "",
      description,
      descriptionMode: description ? "source" : "missing",
      descriptionSource,
      evidence,
      exteriorColor,
      fuelType: inferFuel(capture?.fuelType) || inferFuel(specValue("Fuel", "Fuel Type")),
      imageUrl: /^https:\/\//i.test(cleanText(capture?.imageUrl))
        ? cleanText(capture.imageUrl)
        : "",
      insured,
      kilometers: category === "USED" ? kilometers : "",
      makeModel: cleanText(capture?.makeModel),
      price:
        capture?._sanitized && /^\d{3,9}$/.test(cleanText(capture?.price))
          ? cleanText(capture.price)
          : parsePrice(capture?.price),
      regionalSpec,
      sourceAdapter: cleanText(capture?.sourceAdapter || "generic"),
      sourceUrl,
      specs: specs.slice(0, 120).filter(Boolean),
      trim: cleanText(capture?.trim),
      trimCode: Number.isInteger(capture?.trimCode) ? capture.trimCode : null,
      availableTrims: Array.isArray(capture?.availableTrims) ? capture.availableTrims : [],
      availableModels: Array.isArray(capture?.availableModels) ? capture.availableModels : [],
      transmission:
        inferTransmission(capture?.transmission) ||
        inferTransmission(specValue("Transmission", "Transmission Type")),
      year: cleanText(capture?.year) || inferYear(combinedText),
      yearCode:
        Number.isInteger(capture?.yearCode) && capture.yearCode > 0 ? capture.yearCode : null,
      makeCode: Number.isInteger(capture?.makeCode) ? capture.makeCode : null,
      modelCode: Number.isInteger(capture?.modelCode) ? capture.modelCode : null,
      _sanitized: true
    };
  };

  const requiredFields = Object.freeze([
    ["category", "Category"],
    ["makeModel", "Make & Model"],
    ["trim", "Trim"],
    ["regionalSpec", "Regional Spec"],
    ["year", "Year"],
    ["bodyType", "Body Type"],
    ["fuelType", "Fuel Type"],
    ["transmission", "Transmission Type"],
    ["exteriorColor", "Exterior Color"],
    ["insured", "Insured"],
    ["price", "Item Price"],
    ["description", "Description"]
  ]);

  const validateDraft = (draft) => {
    const missing = requiredFields
      .filter(([key]) => !cleanText(draft?.[key]))
      .map(([, label]) => label);
    if (draft?.category === "USED" && parseKilometers(draft?.kilometers) === "") {
      missing.push("Kilometers");
    }
    if (draft?.category === "USED" && !cleanText(draft?.condition)) {
      missing.push("Car Condition");
    }
    if (cleanText(draft?.year) && (!Number.isInteger(draft?.yearCode) || draft.yearCode <= 0)) {
      missing.push("Year (confirm a live Ayshei year)");
    }
    if (
      cleanText(draft?.makeModel) &&
      (!Number.isInteger(draft?.makeCode) || !Number.isInteger(draft?.modelCode))
    ) {
      missing.push("Make & Model (select a live Ayshei result)");
    }
    if (cleanText(draft?.trim) && !Number.isInteger(draft?.trimCode)) {
      missing.push("Trim (select a live Ayshei option)");
    }
    return {
      isReady: missing.length === 0,
      missing
    };
  };

  const chooseExactModel = (models, makeModel) => {
    const wanted = normalize(makeModel);
    return (
      (Array.isArray(models) ? models : []).find((model) => normalize(model.label) === wanted) ||
      null
    );
  };

  const chooseTrim = (trims, trim) => {
    const options = Array.isArray(trims) ? trims : [];
    const wanted = normalize(trim);
    if (wanted === "other" || wanted === "other trim") {
      return options.length === 1 && normalize(options[0]?.label) === "other" ? options[0] : null;
    }
    return options.find((option) => normalize(option.label) === wanted) || null;
  };

  const mergeEnrichment = (source, current, enriched) => {
    const result = { ...current, evidence: { ...(current.evidence || {}) } };
    const changed = [];
    const untouched = (field) =>
      current[field] === source[field] &&
      !/^Agent (?:reviewed|selected)/i.test(current.evidence?.[field]?.source || "");
    for (const field of [
      "description",
      "bodyType",
      "fuelType",
      "transmission",
      "regionalSpec",
      "exteriorColor",
      "makeModel",
      "trim"
    ]) {
      if (!untouched(field) || !enriched[field] || enriched[field] === source[field]) continue;
      const catalogField = field === "makeModel" || field === "trim";
      const greenShade =
        field === "exteriorColor" && /^green$/i.test(source.evidence?.exteriorColor?.raw || "");
      const colorPlaceholder = field === "exteriorColor" && source[field] === "Other";
      if (source[field] && !catalogField && !greenShade && !colorPlaceholder) continue;
      result[field] = enriched[field];
      if (enriched.evidence?.[field]) result.evidence[field] = enriched.evidence[field];
      changed.push(field);
    }
    if (untouched("year") && current.year === source.year) {
      result.yearCode = enriched.yearCode;
    }
    if (untouched("makeModel") && untouched("year") && current.year === source.year) {
      result.makeCode = enriched.makeCode;
      result.modelCode = enriched.modelCode;
      result.availableModels = enriched.availableModels;
      if (enriched.evidence?.makeModel && enriched.makeCode != null) {
        result.evidence.makeModel = enriched.evidence.makeModel;
      }
    }
    if (
      untouched("trim") &&
      untouched("makeModel") &&
      untouched("year") &&
      current.year === source.year
    ) {
      result.trimCode = enriched.trimCode;
      result.availableTrims = enriched.availableTrims;
      if (enriched.evidence?.trim && enriched.trimCode != null) {
        result.evidence.trim = enriched.evidence.trim;
      }
    }
    if (result.description !== source.description)
      result.descriptionMode = enriched.descriptionMode;
    return { changed, draft: result };
  };

  return Object.freeze({
    buildCatalogSearchTerms,
    chooseExactModel,
    chooseNearestCatalogMatch,
    chooseTrim,
    chooseUniqueCatalogMatch,
    cleanDescription,
    cleanText,
    containsExactWords,
    descriptionFromSpecs,
    verifiedSpecificationSummary,
    inferBodyType,
    inferExteriorColor,
    inferFuel,
    inferTransmission,
    inferYear,
    mergeCaptures,
    mergeEnrichment,
    normalizeRegionalSpec,
    parseKilometers,
    parsePrice,
    polishDescription,
    resolveCategory,
    sanitizeCapture,
    validateDraft
  });
})();
