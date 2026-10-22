globalThis.LunaVehicleDetailCore = (() => {
  const clean = (value, limit = Number.MAX_SAFE_INTEGER) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  const key = (value) =>
    clean(value)
      .toLocaleLowerCase("en")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  const supportedSite = (value) => {
    let url;
    try {
      url = new URL(String(value || ""));
    } catch (error) {
      return null;
    }
    const host = url.hostname.toLowerCase();
    if (
      (host === "dubicars.com" || host.endsWith(".dubicars.com")) &&
      /-\d+\.html$/i.test(url.pathname)
    ) {
      return "dubicars";
    }
    if (
      (host === "dubizzle.com" || host.endsWith(".dubizzle.com")) &&
      /\/motors\/(?:used|new)-cars\//i.test(url.pathname)
    ) {
      return "dubizzle";
    }
    return null;
  };

  const exportOnlyPattern = /\b(?:export\s+only|only\s+(?:for\s+)?export|for\s+export\s+only)\b/i;
  const isExportOnly = (value) =>
    clean(value)
      .toLocaleLowerCase("en")
      .replace(/[‐‑‒–—-]+/g, " ")
      .split(/[.!?;\n]+/)
      .some((clause) => {
        const match = clause.match(exportOnlyPattern);
        if (!match) return false;
        const before = clause.slice(0, match.index);
        const after = clause.slice((match.index || 0) + match[0].length);
        const negatedBefore =
          /\b(?:not|no|never|without|isn'?t|aren'?t|wasn'?t|weren'?t)\b[^,]{0,60}$/i.test(before);
        const negatedAfter =
          /^\s*(?:restriction\s+)?(?:does\s+not|doesn't|is\s+not|isn't|not\s+(?:applicable|required|restricted))\b/i.test(
            after
          );
        return !negatedBefore && !negatedAfter;
      });
  const normalizeCategory = (value) => {
    const normalized = key(value);
    if (isExportOnly(value)) return "EXPORT";
    if (normalized.includes("usedcondition") || normalized === "used") return "USED";
    if (normalized.includes("newcondition") || normalized === "new") return "NEW";
    return "";
  };
  const mileageNumber = (value) => {
    const match = clean(value).match(/\d[\d\s,.]*/);
    if (!match) return null;
    const number = Number(match[0].replace(/\D/g, ""));
    return Number.isSafeInteger(number) ? number : null;
  };
  const factValue = (capture, name) => clean(capture?.facts?.[name]?.value);
  const resolveCategory = (capture) => {
    const targetMarket = factValue(capture, "targetMarket");
    const pageCategory = factValue(capture, "category");
    const exportEvidence = [capture?.title, targetMarket, pageCategory, capture?.description];
    if (exportEvidence.some(isExportOnly)) {
      return "EXPORT";
    }
    const mileage = mileageNumber(factValue(capture, "mileage"));
    if (mileage !== null) return mileage <= 80 ? "NEW" : "USED";
    const explicitCategory = normalizeCategory(pageCategory);
    if (["NEW", "USED"].includes(explicitCategory)) return explicitCategory;
    return "";
  };
  const normalizeTransmission = (value) => {
    const normalized = key(value);
    if (normalized.includes("automatic")) return "AUTOMATIC";
    if (normalized.includes("manual")) return "MANUAL";
    return "";
  };
  const normalizeSpecs = (value) => {
    const normalized = key(value);
    const values = [
      ["gcc", "GCC"],
      ["american", "American"],
      ["usa", "American"],
      ["canadian", "Canadian"],
      ["chinese", "Chinese"],
      ["european", "European"],
      ["japanese", "Japanese"],
      ["korean", "Korean"]
    ];
    if (
      ["other", "otherspec", "otherspecs", "otherregionalspec", "otherregionalspecs"].includes(
        normalized
      )
    )
      return "Other";
    return values.find(([needle]) => normalized.includes(needle))?.[1] || "";
  };
  const normalizeColor = (value) => {
    const allowed = [
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
      "Other",
      "Pink",
      "Purple",
      "Red",
      "Silver",
      "White",
      "White Pearl",
      "Yellow"
    ];
    const normalized = key(value).replace("gray", "grey");
    if (!normalized) return "";
    return allowed.find((item) => key(item) === normalized) || "Other";
  };
  const isPlainGreen = (value) => key(value) === "green";
  const phrase = (value) =>
    clean(value)
      .toLocaleLowerCase("en")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const canonicalMake = (value) =>
    phrase(value)
      .replace(/\b(?:mercedec|mercedez|mercedes)\b/g, "mercedes")
      .replace(/\bmercedes\s+benz\b/g, "mercedes")
      .trim();
  const canonicalPhrase = (value) =>
    phrase(value)
      .replace(/\b(?:mercedec|mercedez|mercedes)\b/g, "mercedes")
      .replace(/\bmercedes\s+benz\b/g, "mercedes")
      .replace(/\blandcruiser\b/g, "land cruiser")
      .trim();
  const identityTokens = (value) => canonicalPhrase(value).match(/\p{L}+|\p{N}+/gu) || [];

  const exactModel = (candidates, make, model) => {
    const matches = (Array.isArray(candidates) ? candidates : []).filter(
      (candidate) =>
        canonicalMake(candidate?.make) === canonicalMake(make) &&
        key(candidate?.model) === key(model)
    );
    return matches.length === 1 ? matches[0] : null;
  };
  const exactTrim = (candidates, trim) => {
    const matches = (Array.isArray(candidates) ? candidates : []).filter(
      (candidate) => key(candidate?.label) === key(trim)
    );
    return matches[0] || null;
  };
  const evidenceText = (capture, { includeContext = false } = {}) =>
    clean(
      [
        factValue(capture, "make"),
        factValue(capture, "model"),
        factValue(capture, "trim"),
        capture?.title,
        includeContext ? capture?.summary : "",
        includeContext ? capture?.context : "",
        !capture?.title && !factValue(capture, "model")
          ? (() => {
              try {
                return decodeURIComponent(
                  new URL(String(capture?.sourceUrl || "")).pathname
                ).replace(/[-_/]+/g, " ");
              } catch (error) {
                return "";
              }
            })()
          : ""
      ].join(" ")
    );
  const isOrderedTokenSubset = (needles, haystack) => {
    let offset = 0;
    return needles.every((needle) => {
      const index = haystack.indexOf(needle, offset);
      if (index < 0) return false;
      offset = index + 1;
      return true;
    });
  };
  const contiguousTokenIndex = (needles, haystack) =>
    needles.length
      ? haystack.findIndex((_, index) =>
          needles.every((token, offset) => token === haystack[index + offset])
        )
      : -1;
  const modelRefinesExplicit = (candidate, capture) => {
    const explicitTokens = identityTokens(factValue(capture, "model"));
    const modelTokens = identityTokens(candidate?.model);
    // A live model may include what the vendor calls a trim. Require the complete,
    // contiguous name in the ad title, not scattered numbers or description text.
    const titleTokens = identityTokens(
      clean(capture?.title).replace(
        /\b\d[\d,.]*\s*(?:km|kms|kilomet(?:er|re)s?|miles?|cc|hp|bhp)\b/gi,
        " "
      )
    );
    return Boolean(
      explicitTokens.length &&
        modelTokens.length > explicitTokens.length &&
        explicitTokens.every((token, index) => token === modelTokens[index]) &&
        contiguousTokenIndex(modelTokens, titleTokens) >= 0
    );
  };
  const isOtherCandidate = (candidate) => {
    const value = clean(candidate?.model || candidate?.label);
    return (
      /^(?:other|others)(?:\s+(?:model|trim))?$/i.test(value) ||
      (!candidate?.model && /\bothers?$/i.test(value))
    );
  };
  const specificCandidates = (candidates) => {
    const all = Array.isArray(candidates) ? candidates : [];
    const specific = all.filter((candidate) => !isOtherCandidate(candidate));
    return specific.length ? specific : all;
  };
  const modelIsExplicitBase = (candidate, capture) => {
    const explicitTokens = identityTokens(factValue(capture, "model"));
    const modelTokens = identityTokens(candidate?.model);
    return (
      modelTokens.length > 0 &&
      modelTokens.length < explicitTokens.length &&
      modelTokens.every((token, index) => token === explicitTokens[index])
    );
  };
  const rankModelCandidates = (candidates, capture) => {
    const identity = canonicalPhrase(evidenceText(capture, { includeContext: false }));
    const pageTokens = identityTokens(identity);
    const explicitMake = canonicalMake(factValue(capture, "make"));
    const explicitModel = canonicalPhrase(factValue(capture, "model"));
    const all = specificCandidates(candidates);
    const specificExplicit = explicitModel && !/\b(?:class|series)\b/.test(explicitModel);
    const compatibleExplicit = specificExplicit
      ? all.filter(
          (candidate) =>
            (!explicitMake || canonicalMake(candidate?.make) === explicitMake) &&
            (key(canonicalPhrase(candidate?.model)) === key(explicitModel) ||
              modelRefinesExplicit(candidate, capture) ||
              modelIsExplicitBase(candidate, capture))
        )
      : [];
    return (specificExplicit ? compatibleExplicit : all)
      .map((candidate, index) => {
        const candidateMake = canonicalMake(candidate?.make);
        const candidateModel = canonicalPhrase(candidate?.model);
        const modelTokens = identityTokens(candidateModel);
        const labelTokens = identityTokens(candidate?.label);
        const segmentedModelPresent =
          modelTokens.length >= 2 && isOrderedTokenSubset(modelTokens, pageTokens);
        const modelPresent =
          candidateModel &&
          (` ${identity} `.includes(` ${candidateModel} `) ||
            segmentedModelPresent ||
            (specificExplicit && key(candidateModel) === key(explicitModel)));
        const orderedLabel =
          labelTokens.length >= 2 && isOrderedTokenSubset(labelTokens, pageTokens);
        if ((explicitMake && candidateMake !== explicitMake) || (!modelPresent && !orderedLabel))
          return null;
        const digitTokens = modelTokens.filter((token) => /\d/.test(token));
        const exactDigitTokens = digitTokens.filter((token) => pageTokens.includes(token)).length;
        const genericSeries = !digitTokens.length && /\b(?:class|series)\b/.test(candidateModel);
        const score =
          (explicitModel && candidateModel === explicitModel ? (genericSeries ? 40 : 600) : 0) +
          (modelPresent ? 300 : 0) +
          (orderedLabel ? 120 : 0) +
          exactDigitTokens * 180 +
          modelTokens.length * 10 +
          candidateModel.length +
          (Number(candidate?.modelCode) > 0 ? 20 : 0) -
          (genericSeries ? 100 : 0);
        const specificity = modelRefinesExplicit(candidate, capture) ? modelTokens.length : 0;
        return { candidate, index, score, specificity };
      })
      .filter(Boolean)
      .sort(
        (left, right) =>
          right.specificity - left.specificity ||
          right.score - left.score ||
          left.index - right.index
      )
      .map((entry) => entry.candidate);
  };
  const nearestModelCandidates = (candidates, capture) => {
    const evidenceRanked = rankModelCandidates(candidates, capture);
    if (evidenceRanked.length) return evidenceRanked;
    const explicitMake = canonicalMake(factValue(capture, "make"));
    const pageTokens = identityTokens(evidenceText(capture, { includeContext: false }));
    const pageTokenSet = new Set(pageTokens);
    const explicitFamily = identityTokens(factValue(capture, "model"))[0];
    const classVariant =
      /\b(?:class|series)\b/i.test(factValue(capture, "model")) &&
      /^\p{L}+$/u.test(explicitFamily || "")
        ? [
            ...`${factValue(capture, "trim")} ${capture?.title || ""}`.matchAll(
              /\b([a-z]{1,5})[\s-]*(\d{2,4})\b/gi
            )
          ].find((match) => match[1].toLowerCase() === explicitFamily)?.[2]
        : "";
    return specificCandidates(candidates)
      .map((candidate, index) => {
        const candidateMake = canonicalMake(candidate?.make);
        if (explicitMake && candidateMake !== explicitMake) return null;
        const modelTokens = identityTokens(candidate?.model);
        // Sharing a make or drivetrain (4MATIC, xDrive, AWD) is not vehicle
        // identity. A truncated make-wide catalog must not supply an unrelated car.
        if (explicitFamily && /^\p{L}+$/u.test(explicitFamily) && modelTokens[0] !== explicitFamily)
          return null;
        if (classVariant && !modelTokens.includes(classVariant)) return null;
        if (
          !modelTokens.some(
            (token) =>
              token.length > 1 &&
              pageTokenSet.has(token) &&
              !/^(?:class|series|matic|quattro|awd|wd|xdrive|sdrive|amg)$/i.test(token)
          )
        )
          return null;
        const overlap = modelTokens.reduce(
          (score, token) => score + (pageTokenSet.has(token) ? (/^\d+$/.test(token) ? 8 : 3) : 0),
          0
        );
        const ordered = modelTokens.length > 0 && isOrderedTokenSubset(modelTokens, pageTokens);
        const score =
          overlap * 100 +
          (ordered ? 250 : 0) +
          modelTokens.length * 5 +
          canonicalPhrase(candidate?.model).length;
        return { candidate, index, score };
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map((entry) => entry.candidate);
  };
  const modelFromEvidence = (candidates, capture) => {
    return rankModelCandidates(candidates, capture)[0] || null;
  };
  const sameMakeModels = (candidates, capture) => {
    const all = specificCandidates(candidates);
    const explicitMake = canonicalMake(factValue(capture, "make"));
    const title = ` ${canonicalPhrase(capture?.title)} `;
    const titleMakes = [
      ...new Set(all.map((candidate) => canonicalMake(candidate?.make)).filter(Boolean))
    ].filter((make) => title.includes(` ${make} `));
    const make = explicitMake || (titleMakes.length === 1 ? titleMakes[0] : "");
    return make ? all.filter((candidate) => canonicalMake(candidate?.make) === make) : [];
  };
  const isGccCapture = (capture) => {
    const regionalEvidence = [factValue(capture, "specs"), factValue(capture, "targetMarket")]
      .filter(Boolean)
      .join(" ");
    return (
      !/\bnon[\s-]*gcc\b/i.test(regionalEvidence) && normalizeSpecs(regionalEvidence) === "GCC"
    );
  };
  const preferGccCompatibleTrims = (candidates, capture) => {
    const all = Array.isArray(candidates) ? candidates : [];
    if (!isGccCapture(capture)) return all;
    const compatible = all.filter(
      (candidate) => !/\bnon[\s-]*gcc\b/i.test(clean(candidate?.label))
    );
    // Preserve the live list's only usable choice rather than leaving GCC listings blank.
    return compatible.length ? compatible : all;
  };
  const trimFromEvidence = (candidates, capture) => {
    const explicitValue = factValue(capture, "trim");
    const explicitKey = key(explicitValue);
    if (["std", "stdtrim", "standard", "standardtrim"].includes(explicitKey)) {
      const available = Array.isArray(candidates) ? candidates : [];
      return (
        available.find((candidate) => key(candidate?.label) === "std") ||
        available.find((candidate) => key(candidate?.label) === "standard") ||
        null
      );
    }
    // A vendor's generic Other trim is missing information. The model/title
    // may still contain an exact catalog trim (e.g. Golf GTI, trim Other).
    if (explicitValue && !["other", "othertrim"].includes(explicitKey))
      return exactTrim(candidates, explicitValue);
    const meaningful = (Array.isArray(candidates) ? candidates : []).filter(
      (candidate) => !["other", "std", "standard"].includes(key(candidate?.label))
    );
    const identityText = ` ${phrase(evidenceText(capture, { includeContext: false }))} `;
    const matches = meaningful.filter((candidate) => {
      const label = phrase(candidate?.label);
      return label && identityText.includes(` ${label} `);
    });
    return new Set(matches.map((candidate) => key(candidate?.label))).size === 1
      ? matches[0]
      : null;
  };
  const captureForModelTrim = (capture, model) => {
    if (!model) return capture;
    const modelTokens = identityTokens(model.model);
    const trimTokens = identityTokens(factValue(capture, "trim"));
    const trimContainsModel =
      modelTokens.length > 0 && modelTokens.every((token, index) => token === trimTokens[index]);
    if (!trimContainsModel && !modelRefinesExplicit(model, capture)) return capture;
    const suffix = trimContainsModel
      ? modelTokens
      : modelTokens.slice(identityTokens(factValue(capture, "model")).length);
    if (!suffix.every((token, index) => token === trimTokens[index])) return capture;
    const withoutModel = (text) => {
      const tokens = identityTokens(text);
      const index = contiguousTokenIndex(modelTokens, tokens);
      return index < 0
        ? text
        : [...tokens.slice(0, index), ...tokens.slice(index + modelTokens.length)].join(" ");
    };
    // Keep the original capture intact. Only trim matching sees the remaining
    // trim words, so an identifier already consumed by the model cannot be reused.
    return {
      ...capture,
      facts: {
        ...capture.facts,
        model: { ...capture.facts.model, value: "" },
        trim: { ...capture.facts.trim, value: trimTokens.slice(suffix.length).join(" ") }
      },
      title: withoutModel(capture.title),
      summary: withoutModel(capture.summary),
      context: withoutModel(capture.context)
    };
  };
  const fallbackTrim = (candidates, capture) => {
    // Kept for compatibility: only explicit evidence is a deterministic match.
    // A real-world equivalent must come from validated AI, never text ranking.
    return trimFromEvidence(candidates, capture);
  };
  const selectTrimAwareModel = (options, capture, preferredModel = null) => {
    const available = (Array.isArray(options) ? options : []).filter((option) => option?.model);
    if (!available.length) return null;
    const rankedModels = rankModelCandidates(
      available.map((option) => option.model),
      capture
    );
    const ranked = rankedModels
      .map((model) =>
        available.find(
          (option) =>
            option.model.makeCode === model.makeCode && option.model.modelCode === model.modelCode
        )
      )
      .filter(Boolean);
    const ordered = ranked.length ? ranked : available;
    const exactTrimOption = ordered.find((option) => trimFromEvidence(option.trims, capture));
    if (exactTrimOption) return exactTrimOption;
    const preferred =
      preferredModel &&
      available.find(
        (option) =>
          option.model.makeCode === preferredModel.makeCode &&
          option.model.modelCode === preferredModel.modelCode
      );
    if (preferred?.trims?.length) return preferred;
    return ordered.find((option) => option.trims?.length) || preferred || ordered[0];
  };
  const modelSearchTerms = (capture) => {
    const rawMake = factValue(capture, "make");
    const make = canonicalMake(rawMake) === "mercedes" ? "Mercedes" : rawMake;
    const model = factValue(capture, "model");
    const title = clean(capture?.title, 180);
    const strippedTitle = title
      .replace(/\b(?:19|20)\d{2}\b/g, " ")
      .replace(
        /\b(?:used|new|car|cars|vehicle|for\s+sale|sale|dubai|uae|dubicars|dubizzle)\b/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();
    const tokens = strippedTitle.split(" ").filter(Boolean);
    // Marketplaces often put the specific model in Trim under a generic
    // class/series. Search observed codes directly before a capped make lookup.
    const family = identityTokens(model)[0] || "";
    const specificCodes = [
      ...`${factValue(capture, "trim")} ${title}`.matchAll(
        /\b([a-z]{1,5})[\s-]*(\d{2,4})([a-z]{0,3})\b/gi
      )
    ]
      .filter(
        (match) =>
          !family || !/\b(?:class|series)\b/i.test(model) || match[1].toLowerCase() === family
      )
      .flatMap((match) => [
        `${make} ${match[1]}${match[2]}${match[3]}`,
        `${make} ${match[1]} ${match[2]}${match[3]}`
      ]);
    const values = [
      `${make} ${model}`,
      ...specificCodes.slice(0, 2),
      ...(/\b(?:class|series)\b/i.test(model) && /^\p{L}+$/u.test(family)
        ? [`${make} ${family}`]
        : []),
      ...(make && model
        ? [`${make} ${canonicalPhrase(model)}`, `${make} ${identityTokens(model).join("")}`]
        : []),
      make,
      model,
      strippedTitle,
      ...[2, 3, 4, 5, 6].map((count) => tokens.slice(0, count).join(" ")),
      title
    ]
      .map((value) => clean(value, 80))
      .filter((value) => value.length >= 2);
    return [...new Set(values.map((value) => value.toLocaleLowerCase("en")))]
      .map((normalized) => values.find((value) => value.toLocaleLowerCase("en") === normalized))
      .slice(0, 7);
  };

  const analyzeImport = (parsed) => {
    const ads = Array.isArray(parsed?.ads) ? parsed.ads : [];
    const countRepeats = (selector) => {
      const counts = new Map();
      ads.forEach((ad) => {
        const normalized = key(selector(ad));
        if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1);
      });
      return [...counts.values()]
        .filter((count) => count > 1)
        .reduce((sum, count) => sum + count - 1, 0);
    };
    const sites = { dubicars: 0, dubizzle: 0, other: 0 };
    ads.forEach((ad) => {
      sites[supportedSite(ad?.source?.url) || "other"] += 1;
    });
    return Object.freeze({
      duplicateNameRows: countRepeats((ad) => ad?.source?.adName),
      duplicateUrlRows: countRepeats((ad) => ad?.source?.url),
      invalidRows: Array.isArray(parsed?.invalidLines) ? parsed.invalidLines.length : 0,
      sites: Object.freeze(sites),
      totalRows: ads.length
    });
  };

  const proposalFromCapture = (capture) => ({
    category: resolveCategory(capture),
    color: normalizeColor(capture?.facts?.color?.value),
    specs: (() => {
      const stated = normalizeSpecs(capture?.facts?.specs?.value);
      if (stated) return stated;
      const description = clean(capture?.description);
      const described = description.match(
        /\b(?:regional\s+)?specs?(?:ification)?\s*[:\-]?\s*(gcc|american|usa|canadian|chinese|european|japanese|korean|other)\b|\b(gcc|american|usa|canadian|chinese|european|japanese|korean|other)\s+(?:regional\s+)?specs?\b/i
      );
      return described ? normalizeSpecs(described[1] || described[2]) : "";
    })(),
    transmission: normalizeTransmission(capture?.facts?.transmission?.value)
  });

  return Object.freeze({
    analyzeImport,
    canonicalMake,
    captureForModelTrim,
    exactModel,
    exactTrim,
    fallbackTrim,
    isExportOnly,
    key,
    mileageNumber,
    isPlainGreen,
    isOtherCandidate,
    modelFromEvidence,
    modelSearchTerms,
    nearestModelCandidates,
    preferGccCompatibleTrims,
    sameMakeModels,
    normalizeCategory,
    normalizeColor,
    rankModelCandidates,
    normalizeSpecs,
    normalizeTransmission,
    proposalFromCapture,
    resolveCategory,
    selectTrimAwareModel,
    supportedSite,
    trimFromEvidence
  });
})();
