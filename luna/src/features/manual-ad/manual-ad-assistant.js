globalThis.LunaManualAdAssistant = (() => {
  const startButton = document.querySelector("#manual-ad-prepare");
  const fillAysheiButton = document.querySelector("#manual-ad-fill-ayshei");
  const preview = document.querySelector("#manual-ad-preview");
  const status = document.querySelector("#manual-ad-status");
  const message = document.querySelector("#manual-ad-message");
  const modelResults = document.querySelector("#manual-ad-model-results");
  const modelStatus = document.querySelector("#manual-ad-model-status");
  const kilometersField = document.querySelector("#manual-ad-kilometers-field");
  const conditionField = document.querySelector("#manual-ad-condition-field");
  const aiDisclosure = document.querySelector("#manual-ad-ai-disclosure");
  const aiDisclosureList = document.querySelector("#manual-ad-ai-disclosure-list");
  const sourceFacts = document.querySelector("#manual-ad-source-facts");
  const sourcePreview = document.querySelector("#manual-ad-source-preview");
  const fieldNames = [
    "bodyType",
    "category",
    "condition",
    "description",
    "exteriorColor",
    "fuelType",
    "insured",
    "kilometers",
    "makeModel",
    "price",
    "regionalSpec",
    "transmission",
    "trim",
    "year"
  ];
  const fields = Object.fromEntries(
    fieldNames.map((key) => [key, document.querySelector(`[data-manual-field="${key}"]`)])
  );
  const fieldLabels = Object.freeze({
    bodyType: "Body Type",
    category: "Category",
    condition: "Car Condition",
    description: "Description",
    exteriorColor: "Exterior Color",
    fuelType: "Fuel Type",
    insured: "Insured",
    kilometers: "Kilometers",
    makeModel: "Make & Model",
    price: "Item Price",
    regionalSpec: "Regional Spec",
    transmission: "Transmission Type",
    trim: "Trim",
    year: "Year"
  });
  const storageKey =
    globalThis.LunaFoundation?.storageKeys.manualAdDraft || "luna.manualAd.draft.v2";
  let draft = null;
  let modelSearchTimer = null;
  let modelSearchRequest = 0;
  let fillBusy = false;
  let prepareBusy = false;
  let prepareRun = 0;

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
    status.dataset.manualState = state;
    status.textContent = text;
  };
  const setMessage = (text, kind = "info") => {
    message.dataset.kind = kind;
    message.textContent = text;
  };
  const isAiEvidence = (item) =>
    item?.state === "review" &&
    !/\bno AI request\b/i.test(item?.source || "") &&
    /\b(?:AI|Qwen|Groq|Gemini|Gemma|OpenRouter)\b/i.test(item?.source || "");
  const setEvidence = (field, raw, source, state = "review") => {
    if (!draft) return;
    draft.evidence ||= {};
    draft.evidence[field] = {
      raw: globalThis.LunaManualAdCore.cleanText(raw),
      source,
      state
    };
  };
  const syncDraftFromFields = () => {
    if (!draft) return;
    Object.entries(fields).forEach(([key, input]) => {
      draft[key] = input.value.trim();
    });
    if (draft.category === "USED") {
      draft.condition = "Very Good - No accidents, very few faults";
    } else {
      draft.kilometers = "";
      draft.condition = "";
    }
  };
  const saveDraft = async () => {
    if (draft) await chrome.storage.local.set({ [storageKey]: draft });
  };

  const clearCompletedDraft = async () => {
    draft = null;
    globalThis.clearTimeout(modelSearchTimer);
    modelSearchRequest += 1;
    modelResults.replaceChildren();
    modelStatus.textContent = "";
    Object.entries(fields).forEach(([key, input]) => {
      if (key === "trim" && input instanceof HTMLSelectElement) input.replaceChildren();
      input.value = "";
    });
    await chrome.storage.local.remove(storageKey);
    render();
  };

  const clearCompletedWorkflow = async () => {
    await clearCompletedDraft();
    await globalThis.LunaImageScraper?.clearForManualAd?.();
  };

  const renderValidation = () => {
    const validation = globalThis.LunaManualAdCore.validateDraft(draft);
    const missingFields = new Set(
      validation.missing
        .map((label) => {
          const base = label.replace(/\s*\(.+$/, "");
          return Object.entries(fieldLabels).find(([, name]) => name === base)?.[0];
        })
        .filter(Boolean)
    );
    Object.entries(fields).forEach(([key, input]) => {
      input.closest("label")?.classList.toggle("is-missing", missingFields.has(key));
    });
    fillAysheiButton.disabled = fillBusy || prepareBusy || !draft;
    return validation;
  };

  const renderTrimOptions = () => {
    const options = Array.isArray(draft?.availableTrims) ? draft.availableTrims : [];
    fields.trim.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "";
    fields.trim.append(placeholder);
    options.forEach((trim) => {
      const option = document.createElement("option");
      option.value = trim.label;
      option.textContent = trim.label;
      option.dataset.trimCode = String(trim.trimCode);
      fields.trim.append(option);
    });
    const selected = options.find(
      (trim) => trim.label === draft?.trim && trim.trimCode === draft?.trimCode
    );
    fields.trim.value = selected?.label || "";
    fields.trim.disabled = !options.length;
  };

  const renderAiDisclosure = () => {
    aiDisclosureList.replaceChildren();
    const assisted = Object.entries(draft?.evidence || {}).filter(
      ([field, item]) =>
        fieldLabels[field] &&
        globalThis.LunaManualAdCore.cleanText(draft?.[field]) &&
        isAiEvidence(item)
    );
    assisted.forEach(([field, item]) => {
      const entry = document.createElement("li");
      const value =
        field === "description"
          ? "AI-polished text"
          : globalThis.LunaManualAdCore.cleanText(draft[field]);
      entry.textContent = `${fieldLabels[field]}: ${value} — ${item.source}`;
      aiDisclosureList.append(entry);
    });
    aiDisclosure.hidden = assisted.length === 0;
  };

  const render = () => {
    preview.hidden = !draft;
    sourcePreview.hidden = !draft?.specs?.length;
    if (!draft) {
      fillAysheiButton.disabled = true;
      return;
    }
    Object.entries(fields).forEach(([key, input]) => {
      if (key !== "trim") input.value = draft[key] || "";
    });
    const isUsed = draft.category === "USED";
    kilometersField.hidden = !isUsed;
    conditionField.hidden = !isUsed;
    if (isUsed) fields.condition.value = "Very Good - No accidents, very few faults";
    renderTrimOptions();
    sourceFacts.replaceChildren();
    (draft.specs || []).forEach((spec) => {
      const item = document.createElement("li");
      item.textContent = spec;
      sourceFacts.append(item);
    });
    renderAiDisclosure();
    modelStatus.textContent =
      Number.isInteger(draft.makeCode) && Number.isInteger(draft.modelCode)
        ? ""
        : draft.availableModels?.length
          ? "Choose the correct model below."
          : "Type to search available models.";
    if (!Number.isInteger(draft.makeCode) && draft.availableModels?.length) {
      renderModelResults(draft.availableModels);
    } else {
      modelResults.replaceChildren();
    }
    renderValidation();
  };

  const getCurrentTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
      throw new Error("Open a normal vendor advertisement page first.");
    }
    return tab;
  };

  const modelId = (model) => `${model.makeCode}:${model.modelCode}`;
  const trimId = (trim) => String(trim.trimCode);
  const askClosedCatalogAi = async (task, options, capture) => {
    if (!globalThis.LunaGroq?.analyze || !options.length) return null;
    const candidates = options.map((option) => ({
      id: task === "model" ? modelId(option) : trimId(option),
      label: option.aiLabel || option.label
    }));
    try {
      const result = await globalThis.LunaGroq.analyze({
        candidates,
        facts: {
          context: (capture.specs || []).join(" · "),
          make: capture.makeModel,
          model: capture.makeModel,
          summary: capture.description || capture.descriptionSource,
          trim: capture.trim,
          year: capture.year
        },
        imageUrl: capture.imageUrl,
        task
      });
      const selected =
        options.find(
          (option) => (task === "model" ? modelId(option) : trimId(option)) === result.candidate?.id
        ) || null;
      return selected
        ? {
            ...selected,
            aiReview: {
              confidence: result.confidence || "low",
              confidenceScore: result.confidenceScore,
              model: result.provider || result.model || "AI",
              riskFlags: result.riskFlags || [],
              reviewReason: result.reviewReason || ""
            }
          }
        : null;
    } catch (error) {
      return null;
    }
  };

  const resolveMirrorYear = async (capture) => {
    if (Number.isInteger(capture.yearCode) && capture.yearCode > 0) {
      return capture.yearCode;
    }
    const response = await globalThis.LunaAyshei.resolveYearFromMirror(capture.year);
    capture.yearCode = response.yearCode;
    return response.yearCode;
  };

  const loadMirrorTrims = async (model, capture) => {
    const yearCode = await resolveMirrorYear(capture);
    const response = await globalThis.LunaAyshei.fetchTrimsFromMirror(model.label, yearCode);
    return response.trims || [];
  };

  const resolveVehicle = async (capture) => {
    const vendorModel = capture.makeModel;
    const vendorTrim = capture.trim;
    try {
      await resolveMirrorYear(capture);
    } catch (error) {
      capture.yearCode = null;
      capture.makeCode = null;
      capture.modelCode = null;
      capture.trimCode = null;
      capture.availableModels = [];
      capture.availableTrims = [];
      return capture;
    }
    let models = [];
    for (const keyword of globalThis.LunaManualAdCore.buildCatalogSearchTerms(capture)) {
      try {
        const response = await globalThis.LunaAyshei.searchModelsFromMirror(
          keyword,
          capture.yearCode
        );
        models.push(...(response.models || []));
        if (globalThis.LunaManualAdCore.chooseExactModel(models, vendorModel)) break;
      } catch (error) {
        // Try the next evidence-based search term; never switch endpoint.
      }
    }
    const uniqueModels = models
      .filter(
        (model, index, values) =>
          values.findIndex((candidate) => modelId(candidate) === modelId(model)) === index
      )
      .slice(0, 20);
    capture.availableModels = uniqueModels;
    let model =
      globalThis.LunaManualAdCore.chooseUniqueCatalogMatch(uniqueModels, [vendorModel], 2) ||
      globalThis.LunaManualAdCore.chooseExactModel(uniqueModels, vendorModel);
    let modelSource = model ? "Mirror catalog exact/unique evidence match" : "";
    if (!model && uniqueModels.length) {
      const enriched = await Promise.all(
        uniqueModels.slice(0, 10).map(async (candidate) => {
          try {
            const trims = await loadMirrorTrims(candidate, capture);
            return {
              ...candidate,
              aiLabel: `${candidate.label} | Available trims: ${trims.map((item) => item.label).join(", ")}`,
              prefetchedTrims: trims
            };
          } catch (error) {
            return candidate;
          }
        })
      );
      model = await askClosedCatalogAi("model", enriched, capture);
      modelSource = model
        ? `${model.aiReview.model} choice from closed Mirror model list · ${model.aiReview.confidenceScore == null ? "confidence unreported" : `${Math.round(model.aiReview.confidenceScore * 100)}% confidence`} · review required${model.aiReview.riskFlags.length ? ` · flags: ${model.aiReview.riskFlags.join(", ")}` : ""}`
        : "";
      if (!model) {
        model = globalThis.LunaManualAdCore.chooseNearestCatalogMatch(uniqueModels, [
          vendorModel,
          vendorTrim
        ]);
        modelSource = model ? "Mirror nearest textual candidate; agent review required" : "";
      }
    }
    if (!model) {
      capture.makeModel = vendorModel;
      capture.makeCode = null;
      capture.modelCode = null;
      capture.trim = vendorTrim;
      capture.trimCode = null;
      capture.availableTrims = [];
      return capture;
    }
    capture.makeModel = model.label;
    capture.makeCode = model.makeCode;
    capture.modelCode = model.modelCode;
    capture.availableModels = [];
    capture.evidence.makeModel = {
      raw: `${vendorModel} → ${model.label}`,
      source: modelSource,
      state: /exact|unique/.test(modelSource) ? "strong" : "review"
    };
    try {
      capture.availableTrims = model.prefetchedTrims || (await loadMirrorTrims(model, capture));
    } catch (error) {
      capture.trim = vendorTrim;
      capture.trimCode = null;
      capture.availableTrims = [];
      return capture;
    }
    const trimCandidates = globalThis.LunaManualAdCore.preferGccCompatibleTrims(
      capture.availableTrims,
      capture.regionalSpec
    );
    let trim =
      globalThis.LunaManualAdCore.chooseTrim(trimCandidates, vendorTrim) ||
      globalThis.LunaManualAdCore.chooseUniqueCatalogMatch(trimCandidates, [vendorTrim]);
    let trimSource = trim ? "Mirror trim exact/unique evidence match" : "";
    if (!trim && trimCandidates.length) {
      trim = await askClosedCatalogAi("trim", trimCandidates, capture);
      trimSource = trim
        ? `${trim.aiReview.model} choice from closed Mirror trim list · ${trim.aiReview.confidenceScore == null ? "confidence unreported" : `${Math.round(trim.aiReview.confidenceScore * 100)}% confidence`} · review required${trim.aiReview.riskFlags.length ? ` · flags: ${trim.aiReview.riskFlags.join(", ")}` : ""}`
        : "";
      if (!trim) {
        trim = globalThis.LunaManualAdCore.chooseNearestCatalogMatch(trimCandidates, [vendorTrim]);
        trimSource = trim ? "Mirror nearest textual trim; agent review required" : "";
      }
    }
    capture.trim = trim?.label || vendorTrim;
    capture.trimCode = trim?.trimCode ?? null;
    if (trim) {
      capture.evidence.trim = {
        raw: `${vendorTrim || "No explicit vendor trim"} → ${trim.label}`,
        source: trimSource,
        state: /exact|unique/.test(trimSource) ? "strong" : "review"
      };
    }
    return capture;
  };

  const improveMissingDescription = async (capture) => {
    capture.description = globalThis.LunaManualAdCore.polishDescription(capture.description);
    if (capture.description) return capture;
    const verifiedSummary = globalThis.LunaManualAdCore.verifiedSpecificationSummary(capture);
    if (verifiedSummary) {
      capture.description = verifiedSummary;
      capture.descriptionMode = "verified-spec-summary";
      capture.evidence.description = {
        raw: "Built only from verified vehicle specifications",
        source: "Verified specification summary; no AI request was needed",
        state: "strong"
      };
      return capture;
    }
    const sourceText =
      capture.descriptionSource || globalThis.LunaManualAdCore.descriptionFromSpecs(capture.specs);
    if (!sourceText) return capture;
    if (globalThis.LunaGroq?.analyze) {
      try {
        const result = await globalThis.LunaGroq.analyze({
          facts: { sourceText },
          task: "description"
        });
        capture.description = globalThis.LunaManualAdCore.cleanDescription(result.description);
        capture.descriptionMode = "ai-polished";
        capture.evidence.description = {
          raw: "Formatted only from verified page specifications",
          source: `${result.provider || result.model || "AI"} evidence-preserving formatter · ${result.confidence || "review"} confidence · agent review required`,
          state: "review"
        };
        return capture;
      } catch (error) {
        // Keep every verified specification as a deterministic fallback.
      }
    }
    capture.description = globalThis.LunaManualAdCore.cleanDescription(sourceText);
    capture.descriptionMode = "specifications";
    capture.evidence.description = {
      raw: "Copied from verified page specifications",
      source: "Verified page specifications copied without rewording",
      state: "strong"
    };
    return capture;
  };

  const resolveGreenShade = async (capture) => {
    if (
      !/^green$/i.test(capture.evidence?.exteriorColor?.raw || "") ||
      !capture.imageUrl ||
      !globalThis.LunaGroq?.analyze
    )
      return capture;
    try {
      const result = await globalThis.LunaGroq.analyze({
        candidates: [
          { id: "light-green", label: "Light Green" },
          { id: "dark-green", label: "Dark Green" }
        ],
        facts: { color: "Green", year: capture.year },
        imageUrl: capture.imageUrl,
        task: "color"
      });
      if (!result.imageUsed) {
        capture.exteriorColor = "";
        capture.evidence.exteriorColor = {
          raw: "Green",
          source:
            "Vehicle image was unavailable to AI; choose Light Green or Dark Green after visual review",
          state: "missing"
        };
        return capture;
      }
      capture.exteriorColor = result.candidate?.label || "";
      if (capture.exteriorColor)
        capture.evidence.exteriorColor = {
          raw: `Green → ${capture.exteriorColor}`,
          source: `${result.provider || result.model || "AI"} image comparison`,
          state: "review"
        };
    } catch (error) {
      capture.exteriorColor = "";
    }
    return capture;
  };

  const resolveMissingBodyType = async (capture) => {
    if (capture.bodyType || !globalThis.LunaGroq?.analyze) return capture;
    try {
      const result = await globalThis.LunaGroq.analyze({
        facts: {
          make: capture.makeModel,
          model: capture.makeModel,
          year: capture.year
        },
        imageUrl: capture.imageUrl,
        task: "bodyType"
      });
      const aysheiBodyType =
        {
          Crossover: "SUV",
          "Pickup Truck": "Pickup",
          "Sports Car": "Others"
        }[result.bodyType] ||
        result.bodyType ||
        "";
      const allowed = [
        "Convertible",
        "Coupe",
        "Hatchback",
        "Minivan",
        "Others",
        "Pickup",
        "Sedan",
        "SUV",
        "Van",
        "Wagon"
      ];
      capture.bodyType = allowed.includes(aysheiBodyType) ? aysheiBodyType : "";
      if (capture.bodyType) {
        capture.evidence.bodyType = {
          raw:
            result.bodyType === capture.bodyType
              ? capture.bodyType
              : `${result.bodyType} → ${capture.bodyType}`,
          source: `${result.provider || result.model || "AI"} classification from verified vendor facts · ${result.confidence || "review"} confidence`,
          state: "review"
        };
      }
    } catch (error) {
      // Keep the field blank for agent review when bounded classification fails.
    }
    return capture;
  };

  const inferredFieldConfigs = Object.freeze([
    {
      candidates: [
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
        "Yellow"
      ],
      field: "exteriorColor",
      label: "Exterior Color",
      requiresImage: true,
      useImage: true
    },
    {
      candidates: ["Gasoline", "Electric", "Hybrid", "Diesel"],
      field: "fuelType",
      label: "Fuel Type"
    },
    {
      candidates: ["Automatic", "Manual"],
      field: "transmission",
      label: "Transmission Type"
    },
    {
      candidates: [
        "GCC",
        "American",
        "Canadian",
        "Chinese",
        "European",
        "Japanese",
        "Korean",
        "Other"
      ],
      field: "regionalSpec",
      label: "Regional Spec"
    }
  ]);

  const resolveMissingFields = async (capture) => {
    if (!globalThis.LunaGroq?.analyze) return capture;
    for (const config of inferredFieldConfigs) {
      if (config.field === "exteriorColor" && capture.exteriorColor === "Other") {
        capture.exteriorColor = "";
      }
      if (capture[config.field]) continue;
      const reported = capture.evidence?.[config.field]?.raw || "";
      if (config.requiresImage && (!capture.imageUrl || /^green$/i.test(reported))) continue;
      if (
        config.field === "regionalSpec" &&
        !/\b(?:gcc|gulf|american|usa|canadian|chinese|european|japanese|korean|regional|spec)\b/i.test(
          `${reported} ${(capture.specs || []).join(" ")} ${capture.descriptionSource || ""}`
        )
      )
        continue;
      if (
        ["fuelType", "transmission"].includes(config.field) &&
        !(capture.descriptionSource || (capture.specs || []).length)
      )
        continue;
      try {
        const result = await globalThis.LunaGroq.analyze({
          candidates: config.candidates.map((label) => ({
            id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            label
          })),
          facts: {
            context: (capture.specs || []).join(" · "),
            field: config.label,
            make: capture.makeModel,
            model: capture.makeModel,
            reported,
            summary: capture.description || capture.descriptionSource,
            year: capture.year
          },
          imageUrl: config.useImage ? capture.imageUrl : "",
          task: "field"
        });
        if (config.requiresImage && !result.imageUsed) continue;
        const value = result.candidate?.label || "";
        if (!config.candidates.includes(value)) continue;
        capture[config.field] = value;
        capture.evidence[config.field] = {
          raw: `${reported || "No exact page value"} → ${value}`,
          source: `${result.provider || result.model || "AI"} bounded inference from page facts${result.imageUsed ? " and vehicle image" : ""} · ${result.confidence || "low"} confidence · agent review required`,
          state: "review"
        };
      } catch (error) {
        // Leave the field blank rather than accepting an unvalidated AI value.
      }
    }
    return capture;
  };

  const renderModelResults = (models) => {
    modelResults.replaceChildren();
    models.slice(0, 12).forEach((model) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = model.label;
      button.addEventListener("click", () =>
        selectModel(model).catch((error) => {
          modelStatus.textContent = error.message;
        })
      );
      modelResults.append(button);
    });
  };

  const selectModel = async (model) => {
    draft.makeModel = model.label;
    draft.makeCode = model.makeCode;
    draft.modelCode = model.modelCode;
    draft.availableModels = [];
    setEvidence("makeModel", model.label, "Agent selected from Mirror catalog", "confirmed");
    fields.makeModel.value = model.label;
    modelResults.replaceChildren();
    modelStatus.textContent = "Loading trims…";
    draft.availableTrims = await loadMirrorTrims(model, draft);
    const trimCandidates = globalThis.LunaManualAdCore.preferGccCompatibleTrims(
      draft.availableTrims,
      draft.regionalSpec
    );
    const trim =
      globalThis.LunaManualAdCore.chooseTrim(trimCandidates, draft.trim) ||
      globalThis.LunaManualAdCore.chooseUniqueCatalogMatch(trimCandidates, [draft.trim]);
    draft.trim = trim?.label || "";
    draft.trimCode = trim?.trimCode ?? null;
    modelStatus.textContent = "";
    renderTrimOptions();
    renderValidation();
    await saveDraft();
  };

  const searchModels = async () => {
    if (!draft) return;
    const keyword = fields.makeModel.value.trim();
    if (keyword.length < 2) {
      modelStatus.textContent = "Type at least 2 characters";
      modelResults.replaceChildren();
      return;
    }
    const request = ++modelSearchRequest;
    modelStatus.textContent = "Searching models…";
    try {
      const yearCode = await resolveMirrorYear(draft);
      const response = await globalThis.LunaAyshei.searchModelsFromMirror(keyword, yearCode);
      if (request !== modelSearchRequest) return;
      draft.availableModels = (response.models || []).slice(0, 20);
      renderModelResults(draft.availableModels);
      modelStatus.textContent = draft.availableModels.length
        ? "Choose the correct model below."
        : "No model found. Try another name.";
    } catch (error) {
      if (request === modelSearchRequest) {
        modelStatus.textContent = error.message;
        modelResults.replaceChildren();
      }
    }
  };

  const prepare = async () => {
    const run = ++prepareRun;
    let preparedImages = { detail: "No car images were collected.", imageCount: 0, isReady: false };
    let vendorPreviewShown = false;
    prepareBusy = true;
    startButton.disabled = true;
    setStatus("working", "Reading");
    setMessage("Checking the open Ayshei form, then reading the vendor ad.");
    try {
      await clearCompletedWorkflow();
      const sourceDraft = await withTimeout(
        (async () => {
          const tab = await getCurrentTab();
          const targetTab = await findAysheiTargetTab(tab);
          const aysheiLayout = await inspectAysheiTab(targetTab);
          const origins = ["https://*/*"];
          const hasAccess = await chrome.permissions.contains({ origins });
          if (!hasAccess && !(await chrome.permissions.request({ origins }))) {
            throw new Error(
              "Website access is required so Luna can read this vendor page after you click Prepare."
            );
          }
          const rawCapture = await captureVendorPage(tab.id);
          let nextDraft = globalThis.LunaManualAdCore.sanitizeCapture(rawCapture);
          nextDraft.imagesImported = false;
          nextDraft.imagesImportedCount = 0;
          nextDraft.category = aysheiLayout.used
            ? "USED"
            : nextDraft.category === "EXPORT"
              ? "EXPORT"
              : "NEW";
          nextDraft.targetUsedLayout = aysheiLayout.used;
          nextDraft.kilometers = aysheiLayout.used
            ? globalThis.LunaManualAdCore.parseKilometers(rawCapture.kilometers)
            : "";
          nextDraft.condition = aysheiLayout.used
            ? "Very Good - No accidents, very few faults"
            : "";
          return nextDraft;
        })(),
        30000,
        "Reading the vendor page took too long. Click Get Data again."
      );
      if (run !== prepareRun) return;
      draft = sourceDraft;
      await saveDraft();
      render();
      vendorPreviewShown = true;
      setStatus("working", "Page ready");
      setMessage(
        "Vendor facts are shown now. Luna is checking only missing details; you can review the fields while it works."
      );
      const imagePromise = withTimeout(
        globalThis.LunaImageScraper.collectForManualAd(),
        10000,
        "Image collection took too long. Vehicle data is still available."
      ).catch((error) => ({ detail: error.message, imageCount: 0, isReady: false }));
      const enriched = JSON.parse(JSON.stringify(sourceDraft));
      const enrichmentPromise = withTimeout(
        (async () => {
          await improveMissingDescription(enriched);
          await resolveVehicle(enriched);
          await resolveGreenShade(enriched);
          await resolveMissingBodyType(enriched);
          await resolveMissingFields(enriched);
          return enriched;
        })(),
        30000,
        "AI and catalog checks timed out; vendor facts remain available."
      );
      const [images, enrichment] = await Promise.all([
        imagePromise,
        enrichmentPromise.catch((error) => ({ error }))
      ]);
      if (run !== prepareRun || !draft || draft.sourceUrl !== sourceDraft.sourceUrl) return;
      preparedImages = images;
      const merge = enrichment.error
        ? null
        : globalThis.LunaManualAdCore.mergeEnrichment(sourceDraft, draft, enrichment);
      if (!enrichment.error) {
        draft = merge.draft;
        await saveDraft();
      }
      render();
      const validation = globalThis.LunaManualAdCore.validateDraft(draft);
      const workflowReady = validation.isReady && preparedImages.isReady;
      setStatus(workflowReady ? "ready" : "review", workflowReady ? "Ready" : "Review");
      const aiChanged = Object.entries(draft.evidence || {})
        .filter(([field, item]) => fieldLabels[field] && draft[field] && isAiEvidence(item))
        .map(([field]) => field);
      const aiBrief = aiChanged.length
        ? ` AI added ${aiChanged.map((field) => fieldLabels[field]).join(", ")}.`
        : " AI added no fields; existing vendor facts were kept.";
      setMessage(
        validation.isReady && preparedImages.isReady
          ? `Vendor data and ${preparedImages.imageCount} images are ready.${aiBrief} Review them, then fill the open Ayshei ad.`
          : validation.isReady
            ? `Vendor data is ready.${aiBrief} Car images need review: ${preparedImages.detail}`
            : `Vendor data is ready.${aiBrief} Check the red fields: ${validation.missing.join(", ")}.${enrichment.error ? ` ${enrichment.error.message}` : ""}`,
        workflowReady ? "success" : "warning"
      );
    } catch (error) {
      if (run !== prepareRun) return;
      setStatus(vendorPreviewShown ? "review" : "failed", vendorPreviewShown ? "Review" : "Failed");
      setMessage(error.message, "error");
    } finally {
      if (run !== prepareRun) return;
      prepareBusy = false;
      startButton.disabled = false;
      renderValidation();
    }
  };

  const panelLabels = Object.freeze([
    "description",
    "overview",
    "specification",
    "specifications",
    "specs",
    "details",
    "features",
    "vehicle details",
    "vehicle overview",
    "vehicle specifications",
    "car details",
    "car overview",
    "car specifications"
  ]);

  const inspectVendorPanels = async (tabId) => {
    const result = await chrome.scripting.executeScript({
      args: [panelLabels],
      func: (allowedLabels) => {
        const normalizeLabel = (value) =>
          String(value || "")
            .toLocaleLowerCase("en")
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
        const allowed = new Set(allowedLabels);
        const controls = [
          ...document.querySelectorAll("[role='tab'],button,summary,a[href^='#']")
        ].filter((element) => {
          const label = normalizeLabel(element.textContent || element.getAttribute("aria-label"));
          if (!allowed.has(label)) return false;
          if (element instanceof HTMLButtonElement && element.type === "submit") return false;
          if (element instanceof HTMLAnchorElement) {
            const href = element.getAttribute("href") || "";
            if (!href.startsWith("#") || href.length < 2) return false;
          }
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        });
        return controls
          .map((element) => ({
            active:
              element.getAttribute("aria-selected") === "true" ||
              element.getAttribute("aria-expanded") === "true" ||
              element.classList.contains("active"),
            label: normalizeLabel(element.textContent || element.getAttribute("aria-label"))
          }))
          .filter(
            (item, index, items) =>
              items.findIndex((candidate) => candidate.label === item.label) === index
          )
          .slice(0, 5);
      },
      target: { tabId }
    });
    return result?.[0]?.result || [];
  };

  const activateVendorPanel = async (tabId, label) => {
    const result = await chrome.scripting.executeScript({
      args: [panelLabels, label],
      func: async (allowedLabels, wantedLabel) => {
        const normalizeLabel = (value) =>
          String(value || "")
            .toLocaleLowerCase("en")
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
        const allowed = new Set(allowedLabels);
        const control = [
          ...document.querySelectorAll("[role='tab'],button,summary,a[href^='#']")
        ].find((element) => {
          const normalized = normalizeLabel(
            element.textContent || element.getAttribute("aria-label")
          );
          if (normalized !== wantedLabel || !allowed.has(normalized)) return false;
          if (element instanceof HTMLButtonElement && element.type === "submit") return false;
          if (element instanceof HTMLAnchorElement) {
            const href = element.getAttribute("href") || "";
            if (!href.startsWith("#") || href.length < 2) return false;
          }
          return true;
        });
        if (!control) return false;
        control.click();
        await new Promise((resolve) => setTimeout(resolve, 180));
        return true;
      },
      target: { tabId }
    });
    return result?.[0]?.result === true;
  };

  const captureCurrentVendorPanel = async (tabId) => {
    const result = await chrome.scripting.executeScript({
      files: [
        "src/features/manual-ad/manual-ad-price-core.js",
        "src/features/manual-ad/manual-ad-description-core.js",
        "src/features/manual-ad/manual-ad-source.js"
      ],
      target: { tabId }
    });
    return result?.[0]?.result || null;
  };

  const captureVendorPage = async (tabId) => {
    const captures = [];
    const first = await captureCurrentVendorPanel(tabId);
    if (first) captures.push(first);
    const panels = await inspectVendorPanels(tabId);
    const original = panels.find((panel) => panel.active)?.label || "";
    try {
      for (const panel of panels) {
        if (panel.active || !(await activateVendorPanel(tabId, panel.label))) continue;
        const capture = await captureCurrentVendorPanel(tabId);
        if (capture) captures.push(capture);
      }
    } finally {
      if (original) await activateVendorPanel(tabId, original).catch(() => {});
    }
    const merged = globalThis.LunaManualAdCore.mergeCaptures(captures);
    if (!merged?.sourceUrl) {
      throw new Error("The vendor page did not return advertisement details.");
    }
    return merged;
  };

  const findAysheiTargetTab = async (referenceTab = null) => {
    const activeTab =
      referenceTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    const tabs = await chrome.tabs.query({ url: "https://marketplace.example.invalid/place-ad/*" });
    const stepTwoTabs = tabs.filter((tab) => {
      try {
        const url = new URL(tab.url);
        return (
          url.hostname === "marketplace.example.invalid" &&
          url.pathname.startsWith("/place-ad/") &&
          url.searchParams.get("step") === "2"
        );
      } catch (error) {
        return false;
      }
    });
    if (!stepTwoTabs.length) {
      throw new Error("Open an Ayshei place-ad tab at step 2 first.");
    }
    return stepTwoTabs.sort((left, right) => {
      const leftSameWindow = left.windowId === activeTab?.windowId ? 0 : 1;
      const rightSameWindow = right.windowId === activeTab?.windowId ? 0 : 1;
      if (leftSameWindow !== rightSameWindow) return leftSameWindow - rightSameWindow;
      if (left.active !== right.active) return left.active ? -1 : 1;
      return (
        Math.abs((left.index ?? 0) - (activeTab?.index ?? 0)) -
        Math.abs((right.index ?? 0) - (activeTab?.index ?? 0))
      );
    })[0];
  };

  const inspectAysheiTab = async (tab) => {
    await chrome.scripting.executeScript({
      files: ["src/features/manual-ad/manual-ad-fill.js"],
      target: { tabId: tab.id }
    });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "luna.manualAd.inspect.v4" });
    if (!response?.ok)
      throw new Error(response?.detail || "Could not read the Ayshei step-2 form.");
    return response.result;
  };

  const fillAysheiVehicleDependencies = async (tabId, reviewedDraft) => {
    const execution = await chrome.scripting.executeScript({
      args: [
        {
          makeModel: reviewedDraft.makeModel,
          trim: reviewedDraft.trim,
          year: reviewedDraft.year
        }
      ],
      func: async (vehicle) => {
        const clean = (value) =>
          String(value ?? "")
            .trim()
            .replace(/\s+/g, " ");
        const normalize = (value) =>
          clean(value)
            .toLocaleLowerCase("en")
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
        const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
        const visible = (element) => {
          if (!element) return false;
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        };
        const waitFor = async (read, expected, attempts = 160) => {
          for (let attempt = 0; attempt < attempts; attempt += 1) {
            const values = [].concat(read()).map(clean);
            if (values.some((value) => normalize(value) === normalize(expected))) return true;
            await delay(50);
          }
          return false;
        };
        const open = (element) => {
          element.focus();
          element.dispatchEvent(
            new MouseEvent("mousedown", {
              bubbles: true,
              button: 0,
              buttons: 1,
              cancelable: true,
              view: window
            })
          );
          element.click();
        };
        const findExactOption = (trigger, choice) => {
          if (!trigger) return null;
          const controlledId = trigger.getAttribute("aria-controls");
          const controlled = controlledId ? document.getElementById(controlledId) : null;
          const listbox =
            controlled || [...document.querySelectorAll("[role='listbox']")].filter(visible).at(-1);
          const matches = [...(listbox || document).querySelectorAll("[role='option'],li")]
            .filter(visible)
            .filter((option) => normalize(option.textContent) === normalize(choice));
          return matches.length === 1 ? matches[0] : null;
        };
        const autocompleteIsOpen = (trigger) => {
          if (!trigger) return false;
          if (trigger.getAttribute("aria-expanded") === "true") return true;
          const controlledId = trigger.getAttribute("aria-controls");
          return Boolean(controlledId && visible(document.getElementById(controlledId)));
        };
        const exactOption = async (trigger, choice, attempts = 160) => {
          for (let attempt = 0; attempt < attempts; attempt += 1) {
            const match = findExactOption(trigger, choice);
            if (match) return match;
            await delay(50);
          }
          return null;
        };
        const selectMui = async (triggerSelector, hiddenSelector, choice) => {
          const trigger = document.querySelector(triggerSelector);
          const hidden = document.querySelector(hiddenSelector);
          if (!trigger || !visible(trigger)) return false;
          if (
            [trigger.textContent, hidden?.value].some(
              (value) => normalize(value) === normalize(choice)
            )
          ) {
            return true;
          }
          open(trigger);
          const option = await exactOption(trigger, choice, 120);
          if (!option) return false;
          option.click();
          return waitFor(() => [trigger.textContent, hidden?.value], choice, 80);
        };
        const reactProps = (element) => {
          if (!element) return null;
          const key = Object.getOwnPropertyNames(element).find(
            (name) => name.startsWith("__reactProps$") || name.startsWith("__reactEventHandlers$")
          );
          return key ? element[key] : null;
        };
        const reactEvent = (element, type, extra = {}) => {
          let defaultPrevented = false;
          let propagationStopped = false;
          return {
            bubbles: true,
            cancelable: true,
            currentTarget: element,
            target: element,
            type,
            ...extra,
            nativeEvent: { target: element, type, ...extra },
            preventDefault() {
              defaultPrevented = true;
            },
            isDefaultPrevented() {
              return defaultPrevented;
            },
            stopPropagation() {
              propagationStopped = true;
            },
            isPropagationStopped() {
              return propagationStopped;
            },
            persist() {}
          };
        };
        const callReactHandler = (element, handlerName, type, extra = {}) => {
          const handler = reactProps(element)?.[handlerName];
          if (typeof handler !== "function") return false;
          try {
            handler(reactEvent(element, type, extra));
            return true;
          } catch {
            return false;
          }
        };
        const setReactInput = (input, value) => {
          const previous = input.value;
          const ownSetter = Object.getOwnPropertyDescriptor(input, "value")?.set;
          const prototypeSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          )?.set;
          const setter =
            ownSetter && ownSetter !== prototypeSetter
              ? prototypeSetter
              : ownSetter || prototypeSetter;
          setter.call(input, value);
          input._valueTracker?.setValue(previous);
          if (callReactHandler(input, "onChange", "change")) return true;
          input.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              composed: true,
              data: value,
              inputType: "insertText"
            })
          );
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return false;
        };
        const writeReactAutocomplete = (input, value) => {
          input.focus();
          input.select();
          setReactInput(input, String(value));
          input.dispatchEvent(
            new KeyboardEvent("keyup", {
              bubbles: true,
              composed: true,
              key: String(value).slice(-1)
            })
          );
        };
        const requestAutocompleteOptions = (input) => {
          input.focus();
          const keyboard = {
            code: "ArrowDown",
            key: "ArrowDown",
            keyCode: 40,
            which: 40
          };
          if (!callReactHandler(input, "onKeyDown", "keydown", keyboard)) {
            input.dispatchEvent(
              new KeyboardEvent("keydown", {
                bubbles: true,
                cancelable: true,
                composed: true,
                ...keyboard
              })
            );
          }
        };
        const commitAutocompleteOption = (option) => {
          if (!callReactHandler(option, "onClick", "click", { button: 0, buttons: 1 })) {
            option.click();
          }
        };

        if (!(await selectMui("#year", "input[name='year']", vehicle.year))) {
          return { detail: "The exact Year option was not confirmed.", ok: false, stage: "Year" };
        }

        const modelInput = () =>
          document.querySelector("input[name='makeAndModel'][role='combobox']");
        let input = null;
        for (let attempt = 0; attempt < 80; attempt += 1) {
          input = modelInput();
          if (input && visible(input) && !input.disabled) break;
          await delay(50);
        }
        if (!input) {
          return {
            detail: "The Make & Model search did not become ready after Year.",
            ok: false,
            stage: "Make & Model"
          };
        }

        const currentTrim = document.querySelector("#mui-component-select-trim");
        const modelAlreadyConfirmed =
          normalize(input.value) === normalize(vehicle.makeModel) &&
          currentTrim &&
          visible(currentTrim) &&
          currentTrim.getAttribute("aria-disabled") !== "true" &&
          !currentTrim.classList.contains("Mui-disabled");
        if (!modelAlreadyConfirmed) {
          let modelOption = null;
          let nextWriteAt = 0;
          let nextOpenAt = 0;
          let writeAttempts = 0;
          let modelTextSince = 0;
          for (let attempt = 0; attempt < 160; attempt += 1) {
            input = modelInput();
            if (input && visible(input) && !input.disabled) {
              const now = Date.now();
              if (
                normalize(input.value) !== normalize(vehicle.makeModel) &&
                !autocompleteIsOpen(input) &&
                now >= nextWriteAt &&
                writeAttempts < 2
              ) {
                writeReactAutocomplete(input, vehicle.makeModel);
                writeAttempts += 1;
                nextWriteAt = now + 1000;
              }
              input = modelInput() || input;
              if (normalize(input.value) === normalize(vehicle.makeModel)) {
                modelTextSince ||= now;
              } else {
                modelTextSince = 0;
              }
              modelOption = findExactOption(modelInput() || input, vehicle.makeModel);
              if (modelOption) break;
              if (
                normalize(input.value) === normalize(vehicle.makeModel) &&
                !autocompleteIsOpen(input) &&
                now - modelTextSince >= 650 &&
                now >= nextOpenAt
              ) {
                requestAutocompleteOptions(input);
                nextOpenAt = now + 1200;
              }
            }
            await delay(50);
          }
          if (!modelOption) {
            const retainedModel = modelInput()?.value?.trim();
            return {
              detail: `No single exact Ayshei model appeared for “${vehicle.makeModel}”. Ayshei kept “${retainedModel || "blank"}” in the search.`,
              ok: false,
              stage: "Make & Model"
            };
          }
          commitAutocompleteOption(modelOption);
          if (!(await waitFor(() => modelInput()?.value, vehicle.makeModel, 80))) {
            return {
              detail: "Ayshei did not confirm the exact model selection.",
              ok: false,
              stage: "Make & Model"
            };
          }
        }

        let trimTrigger = null;
        for (let attempt = 0; attempt < 160; attempt += 1) {
          trimTrigger = document.querySelector("#mui-component-select-trim");
          if (
            trimTrigger &&
            visible(trimTrigger) &&
            trimTrigger.getAttribute("aria-disabled") !== "true" &&
            !trimTrigger.classList.contains("Mui-disabled")
          )
            break;
          await delay(50);
        }
        if (!trimTrigger) {
          return {
            detail: "Trim did not become available after the exact model.",
            ok: false,
            stage: "Trim"
          };
        }
        if (!(await selectMui("#mui-component-select-trim", "input[name='trim']", vehicle.trim))) {
          return {
            detail: `The exact Trim “${vehicle.trim}” was not confirmed.`,
            ok: false,
            stage: "Trim"
          };
        }
        return {
          ok: true,
          stage: "Vehicle",
          trim: vehicle.trim,
          makeModel: vehicle.makeModel,
          year: vehicle.year
        };
      },
      target: { tabId },
      world: "MAIN"
    });
    const result = execution?.[0]?.result;
    return (
      result || {
        detail: "Ayshei did not return a vehicle-selection result.",
        ok: false,
        stage: "Vehicle"
      }
    );
  };

  const fillAyshei = async () => {
    syncDraftFromFields();
    const validation = renderValidation();
    if (fillBusy || !draft) return;
    if (!validation.isReady) {
      const proceed = globalThis.confirm(
        `Missing: ${validation.missing.join(", ")}.\n\nFill every available field anyway?`
      );
      if (!proceed) return;
    }
    fillBusy = true;
    render();
    setStatus("working", "Filling");
    setMessage("Filling available required fields and checking each value.");
    let imageUploadTask = null;
    try {
      const tab = await findAysheiTargetTab();
      const imageReview = globalThis.LunaImageScraper.getReview();
      let imagesConfirmed = draft.imagesImported === true;
      let importedImageCount =
        Number.isSafeInteger(draft.imagesImportedCount) && draft.imagesImportedCount >= 3
          ? draft.imagesImportedCount
          : imageReview.imageCount;
      let imageIssue = "";
      if (imagesConfirmed && importedImageCount < 3) {
        imagesConfirmed = false;
        draft.imagesImported = false;
        imageIssue = "The earlier image count cannot be verified; recheck the Ayshei gallery.";
        await saveDraft();
      }
      if (imagesConfirmed && importedImageCount >= 3) {
        try {
          await globalThis.LunaImageScraper.verifyOnAysheiTab(tab.id, importedImageCount);
        } catch (error) {
          imagesConfirmed = false;
          draft.imagesImported = false;
          imageIssue = error.message || "Ayshei no longer shows the vehicle images.";
          await saveDraft();
        }
      }
      if (!imagesConfirmed) {
        if (imageReview.isReady) {
          setMessage(`Preparing ${imageReview.imageCount} images for Ayshei…`);
          let markImagesSelected;
          const imageSelectedTask = new Promise((resolve) => {
            markImagesSelected = resolve;
          });
          imageUploadTask = globalThis.LunaImageScraper.uploadToAysheiTab(
            tab.id,
            markImagesSelected
          ).then(
            (result) => ({ result }),
            (error) => ({ error })
          );
          const handoff = await Promise.race([imageSelectedTask, imageUploadTask]);
          setMessage(
            handoff?.selected
              ? `${handoff.count} images added to Ayshei; filling vehicle details while they upload…`
              : "Image preparation or upload did not finish; filling the available vehicle details for review…"
          );
        } else {
          imageIssue = imageReview.detail;
        }
      }
      await chrome.scripting.executeScript({
        files: ["src/features/manual-ad/manual-ad-fill.js"],
        target: { tabId: tab.id }
      });
      const response = await withTimeout(
        chrome.tabs.sendMessage(tab.id, {
          draft,
          options: { skipVehicleDependencies: true },
          type: "luna.manualAd.fill.v4"
        }),
        20000,
        "Ayshei did not confirm the vehicle fields within 20 seconds. Review the open draft before retrying."
      );
      if (!response?.ok) {
        throw new Error(response?.detail || "Ayshei did not accept the reviewed fields.");
      }
      const fillResults = Array.isArray(response.result?.results)
        ? response.result.results.slice(0, 20)
        : [];
      let vehicleDependency = {
        detail:
          "Vehicle dependencies were not attempted because the Ayshei category layout did not match.",
        ok: false,
        stage: "Make & Model"
      };
      if (!response.result?.blocked && Number.isInteger(draft.yearCode) && draft.yearCode > 0) {
        try {
          vehicleDependency = await fillAysheiVehicleDependencies(tab.id, draft);
        } catch (error) {
          vehicleDependency = {
            detail: error.message || "Ayshei vehicle selection could not be confirmed.",
            ok: false,
            stage: "Make & Model"
          };
        }
      } else if (!response.result?.blocked) {
        vehicleDependency = {
          detail:
            "Vehicle dependencies were not attempted because the reviewed year was not confirmed against Ayshei's live catalog.",
          ok: false,
          stage: "Year"
        };
      }
      if (imageUploadTask) {
        const upload = await imageUploadTask;
        if (upload.error || upload.result?.retained !== true) {
          imageIssue =
            upload.error?.message || "Ayshei did not confirm that the images stayed visible.";
        } else {
          importedImageCount = upload.result.imported || imageReview.imageCount;
          draft.imagesImported = true;
          draft.imagesImportedCount = importedImageCount;
          imagesConfirmed = true;
          imageIssue = "";
          await saveDraft();
        }
      }
      if (imagesConfirmed && importedImageCount >= 3) {
        try {
          await globalThis.LunaImageScraper.verifyOnAysheiTab(tab.id, importedImageCount);
        } catch (error) {
          imagesConfirmed = false;
          draft.imagesImported = false;
          imageIssue = error.message || "Ayshei no longer shows the vehicle images.";
          await saveDraft();
        }
      }
      if (response.result?.filled && vehicleDependency.ok && imagesConfirmed) {
        setStatus("done", "Checked");
        setMessage(
          "Available required fields were filled and checked. Luna is ready for the next vendor ad; review Ayshei before continuing.",
          "success"
        );
        await clearCompletedWorkflow();
      } else {
        const fieldsToCheck = fillResults
          .filter((item) => !["Filled", "Unchanged"].includes(item.status))
          .map((item) => item.field);
        if (!vehicleDependency?.ok && vehicleDependency?.stage) {
          fieldsToCheck.push(vehicleDependency.stage);
          if (vehicleDependency.stage === "Make & Model") fieldsToCheck.push("Trim");
        }
        if (!imagesConfirmed) fieldsToCheck.push("Car Images");
        const uniqueFieldsToCheck = [...new Set(fieldsToCheck)];
        setStatus("review", "Review");
        setMessage(
          response.result?.blocked
            ? "Filling stopped before changing fields because the Ayshei category layout did not match this draft."
            : `Finished every available field. Check manually: ${uniqueFieldsToCheck.join(", ") || "the highlighted fields"}.${imageIssue ? ` ${imageIssue}` : ""}`,
          "warning"
        );
      }
    } catch (error) {
      if (imageUploadTask && draft) {
        const upload = await imageUploadTask;
        if (upload.result?.retained === true) {
          draft.imagesImported = true;
          draft.imagesImportedCount = upload.result.imported;
          await saveDraft().catch(() => {});
        }
      }
      setStatus("failed", "Failed");
      setMessage(error.message, "error");
    } finally {
      fillBusy = false;
      render();
    }
  };

  Object.entries(fields)
    .filter(([key]) => !["condition", "makeModel", "trim", "year"].includes(key))
    .forEach(([key, input]) => {
      const update = () => {
        syncDraftFromFields();
        setEvidence(key, draft[key], "Agent reviewed or edited", "confirmed");
        render();
        saveDraft().catch(() => {});
      };
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    });
  const updateYear = () => {
    if (!draft) return;
    const nextYear = fields.year.value.trim();
    if (nextYear !== draft.year) {
      globalThis.clearTimeout(modelSearchTimer);
      modelSearchRequest += 1;
      draft.year = nextYear;
      draft.yearCode = null;
      draft.makeCode = null;
      draft.modelCode = null;
      draft.availableModels = [];
      draft.trim = "";
      draft.trimCode = null;
      draft.availableTrims = [];
      modelResults.replaceChildren();
      renderTrimOptions();
    }
    setEvidence("year", nextYear, "Agent reviewed or edited", "confirmed");
    modelStatus.textContent = nextYear
      ? "Type a model to search this year only."
      : "Enter a year before searching models.";
    renderValidation();
    saveDraft().catch(() => {});
  };
  fields.year.addEventListener("input", updateYear);
  fields.year.addEventListener("change", updateYear);
  fields.makeModel.addEventListener("input", () => {
    if (!draft) return;
    draft.makeModel = fields.makeModel.value.trim();
    draft.makeCode = null;
    draft.modelCode = null;
    draft.availableModels = [];
    draft.trim = "";
    draft.trimCode = null;
    draft.availableTrims = [];
    renderTrimOptions();
    renderValidation();
    saveDraft().catch(() => {});
    globalThis.clearTimeout(modelSearchTimer);
    modelSearchTimer = globalThis.setTimeout(searchModels, 350);
  });
  fields.trim.addEventListener("change", () => {
    if (!draft) return;
    const selected = draft.availableTrims.find((trim) => trim.label === fields.trim.value);
    draft.trim = selected?.label || "";
    draft.trimCode = selected?.trimCode ?? null;
    if (selected)
      setEvidence("trim", selected.label, "Agent selected from Mirror catalog", "confirmed");
    renderValidation();
    saveDraft().catch(() => {});
  });
  startButton.addEventListener("click", prepare);
  fillAysheiButton.addEventListener("click", fillAyshei);

  chrome.storage.local
    .get({ [storageKey]: null })
    .then((saved) => {
      if (saved[storageKey]) {
        const savedDraft = saved[storageKey];
        draft = globalThis.LunaManualAdCore.sanitizeCapture(savedDraft);
        draft.imagesImported = savedDraft.imagesImported === true;
        draft.imagesImportedCount = Number.isSafeInteger(savedDraft.imagesImportedCount)
          ? savedDraft.imagesImportedCount
          : 0;
        if (savedDraft.targetUsedLayout === true) {
          draft.category = "USED";
          draft.kilometers = globalThis.LunaManualAdCore.parseKilometers(savedDraft.kilometers);
          draft.condition = "Very Good - No accidents, very few faults";
        }
        draft.targetUsedLayout = savedDraft.targetUsedLayout === true;
      }
      render();
    })
    .catch(() => render());

  return Object.freeze({
    onSectionShown(sectionId) {
      if (sectionId === "manual-ad-assistant") render();
    },
    render
  });
})();
