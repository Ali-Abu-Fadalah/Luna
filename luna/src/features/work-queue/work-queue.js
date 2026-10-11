globalThis.LunaWorkQueue = (() => {
  const storageKey = globalThis.LunaFoundation?.storageKeys.workQueue || "luna.workQueue.v1";
  const adTabStorageKey =
    globalThis.LunaFoundation?.storageKeys.workQueueAdTab || "luna.workQueue.adTabId";
  const storageArea = globalThis.chrome?.storage?.local;
  const sessionStorageArea = globalThis.chrome?.storage?.session;
  const importDetails = document.querySelector("#queue-import-details");
  const importText = document.querySelector("#queue-import-text");
  const startButton = document.querySelector("#queue-start");
  const importMessage = document.querySelector("#queue-import-message");
  const importPreview = document.querySelector("#queue-import-preview");
  const importSummary = document.querySelector("#queue-import-summary");
  const importWarning = document.querySelector("#queue-import-warning");
  const confirmImport = document.querySelector("#queue-confirm-import");
  const cancelImport = document.querySelector("#queue-cancel-import");
  const workspace = document.querySelector("#queue-workspace");
  const progressTitle = document.querySelector("#queue-progress-title");
  const currentStatus = document.querySelector("#queue-current-status");
  const viewSelect = document.querySelector("#queue-view-select");
  const panels = [...document.querySelectorAll("[data-queue-panel-view]")];
  const adNumber = document.querySelector("#queue-ad-number");
  const adVendor = document.querySelector("#queue-ad-vendor");
  const adName = document.querySelector("#queue-ad-name");
  const adUrl = document.querySelector("#queue-ad-url");
  const openUrlButton = document.querySelector("#queue-open-url");
  const openUrlHint = document.querySelector("#queue-open-hint");
  const listedFieldsKicker = document.querySelector("#queue-listed-fields-kicker");
  const motorsListedFields = document.querySelector("#queue-motors-listed-fields");
  const noonListedFields = document.querySelector("#queue-noon-listed-fields");
  const listedCategory = document.querySelector("#queue-listed-category");
  const listedMakeModel = document.querySelector("#queue-listed-make-model");
  const listedTrim = document.querySelector("#queue-listed-trim");
  const listedTrimCopy = document.querySelector("#queue-listed-trim-copy");
  const queueModelStatus = document.querySelector("#queue-ayshei-model-status");
  const queueModelMessage = document.querySelector("#queue-ayshei-model-message");
  const queueModelResults = document.querySelector("#queue-ayshei-model-results");
  const queueTrimStatus = document.querySelector("#queue-ayshei-trim-status");
  const queueTrimMessage = document.querySelector("#queue-ayshei-trim-message");
  const listedColor = document.querySelector("#queue-listed-color");
  const colorSwatch = document.querySelector("#queue-color-swatch");
  const listedSpecs = document.querySelector("#queue-listed-specs");
  const listedSpecsField = document.querySelector("#queue-listed-specs-field");
  const listedTransmission = document.querySelector("#queue-listed-transmission");
  const listedTransmissionField = document.querySelector("#queue-listed-transmission-field");
  const noonCategory = document.querySelector("#queue-noon-category");
  const noonSubCategory = document.querySelector("#queue-noon-sub-category");
  const noonSubSubCategory = document.querySelector("#queue-noon-sub-sub-category");
  const noonCondition = document.querySelector("#queue-noon-condition");
  const unlistedReason = document.querySelector("#queue-unlisted-reason");
  const reasonOptions = document.querySelector("#queue-reason-options");
  const frequentReasons = document.querySelector("#queue-frequent-reasons");
  const reasonSuggestions = document.querySelector("#queue-reason-suggestions");
  const reasonMatchStatus = document.querySelector("#queue-reason-match-status");
  const markListed = document.querySelector("#queue-mark-listed");
  const markUnlisted = document.querySelector("#queue-mark-unlisted");
  const markReview = document.querySelector("#queue-mark-review");
  const actionMessage = document.querySelector("#queue-action-message");
  const previousButton = document.querySelector("#queue-previous");
  const nextButton = document.querySelector("#queue-next");
  const undoButton = document.querySelector("#queue-undo");
  const goNumber = document.querySelector("#queue-go-number");
  const goButton = document.querySelector("#queue-go");
  const listedOutput = document.querySelector("#queue-listed-output");
  const listedOutputNote = document.querySelector("#queue-listed-output-note");
  const copyListed = document.querySelector("#queue-copy-listed");
  const unlistedOutput = document.querySelector("#queue-unlisted-output");
  const unlistedOutputNote = document.querySelector("#queue-unlisted-output-note");
  const copyUnlisted = document.querySelector("#queue-copy-unlisted");
  const reviewList = document.querySelector("#queue-review-list");
  const reviewOutput = document.querySelector("#queue-review-output");
  const reviewOutputNote = document.querySelector("#queue-review-output-note");
  const copyReview = document.querySelector("#queue-copy-review");
  const pendingList = document.querySelector("#queue-pending-list");
  const pendingOutput = document.querySelector("#queue-pending-output");
  const pendingOutputNote = document.querySelector("#queue-pending-output-note");
  const copyPending = document.querySelector("#queue-copy-pending");
  const queueFilter = document.querySelector("#queue-filter");
  const autoFillButton = document.querySelector("#queue-auto-fill");
  const autoFillMessage = document.querySelector("#queue-auto-fill-message");
  const sourcePreview = document.querySelector("#queue-source-preview");
  const sourceFacts = document.querySelector("#queue-source-facts");
  const aiBodyTypeButton = document.querySelector("#queue-ai-body-type");
  const aiModelTrimButton = document.querySelector("#queue-ai-model-trim");
  const aiFillButton = document.querySelector("#queue-ai-fill");
  const aiResult = document.querySelector("#queue-ai-result");
  const vehicleAiTools = document.querySelector("#queue-vehicle-ai-tools");
  const queueNoteText = document.querySelector("#queue-note-text");
  const queueAddNote = document.querySelector("#queue-add-note");
  const queueNoteMessage = document.querySelector("#queue-note-message");

  const countElements = {
    listed: document.querySelector("#queue-count-listed"),
    pending: document.querySelector("#queue-count-pending"),
    reviewLater: document.querySelector("#queue-count-review"),
    unlisted: document.querySelector("#queue-count-unlisted")
  };
  const listedInputs = [
    listedCategory,
    listedMakeModel,
    listedTrim,
    listedColor,
    listedSpecs,
    listedTransmission
  ];
  const statusLabels = {
    listed: "Listed",
    pending: "Pending",
    review_later: "Review Later",
    unlisted: "Unlisted"
  };
  const colorValues = {
    Beige: "#cbb994",
    Black: "#15161a",
    "Black matt": "#25262a",
    Blue: "#477bb7",
    Blueberry: "#4f568f",
    Brown: "#795548",
    Cyan: "#65cbd1",
    "Dark Green": "#315c46",
    "Dark Grey": "#555b66",
    Grey: "#8a9099",
    "Light Green": "#83bd83",
    Orange: "#d9824d",
    Other: "linear-gradient(135deg, #cfc6e3, #a7c7e7, #e06c75)",
    Pink: "#d997ad",
    Purple: "#8f70aa",
    Red: "#b9555d",
    Silver: "#aeb6c2",
    White: "#e2e6f0",
    "White Pearl": "#ddd7e7",
    Yellow: "#d7bd59"
  };

  let queue = {
    ads: [],
    currentIndex: 0,
    history: [],
    reasonUsage: [],
    version: 1
  };
  let sheetRows = [];
  let currentReasonBaseline = "";
  let persistTimer = null;
  let adTabId = null;
  let queueModelDebounce = null;
  let queueVehicleRequest = 0;
  let pendingImport = null;
  const aiCache = new Map();
  const aiRecommendations = new Map();
  const vendorCaptures = new Map();
  let autoFillRun = 0;

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const persist = async () => {
    if (!storageArea) {
      return;
    }

    queue.updatedAt = new Date().toISOString();
    await storageArea.set({ [storageKey]: queue });
  };

  const schedulePersist = () => {
    globalThis.clearTimeout(persistTimer);
    persistTimer = globalThis.setTimeout(() => {
      persist().catch((error) => {
        console.error("Unable to save the Luna Work Queue:", error);
      });
    }, 180);
  };

  const getCurrentAd = () => queue.ads[queue.currentIndex] || null;
  const isDubiCarsAd = (ad = getCurrentAd()) =>
    globalThis.LunaWorkQueueCore.isDubiCarsUrl(ad?.source?.url);
  const isNoonAd = (ad = getCurrentAd()) => globalThis.LunaWorkQueueCore.isNoonUrl(ad?.source?.url);

  const matchesFilter = (ad, filter = queueFilter?.value || "all") => {
    if (filter === "all") return true;
    if (filter === "attention") return Array.isArray(ad?.attention) && ad.attention.length > 0;
    return ad?.status === filter;
  };

  const visibleIndexes = () =>
    queue.ads
      .map((ad, index) => ({ ad, index }))
      .filter(({ ad }) => matchesFilter(ad))
      .map(({ index }) => index);

  const moveVisible = (direction) => {
    const indexes = visibleIndexes();
    const position = indexes.indexOf(queue.currentIndex);
    const target = indexes[position + direction];
    if (Number.isInteger(target)) queue.currentIndex = target;
  };

  const forgetAdTab = async () => {
    adTabId = null;
    if (sessionStorageArea?.remove) {
      await sessionStorageArea.remove(adTabStorageKey);
    }
  };

  const openOrUpdateAdTab = async ({ createIfMissing = false } = {}) => {
    const url = getCurrentAd()?.source.url;

    if (!url) {
      return;
    }

    if (adTabId !== null && globalThis.chrome?.tabs?.update) {
      try {
        await globalThis.chrome.tabs.update(adTabId, { active: true, url });
        openUrlHint.textContent = "Dedicated ad tab updated";
        return;
      } catch (error) {
        await forgetAdTab();
      }
    }

    if (!createIfMissing) {
      return;
    }

    if (globalThis.chrome?.tabs?.create) {
      const createdTab = await globalThis.chrome.tabs.create({ active: true, url });
      adTabId = Number.isInteger(createdTab?.id) ? createdTab.id : null;
      if (adTabId !== null && sessionStorageArea?.set) {
        await sessionStorageArea.set({ [adTabStorageKey]: adTabId });
      }
      openUrlHint.textContent = "This tab will be reused for every ad";
      return;
    }

    globalThis.open(url, "_blank", "noopener,noreferrer");
  };

  const syncOpenAdTab = () => {
    openOrUpdateAdTab().catch((error) => {
      console.error("Unable to update the Luna advertisement tab:", error);
    });
  };

  const getUaeDate = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "numeric",
      timeZone: "Asia/Dubai",
      year: "numeric"
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
    );

    return `${Number(values.month)}/${Number(values.day)}/${values.year}`;
  };

  const updateColorSwatch = () => {
    colorSwatch.style.background = colorValues[listedColor.value] || "transparent";
    colorSwatch.dataset.hasColor = String(Boolean(listedColor.value));
  };

  const ensureVehicleFields = (ad) => {
    ad.listed.availableTrims = Array.isArray(ad.listed.availableTrims)
      ? ad.listed.availableTrims
      : [];
    ad.listed.makeCode = Number.isInteger(ad.listed.makeCode) ? ad.listed.makeCode : null;
    ad.listed.modelCode = Number.isInteger(ad.listed.modelCode) ? ad.listed.modelCode : null;
    ad.listed.trimCode = Number.isInteger(ad.listed.trimCode) ? ad.listed.trimCode : null;
    ad.listed.verifiedAt = ad.listed.verifiedAt || "";
    ad.listed.noonCategory = ad.listed.noonCategory || "";
    ad.listed.noonCondition = globalThis.LunaWorkQueueCore.NOON_CONDITION;
    ad.listed.noonSubCategory = ad.listed.noonSubCategory || "";
    ad.listed.noonSubSubCategory = ad.listed.noonSubSubCategory || "";
    return ad.listed;
  };

  const populateNoonSelect = (select, values, placeholder, selectedValue) => {
    select.replaceChildren();

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = placeholder;
    select.append(placeholderOption);

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    });

    select.value = values.includes(selectedValue) ? selectedValue : "";
    select.disabled = values.length === 0;
  };

  const renderNoonFields = (listed) => {
    const categories = globalThis.LunaWorkQueueCore.getNoonCategories();
    populateNoonSelect(noonCategory, categories, "Choose category", listed.noonCategory);

    const subCategories = globalThis.LunaWorkQueueCore.getNoonSubCategories(noonCategory.value);
    populateNoonSelect(
      noonSubCategory,
      subCategories,
      noonCategory.value ? "Choose sub-category" : "Choose category first",
      listed.noonSubCategory
    );

    const subSubCategories = globalThis.LunaWorkQueueCore.getNoonSubSubCategories(
      noonCategory.value,
      noonSubCategory.value
    );
    populateNoonSelect(
      noonSubSubCategory,
      subSubCategories,
      noonSubCategory.value ? "Choose sub-sub-category" : "Choose sub-category first",
      listed.noonSubSubCategory
    );
    noonCondition.value = globalThis.LunaWorkQueueCore.NOON_CONDITION;
  };

  const setQueueLiveState = (element, source, label) => {
    element.dataset.source = source;
    element.textContent = label;
  };

  const renderQueueTrims = () => {
    const ad = getCurrentAd();
    listedTrim.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose a live trim";
    listedTrim.append(placeholder);

    if (!ad) {
      listedTrim.disabled = true;
      listedTrimCopy.value = "";
      listedTrimCopy.placeholder = "Choose model first";
      return;
    }

    const listed = ensureVehicleFields(ad);
    listed.availableTrims.forEach((trim) => {
      const option = document.createElement("option");
      option.value = trim.label;
      option.textContent = trim.label;
      option.dataset.trimCode = String(trim.trimCode);
      listedTrim.append(option);
    });

    if (listed.trim && !listed.availableTrims.some((trim) => trim.label === listed.trim)) {
      const savedOption = document.createElement("option");
      savedOption.value = listed.trim;
      savedOption.textContent = `${listed.trim} · saved value`;
      listedTrim.append(savedOption);
    }

    listedTrim.value = listed.trim;
    listedTrim.disabled = !listed.makeCode || !listed.modelCode;
    listedTrimCopy.value = listedTrim.value;
    listedTrimCopy.placeholder = listedTrim.disabled ? "Choose model first" : "Choose a trim";

    if (listed.verifiedAt) {
      setQueueLiveState(queueModelStatus, "live", "Live verified");
      setQueueLiveState(queueTrimStatus, "live", "Live verified");
      queueTrimMessage.textContent = `${listed.availableTrims.length} trims · Verified ${globalThis.LunaAysheiCore.formatUaeTime(listed.verifiedAt)}.`;
    } else if (listed.makeModel || listed.trim) {
      setQueueLiveState(queueModelStatus, "cached", "Saved value");
      setQueueLiveState(queueTrimStatus, "cached", "Verify live");
      queueTrimMessage.textContent =
        "This saved value predates live verification. Search and select the model to verify it.";
    } else {
      setQueueLiveState(queueModelStatus, "none", "Search live");
      setQueueLiveState(queueTrimStatus, "none", "Choose model first");
      queueTrimMessage.textContent = "Live trims appear after selecting Make & Model.";
    }
  };

  const renderQueueModels = (models) => {
    const ad = getCurrentAd();
    queueModelResults.replaceChildren();

    models.forEach((model) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "queue-live-result";
      button.textContent = model.label;
      button.classList.toggle(
        "is-selected",
        ad?.listed.makeCode === model.makeCode && ad?.listed.modelCode === model.modelCode
      );
      button.addEventListener("click", () => selectQueueModel(model));
      queueModelResults.append(button);
    });
  };

  const fetchQueueTrims = async (model, previousTrim = "") => {
    const ad = getCurrentAd();
    if (!ad) {
      return;
    }

    const request = ++queueVehicleRequest;
    const adId = ad.id;
    setQueueLiveState(queueTrimStatus, "loading", "Loading");
    queueTrimMessage.textContent = "Loading live trims from Ayshei...";
    listedTrim.disabled = true;

    try {
      const data = await globalThis.LunaAyshei.fetchTrims(model.makeCode, model.modelCode);
      if (request !== queueVehicleRequest || getCurrentAd()?.id !== adId) {
        return;
      }

      const listed = ensureVehicleFields(ad);
      listed.availableTrims = data.trims;
      const preservedTrim = data.trims.find((trim) => trim.label === previousTrim);
      listed.trim = preservedTrim?.label || "";
      listed.trimCode = preservedTrim?.trimCode ?? null;
      listed.verifiedAt = new Date().toISOString();
      renderQueueTrims();
      setQueueLiveState(queueModelStatus, "live", "Live verified");
      setQueueLiveState(queueTrimStatus, "live", "Live verified");
      queueModelMessage.textContent = `Exact Ayshei value selected · ${globalThis.LunaAysheiCore.formatUaeTime(listed.verifiedAt)}.`;
      await persist();
    } catch (error) {
      if (request !== queueVehicleRequest || getCurrentAd()?.id !== adId) {
        return;
      }
      setQueueLiveState(queueTrimStatus, "error", "Unavailable");
      queueTrimMessage.textContent = error.message;
      listedTrim.disabled = false;
    }
  };

  const selectQueueModel = async (model) => {
    const ad = getCurrentAd();
    if (!ad) {
      return;
    }

    captureDraft();
    const listed = ensureVehicleFields(ad);
    const previousTrim = listed.trim;
    listed.makeModel = model.label;
    listed.makeCode = model.makeCode;
    listed.modelCode = model.modelCode;
    listed.trim = "";
    listed.trimCode = null;
    listed.availableTrims = [];
    listed.verifiedAt = "";
    listedMakeModel.value = model.label;
    queueModelResults.replaceChildren();
    setQueueLiveState(queueModelStatus, "live", "Selected live");
    queueModelMessage.textContent = "Loading trims for the exact Ayshei selection...";
    schedulePersist();
    await fetchQueueTrims(model, previousTrim);
  };

  const searchQueueModels = async () => {
    const keyword = listedMakeModel.value.trim();
    if (keyword.length < 2) {
      queueModelResults.replaceChildren();
      queueModelMessage.textContent = "Type at least two characters.";
      setQueueLiveState(queueModelStatus, "none", "Search live");
      return;
    }

    const request = ++queueVehicleRequest;
    const adId = getCurrentAd()?.id;
    setQueueLiveState(queueModelStatus, "loading", "Searching");
    queueModelMessage.textContent = "Searching the live Ayshei catalog...";

    try {
      const data = await globalThis.LunaAyshei.searchModels(keyword);
      if (request !== queueVehicleRequest || getCurrentAd()?.id !== adId) {
        return;
      }
      renderQueueModels(data.models);
      setQueueLiveState(queueModelStatus, "live", "Live results");
      queueModelMessage.textContent = data.models.length
        ? `${data.models.length} exact live results, displayed alphabetically.`
        : "No live Make & Model results found.";
    } catch (error) {
      if (request !== queueVehicleRequest || getCurrentAd()?.id !== adId) {
        return;
      }
      queueModelResults.replaceChildren();
      setQueueLiveState(queueModelStatus, "error", "Unavailable");
      queueModelMessage.textContent = error.message;
    }
  };

  const captureDraft = () => {
    const ad = getCurrentAd();

    if (!ad) {
      return;
    }

    const listed = ensureVehicleFields(ad);
    if (isNoonAd(ad)) {
      listed.noonCategory = noonCategory.value;
      listed.noonCondition = globalThis.LunaWorkQueueCore.NOON_CONDITION;
      listed.noonSubCategory = noonSubCategory.value;
      listed.noonSubSubCategory = noonSubSubCategory.value;
    } else {
      listed.category = listedCategory.value;
      listed.makeModel = listedMakeModel.value;
      listed.trim = listedTrim.value;
      listed.color = listedColor.value;
      listed.specs = isDubiCarsAd(ad) ? "" : listedSpecs.value;
      listed.transmission = isDubiCarsAd(ad) ? "" : listedTransmission.value;
    }
    ad.unlisted.reason = unlistedReason.value;
  };

  const hideReasonSuggestions = () => {
    if (reasonSuggestions) {
      reasonSuggestions.replaceChildren();
      reasonSuggestions.hidden = true;
    }
    if (reasonMatchStatus) reasonMatchStatus.textContent = "";
  };

  const syncFrequentReasons = () => {
    if (!frequentReasons) return;
    const current = globalThis.LunaWorkQueueCore.normalizeText(unlistedReason.value);
    for (const choice of frequentReasons.children) {
      choice.setAttribute(
        "aria-pressed",
        String(globalThis.LunaWorkQueueCore.normalizeText(choice.dataset.reason) === current)
      );
    }
  };

  const chooseReason = (reason) => {
    unlistedReason.value = reason;
    captureDraft();
    schedulePersist();
    syncFrequentReasons();
    hideReasonSuggestions();
    unlistedReason.focus();
  };

  const reasonButton = (reason, className) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = reason;
    button.dataset.reason = reason;
    button.addEventListener("click", () => chooseReason(reason));
    return button;
  };

  const getAvailableReasons = () =>
    globalThis.LunaWorkQueueCore.getReasonSuggestions(
      sheetRows,
      queue.ads.map((ad) =>
        ad === getCurrentAd() ? { unlisted: { reason: currentReasonBaseline } } : ad
      )
    );

  const showReasonSuggestions = () => {
    if (!reasonSuggestions) return;
    const query = globalThis.LunaWorkQueueCore.normalizeText(unlistedReason.value);
    const matches = query
      ? getAvailableReasons().filter((reason) =>
          globalThis.LunaWorkQueueCore.normalizeText(reason).includes(query)
        )
      : [];
    reasonSuggestions.replaceChildren(
      ...matches.map((reason) => reasonButton(reason, "queue-reason-suggestion"))
    );
    reasonSuggestions.hidden = !matches.length;
    if (frequentReasons) {
      frequentReasons.hidden = Boolean(query) || !frequentReasons.children.length;
    }
    if (reasonMatchStatus) {
      reasonMatchStatus.textContent = !query
        ? ""
        : matches.length
          ? `${matches.length} matching ${matches.length === 1 ? "reason" : "reasons"}`
          : "New reason · Save as Unlisted";
    }
    syncFrequentReasons();
  };

  const populateReasons = () => {
    reasonOptions.replaceChildren();

    getAvailableReasons().forEach((reason) => {
      const option = document.createElement("option");
      option.value = reason;
      reasonOptions.append(option);
    });
    if (frequentReasons) {
      const top = [...(Array.isArray(queue.reasonUsage) ? queue.reasonUsage : [])]
        .filter(({ label }) => globalThis.LunaWorkQueueCore.normalizeText(label))
        .sort(
          (left, right) =>
            right.count - left.count ||
            Number(right.lastUsedAt || 0) - Number(left.lastUsedAt || 0) ||
            left.label.localeCompare(right.label, "en", { sensitivity: "base" })
        )
        .slice(0, 3);
      frequentReasons.replaceChildren(
        ...top.map(({ label, count }) => {
          const choice = reasonButton(label, "queue-reason-chip");
          choice.title = count === 1 ? "Last used reason" : `${count} personal uses`;
          return choice;
        })
      );
      frequentReasons.hidden = !top.length;
      syncFrequentReasons();
    }
    hideReasonSuggestions();
  };

  const renderResultLinks = (target, status, emptyMessage) => {
    if (!target) return;
    target.replaceChildren();
    queue.ads.forEach((ad, index) => {
      if (ad.status !== status) return;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.adIndex = String(index);
      button.textContent = `Ad ${ad.id} · ${ad.source.vendor} · ${ad.source.adName}`;
      button.addEventListener("click", () => {
        captureDraft();
        queue.currentIndex = index;
        switchPanel("review");
        render();
        schedulePersist();
        syncOpenAdTab();
      });
      target.append(button);
    });
    if (!target.children.length) {
      const empty = document.createElement("p");
      empty.className = "queue-message";
      empty.textContent = emptyMessage;
      target.append(empty);
    }
  };

  const renderUrlOutput = (status, output, note, copyButton) => {
    const ads = queue.ads.filter((ad) => ad.status === status);
    if (output) output.value = ads.map((ad) => ad.source.url).join("\n");
    if (note) note.textContent = `${ads.length} URLs · Original order`;
    if (copyButton) copyButton.disabled = !ads.length;
  };

  const renderOutputs = () => {
    const listed = globalThis.LunaWorkQueueCore.buildListedOutput(queue.ads);
    const unlisted = globalThis.LunaWorkQueueCore.buildUnlistedOutput(queue.ads);

    listedOutput.value = listed.text;
    const noonRows = queue.ads.filter((ad) => isNoonAd(ad)).length;
    const vehicleRows = queue.ads.length - noonRows;
    const formats = [
      vehicleRows ? `${vehicleRows} Motors row${vehicleRows === 1 ? "" : "s"} · 8 cells` : "",
      noonRows ? `${noonRows} Noon row${noonRows === 1 ? "" : "s"} · 5 cells` : ""
    ]
      .filter(Boolean)
      .join("; ");
    listedOutputNote.textContent = listed.pendingCount
      ? `${formats}. ${listed.pendingCount} pending ad URL${listed.pendingCount === 1 ? " is" : "s are"} included with blank fields.`
      : `${formats}. ${listed.rowCount} aligned rows ready. Blank rows are Unlisted; URL-only rows are Review Later.`;
    copyListed.disabled = listed.rowCount === 0;

    unlistedOutput.value = unlisted.text;
    unlistedOutputNote.textContent = unlisted.rowCount
      ? `${unlisted.rowCount} compact unlisted rows ready in original relative order.`
      : "No ads are marked Unlisted yet.";
    copyUnlisted.disabled = unlisted.rowCount === 0;

    renderResultLinks(reviewList, "review_later", "No advertisements are waiting for review.");
    renderResultLinks(pendingList, "pending", "No pending advertisements.");
    renderUrlOutput("review_later", reviewOutput, reviewOutputNote, copyReview);
    renderUrlOutput("pending", pendingOutput, pendingOutputNote, copyPending);
  };

  const renderCurrent = () => {
    const ad = getCurrentAd();

    if (!ad) {
      return;
    }

    queueVehicleRequest += 1;
    const listed = ensureVehicleFields(ad);
    // A persisted input draft must not suggest its own unfinished text.
    currentReasonBaseline = ad.unlisted.reason;
    const isDubiCars = isDubiCarsAd(ad);
    const isNoon = isNoonAd(ad);
    if (isDubiCars) {
      listed.specs = "";
      listed.transmission = "";
    }
    const counts = globalThis.LunaWorkQueueCore.getCounts(queue.ads);
    const shown = visibleIndexes();
    const shownPosition = shown.indexOf(queue.currentIndex);
    progressTitle.textContent =
      shown.length === counts.total
        ? `Ad ${ad.id} of ${counts.total}`
        : `Ad ${ad.id} · ${shownPosition + 1} of ${shown.length} shown`;
    adNumber.textContent = `Ad ${ad.id}`;
    adVendor.textContent = ad.source.vendor || "Vendor not provided";
    adName.textContent = ad.source.adName || "Advertisement name not provided";
    adUrl.textContent = ad.source.url;
    currentStatus.textContent = statusLabels[ad.status];
    currentStatus.dataset.queueStatus = ad.status.replace("_", "-");
    countElements.listed.textContent = String(counts.listed);
    countElements.unlisted.textContent = String(counts.unlisted);
    countElements.reviewLater.textContent = String(counts.reviewLater);
    countElements.pending.textContent = String(counts.pending);

    motorsListedFields.hidden = isNoon;
    noonListedFields.hidden = !isNoon;
    listedFieldsKicker.textContent = isNoon
      ? "Noon Listed fields · 5 cells"
      : "Listed fields · P:W";
    if (isNoon) {
      renderNoonFields(listed);
    } else {
      listedCategory.value = listed.category;
      listedMakeModel.value = listed.makeModel;
      listedColor.value = listed.color;
      listedSpecs.value = listed.specs;
      listedTransmission.value = listed.transmission;
    }
    listedSpecsField.hidden = isDubiCars;
    listedTransmissionField.hidden = isDubiCars;
    unlistedReason.value = ad.unlisted.reason;
    updateColorSwatch();
    queueModelResults.replaceChildren();
    queueModelMessage.textContent = listed.verifiedAt
      ? `Exact Ayshei value · Verified ${globalThis.LunaAysheiCore.formatUaeTime(listed.verifiedAt)}.`
      : "Type at least two characters, then choose an exact Ayshei result.";
    if (!isNoon) {
      renderQueueTrims();
    }
    previousButton.disabled = shown.indexOf(queue.currentIndex) <= 0;
    nextButton.disabled = shown.indexOf(queue.currentIndex) >= shown.length - 1;
    undoButton.disabled = queue.history.length === 0;
    goNumber.max = String(queue.ads.length);
    actionMessage.textContent = "";
    autoFillButton.hidden = isNoon;
    autoFillMessage.textContent = isNoon
      ? "Choose the exact dependent Noon categories above. Luna keeps the condition fixed as NEW_WITH_TAGS."
      : "Auto Fill reads only the matching active DubiCars or Dubizzle ad and fills these editable fields. It never saves, changes status, or moves to Next.";
    sourceFacts.replaceChildren();
    const captured = vendorCaptures.get(ad.id);
    const samePage =
      captured &&
      globalThis.LunaFoundation.urls.identity(captured.sourceUrl) ===
        globalThis.LunaFoundation.urls.identity(ad.source.url);
    const factLabels = {
      make: "Make",
      model: "Model",
      year: "Year",
      trim: "Trim",
      category: "Condition",
      color: "Color",
      specs: "Regional specs",
      transmission: "Transmission",
      mileage: "Mileage"
    };
    if (samePage) {
      if (captured.title) {
        const item = document.createElement("li");
        item.textContent = `Ad name: ${captured.title}`;
        sourceFacts.append(item);
      }
      Object.entries(factLabels).forEach(([key, label]) => {
        const value = captured.facts?.[key]?.value;
        if (!value) return;
        const item = document.createElement("li");
        item.textContent = `${label}: ${value}`;
        sourceFacts.append(item);
      });
      if (captured.description) {
        const item = document.createElement("li");
        item.textContent = `Details: ${captured.description.slice(0, 500)}`;
        sourceFacts.append(item);
      }
    }
    sourcePreview.hidden = !samePage;
    vehicleAiTools.hidden = isNoon;
    aiFillButton.hidden = isNoon || !aiRecommendations.has(ad.id);
    aiResult.hidden = isNoon;
    aiResult.textContent =
      "Optional AI help for the matching active ad. It never saves, changes status, moves to Next, or clicks the page.";
    queueNoteText.value = "";
    queueAddNote.disabled = true;
    queueNoteMessage.textContent = "Notes stay on Home when you replace this Work Queue.";
  };

  const render = () => {
    const hasQueue = queue.ads.length > 0;
    workspace.hidden = !hasQueue;

    if (!hasQueue) {
      importDetails.open = true;
      return;
    }

    renderCurrent();
    renderOutputs();
    populateReasons();
  };

  const switchPanel = (panelName) => {
    renderOutputs();
    hideReasonSuggestions();
    if (viewSelect) {
      viewSelect.value = panelName;
      globalThis.LunaControls?.sync?.(viewSelect);
    }
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.queuePanelView !== panelName;
    });
    globalThis.LunaUI?.queuePanelSelected?.(panelName);
  };

  const recordHistory = () => {
    queue.history.push({
      ad: clone(getCurrentAd()),
      index: queue.currentIndex
    });

    if (queue.history.length > 100) {
      queue.history.shift();
    }
  };

  const ensureReasonUsage = () => {
    if (Array.isArray(queue.reasonUsage) && queue.reasonUsage.length) return;
    const usage = new Map();
    queue.ads.forEach((ad, index) => {
      if (ad.status !== "unlisted") return;
      const label = String(ad.unlisted?.reason || "")
        .trim()
        .replace(/\s+/g, " ");
      const key = globalThis.LunaWorkQueueCore.normalizeText(label);
      if (!key) return;
      const entry = usage.get(key) || { label, count: 0, lastUsedAt: 0 };
      entry.count += 1;
      entry.lastUsedAt = index + 1;
      usage.set(key, entry);
    });
    queue.reasonUsage = [...usage.values()];
  };

  const recordReasonUsage = (reason) => {
    const label = String(reason || "")
      .trim()
      .replace(/\s+/g, " ");
    const key = globalThis.LunaWorkQueueCore.normalizeText(label);
    if (!key) return;
    queue.reasonUsage = Array.isArray(queue.reasonUsage) ? queue.reasonUsage : [];
    const existing = queue.reasonUsage.find(
      (entry) => globalThis.LunaWorkQueueCore.normalizeText(entry.label) === key
    );
    if (existing) {
      existing.label = label;
      existing.count = Number(existing.count || 0) + 1;
      existing.lastUsedAt = Date.now();
    } else {
      queue.reasonUsage.push({ label, count: 1, lastUsedAt: Date.now() });
    }
    queue.reasonUsage = queue.reasonUsage
      .sort((left, right) => Number(right.lastUsedAt || 0) - Number(left.lastUsedAt || 0))
      .slice(0, 30);
  };

  const moveAfterSave = () => {
    const filter = queueFilter?.value || "all";
    if (filter === "all") {
      if (queue.currentIndex < queue.ads.length - 1) queue.currentIndex += 1;
      return;
    }
    const indexes = visibleIndexes();
    const next = indexes.find((index) => index > queue.currentIndex);
    if (Number.isInteger(next)) queue.currentIndex = next;
    else if (indexes.length) queue.currentIndex = indexes[0];
    else queueFilter.value = "all";
  };

  const markAd = async (status) => {
    const ad = getCurrentAd();

    if (!ad) {
      return;
    }

    captureDraft();

    const noonAd = isNoonAd(ad);
    const requiredListedValues = noonAd
      ? [ad.listed.noonCategory, ad.listed.noonSubCategory, ad.listed.noonSubSubCategory]
      : [ad.listed.category, ad.listed.makeModel, ad.listed.trim, ad.listed.color];
    if (!noonAd && !isDubiCarsAd(ad)) {
      requiredListedValues.push(ad.listed.specs, ad.listed.transmission);
    }
    if (status === "listed" && !requiredListedValues.every((value) => String(value).trim())) {
      actionMessage.textContent = "Complete every Listed field before saving.";
      return;
    }

    if (
      status === "listed" &&
      noonAd &&
      !globalThis.LunaWorkQueueCore.isValidNoonSelection(
        ad.listed.noonCategory,
        ad.listed.noonSubCategory,
        ad.listed.noonSubSubCategory
      )
    ) {
      actionMessage.textContent =
        "Choose a valid Noon category, sub-category, and sub-sub-category.";
      return;
    }

    if (
      status === "listed" &&
      !noonAd &&
      (!Number.isInteger(ad.listed.makeCode) ||
        !Number.isInteger(ad.listed.modelCode) ||
        !Number.isInteger(ad.listed.trimCode))
    ) {
      actionMessage.textContent =
        "Choose Make & Model and Trim from the live Ayshei results first.";
      return;
    }

    if (status === "unlisted" && !ad.unlisted.reason.trim()) {
      actionMessage.textContent = "Write or select an Unlisted reason first.";
      return;
    }

    recordHistory();
    ad.status = status;

    if (status === "unlisted") {
      ad.unlisted.date = getUaeDate();
      recordReasonUsage(ad.unlisted.reason);
    }

    moveAfterSave();
    await persist();
    render();
    globalThis.LunaUI?.queueSaved?.(status);
    syncOpenAdTab();
  };

  const copyText = async (text, textarea, successMessage) => {
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      textarea.focus();
      textarea.select();

      if (!document.execCommand("copy")) {
        throw error;
      }
    }

    actionMessage.textContent = successMessage;
  };

  const withoutOther = (candidates) => {
    const nonOther = candidates.filter(
      (candidate) =>
        String(candidate?.label || "")
          .trim()
          .toLowerCase() !== "other"
    );
    return nonOther.length ? nonOther : candidates;
  };

  const captureMatchingActiveAd = async (ad = getCurrentAd()) => {
    const tabs = await globalThis.chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs?.[0];
    const validation = globalThis.LunaFoundation.tabs.validateActive(tab, {
      expectedUrl: ad?.source?.url
    });
    if (!validation.ok) {
      throw new Error(
        validation.reason === "url-mismatch"
          ? "The active tab is not the current queue advertisement. Open the current ad and try again."
          : "Luna could not verify the active advertisement tab."
      );
    }
    const site = globalThis.LunaVehicleDetailCore.supportedSite(validation.identity);
    if (!site)
      throw new Error(
        "The active page is not a supported DubiCars or Dubizzle advertisement-detail route."
      );
    const result = await globalThis.chrome.scripting.executeScript({
      files: ["src/features/work-queue/vehicle-detail-page.js"],
      target: { tabId: validation.tabId }
    });
    const capture = result?.[0]?.result;
    if (!capture || capture.site !== site)
      throw new Error("The page did not return supported vehicle details.");
    if (globalThis.LunaFoundation.urls.identity(capture.sourceUrl) !== validation.identity) {
      throw new Error("The page changed while Luna was reading it. Nothing was applied.");
    }
    return capture;
  };

  const factsFromCapture = (capture) => {
    const facts = Object.fromEntries(
      Object.entries(capture.facts || {}).map(([name, fact]) => [name, fact?.value || ""])
    );
    return {
      ...facts,
      context: capture.context || "",
      summary: capture.summary || "",
      title: capture.title || ""
    };
  };

  const analyzeWithGroq = async (input) => {
    const key = globalThis.LunaGroqCore.cacheKey(input);
    if (!aiCache.has(key)) aiCache.set(key, globalThis.LunaGroq.analyze(input));
    try {
      return await aiCache.get(key);
    } catch (error) {
      aiCache.delete(key);
      throw error;
    }
  };

  const resolveWithGroq = async (task, facts, candidates, imageUrl) => {
    const safeCandidates = withoutOther(candidates);
    if (!safeCandidates.length) return null;
    try {
      const candidateId = (candidate) =>
        task === "model"
          ? `${candidate.makeCode}:${candidate.modelCode}`
          : task === "trim"
            ? String(candidate.trimCode)
            : String(candidate.id);
      const inputCandidates = safeCandidates.map((candidate) => ({
        id: candidateId(candidate),
        label: candidate.aiLabel || candidate.label
      }));
      const result = await analyzeWithGroq({ candidates: inputCandidates, facts, imageUrl, task });
      if (!result.candidate) {
        return {
          error: `AI did not choose a nearest live ${task}.`,
          result,
          selected: null
        };
      }
      const selected = safeCandidates.find(
        (candidate) => candidateId(candidate) === result.candidate.id
      );
      return selected ? { result, selected } : null;
    } catch (error) {
      return { error: error.message, selected: null };
    }
  };

  const resolveVehicleCatalog = async (capture) => {
    const facts = factsFromCapture(capture);
    const warnings = [];
    const models = [];
    const modelKeys = new Set();
    let lookupFailure = "";
    // Complete the bounded search plan: a vendor's family name can have a
    // more-specific live catalog variant returned by a later query.
    for (const keyword of globalThis.LunaVehicleDetailCore.modelSearchTerms(capture)) {
      try {
        const modelData = await globalThis.LunaAyshei.searchModels(keyword);
        modelData.models.forEach((candidate) => {
          const key = `${candidate.makeCode}:${candidate.modelCode}`;
          if (!modelKeys.has(key)) {
            modelKeys.add(key);
            models.push(candidate);
          }
        });
      } catch (error) {
        lookupFailure ||= error.message;
      }
    }
    if (lookupFailure) warnings.push(`One Ayshei model search was unavailable: ${lookupFailure}`);
    const liveModels = withoutOther(models);
    const sameMakeModels = globalThis.LunaVehicleDetailCore.sameMakeModels(liveModels, capture);
    const evidenceModels = globalThis.LunaVehicleDetailCore.rankModelCandidates(
      sameMakeModels,
      capture
    );
    const preferredModel = evidenceModels[0] || null;
    let modelAi = null;
    let selectedModel = preferredModel;
    let modelNearestFallback = false;
    if (!selectedModel && sameMakeModels.length) {
      const nearest = globalThis.LunaVehicleDetailCore.nearestModelCandidates(
        sameMakeModels,
        capture
      );
      modelAi = await resolveWithGroq("model", facts, nearest.slice(0, 24), "");
      selectedModel =
        modelAi?.selected && modelAi.result?.autoFillEligible === true
          ? modelAi.selected
          : nearest[0] || null;
      modelNearestFallback = Boolean(selectedModel);
      if (selectedModel)
        warnings.push(
          "The advertised model was not an exact live match; review the nearest same-make choice."
        );
    }
    if (!selectedModel)
      warnings.push(
        "No live model for the advertised make was found; Make & Model and Trim were left empty."
      );
    let trims = [];
    if (selectedModel) {
      try {
        const trimData = await globalThis.LunaAyshei.fetchTrims(
          selectedModel.makeCode,
          selectedModel.modelCode
        );
        trims = withoutOther(trimData.trims);
      } catch (error) {
        warnings.push(
          `Ayshei trim lookup was unavailable for ${selectedModel.label}: ${error.message}`
        );
      }
    }
    const modelTrimFallback = false;
    const trimCapture = globalThis.LunaVehicleDetailCore.captureForModelTrim(
      capture,
      selectedModel
    );
    const trimFacts = {
      ...factsFromCapture(trimCapture),
      model: selectedModel?.model || facts.model
    };
    let selectedTrim = globalThis.LunaVehicleDetailCore.trimFromEvidence(trims, trimCapture);
    let trimAi = null;
    let trimFallback = false;
    if (selectedModel && !selectedTrim && trims.length) {
      trimAi = await resolveWithGroq("trim", trimFacts, trims, capture.imageUrl);
      selectedTrim =
        trimAi?.selected && trimAi.result?.autoFillEligible === true
          ? trimAi.selected
          : globalThis.LunaVehicleDetailCore.fallbackTrim(trims, trimCapture);
      trimFallback = Boolean(
        selectedTrim && (!trimAi?.selected || trimAi.result?.autoFillEligible !== true)
      );
    }
    return {
      facts,
      modelAi,
      modelNearestFallback,
      modelTrimFallback,
      selectedModel,
      selectedTrim,
      trimAi,
      trimFallback,
      trims,
      warnings
    };
  };

  const applyCatalogRecommendation = async (ad, recommendation) => {
    if (!recommendation?.selectedModel) return [];
    captureDraft();
    recordHistory();
    const listed = ensureVehicleFields(ad);
    const { selectedModel, selectedTrim, trims } = recommendation;
    const sameModel =
      listed.makeCode === selectedModel.makeCode && listed.modelCode === selectedModel.modelCode;
    listed.makeModel = selectedModel.label;
    listed.makeCode = selectedModel.makeCode;
    listed.modelCode = selectedModel.modelCode;
    listed.availableTrims = trims;
    listed.verifiedAt = new Date().toISOString();
    if (!sameModel) {
      listed.trim = "";
      listed.trimCode = null;
    }
    const applied = ["Make & Model"];
    if (selectedTrim) {
      listed.trim = selectedTrim.label;
      listed.trimCode = selectedTrim.trimCode;
      applied.push("Trim");
    }
    await persist();
    render();
    return applied;
  };

  const detectBodyType = async () => {
    const ad = getCurrentAd();
    if (!ad || isNoonAd(ad)) return;
    aiBodyTypeButton.disabled = true;
    aiResult.textContent = "Checking the car name and image...";
    try {
      const capture = await captureMatchingActiveAd(ad);
      const pageFacts = factsFromCapture(capture);
      const result = await analyzeWithGroq({
        facts: {
          make: pageFacts.make,
          model: pageFacts.model,
          title: pageFacts.title,
          year: pageFacts.year
        },
        imageUrl: capture.imageUrl,
        task: "bodyType"
      });
      const imageNote = result.imageUsed
        ? " Name and car image checked."
        : " Name checked; the image was unavailable.";
      aiResult.textContent = `Body Type: ${result.bodyType} · ${result.confidence} confidence.${imageNote} ${result.reason}`;
    } catch (error) {
      aiResult.textContent = `${error.message} No field or workflow state changed.`;
    } finally {
      aiBodyTypeButton.disabled = false;
    }
  };

  const recommendModelAndTrim = async () => {
    const ad = getCurrentAd();
    if (!ad || isNoonAd(ad)) return;
    aiModelTrimButton.disabled = true;
    aiFillButton.hidden = true;
    aiResult.textContent = "Reading the matching active ad and checking live Ayshei options...";
    try {
      const capture = await captureMatchingActiveAd(ad);
      const recommendation = await resolveVehicleCatalog(capture);
      const sourceIdentity = globalThis.LunaFoundation.urls.identity(capture.sourceUrl);
      if (!recommendation.selectedModel) {
        aiRecommendations.delete(ad.id);
        throw new Error(
          recommendation.modelAi?.error || "No safe live-catalog model recommendation was found."
        );
      }
      aiRecommendations.set(ad.id, { ...recommendation, sourceIdentity });
      const trim = recommendation.selectedTrim?.label || "No trim recommendation";
      const aiUsed = recommendation.modelAi?.selected || recommendation.trimAi?.selected;
      const detail = !recommendation.selectedTrim
        ? recommendation.trimAi?.error ||
          "No live non-Other trim options were available to compare."
        : recommendation.modelNearestFallback
          ? "Luna used the nearest same-make live model because no exact model name was available; review before filling."
          : recommendation.trimFallback
            ? "Luna used the nearest live trim fallback; review before filling."
            : recommendation.modelTrimFallback
              ? "Luna skipped a generic model without trims and used the nearest specific model with trims; review before filling."
              : aiUsed
                ? "AI chose the nearest value only from live Ayshei options; review before filling."
                : "Exact page evidence matched the live model and trim.";
      aiResult.textContent = `Recommendation: ${recommendation.selectedModel.label} · ${trim}. ${detail}`;
      aiFillButton.hidden = false;
    } catch (error) {
      aiResult.textContent = `${error.message} Nothing was filled.`;
    } finally {
      aiModelTrimButton.disabled = false;
    }
  };

  const fillAiRecommendation = async () => {
    const ad = getCurrentAd();
    if (isNoonAd(ad)) return;
    const recommendation = ad ? aiRecommendations.get(ad.id) : null;
    if (
      !ad ||
      !recommendation ||
      recommendation.sourceIdentity !== globalThis.LunaFoundation.urls.identity(ad.source.url)
    ) {
      aiResult.textContent = "This recommendation is no longer for the current ad. Check it again.";
      aiFillButton.hidden = true;
      return;
    }
    const statusBefore = ad.status;
    const applied = await applyCatalogRecommendation(ad, recommendation);
    aiResult.textContent = `Filled ${applied.join(" and ")} into the normal editable controls. Status remains ${statusLabels[statusBefore]}; Luna did not save, move to Next, or click the page.`;
  };

  const autoFillCurrentAdvertisement = async () => {
    const ad = getCurrentAd();
    if (!ad || isNoonAd(ad)) return;
    const run = ++autoFillRun;
    const startIndex = queue.currentIndex;
    const statusBefore = ad.status;
    const stillCurrent = () =>
      run === autoFillRun &&
      queue.currentIndex === startIndex &&
      getCurrentAd() === ad &&
      ad.status === statusBefore;
    let vendorPreviewShown = false;
    autoFillButton.disabled = true;
    autoFillMessage.textContent =
      "Reading the matching vendor ad. Page facts will appear before catalog or AI checks.";
    try {
      const capture = await captureMatchingActiveAd(ad);
      if (!stillCurrent()) return;
      const normalized = globalThis.LunaVehicleDetailCore.proposalFromCapture(capture);
      if (globalThis.LunaVehicleDetailCore.isPlainGreen(capture?.facts?.color?.value)) {
        normalized.color = "";
      }
      captureDraft();
      const listed = ensureVehicleFields(ad);
      const pageApplied = [];
      const pageFields = [
        ["category", "Category", normalized.category],
        ["color", "Color", normalized.color],
        ...(!isDubiCarsAd(ad)
          ? [
              ["specs", "Specs", normalized.specs],
              ["transmission", "Transmission", normalized.transmission]
            ]
          : [])
      ];
      const pageSpecs = String(capture.facts?.specs?.value || "").trim();
      const pageSpecsMissing =
        !pageSpecs ||
        /^(?:n\/?a|none|not (?:available|provided|specified)|unknown|[-—–]+)$/i.test(pageSpecs);
      const defaultedSpecs =
        !isDubiCarsAd(ad) && !normalized.specs && pageSpecsMissing && !listed.specs;
      const advertisedModel = [capture.facts?.make?.value, capture.facts?.model?.value]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("en");
      const staleModel = Boolean(
        advertisedModel &&
          listed.makeModel &&
          !listed.makeModel.toLocaleLowerCase("en").includes(advertisedModel)
      );
      if (
        pageFields.some(([field, , value]) => value && listed[field] !== value) ||
        defaultedSpecs ||
        staleModel
      )
        recordHistory();
      pageFields.forEach(([field, label, value]) => {
        if (!value || listed[field] === value) return;
        listed[field] = value;
        pageApplied.push(label);
      });
      if (defaultedSpecs) listed.specs = "Other";
      if (staleModel) {
        listed.makeModel = "";
        listed.makeCode = null;
        listed.modelCode = null;
        listed.trim = "";
        listed.trimCode = null;
        listed.availableTrims = [];
        listed.verifiedAt = "";
      }
      vendorCaptures.set(ad.id, capture);
      ad.extractionEvidence = {
        applied: pageApplied,
        appliedAt: new Date().toISOString(),
        defaults: defaultedSpecs ? ["Specs: Other (not stated on vendor page)"] : [],
        imageUsed: false,
        site: capture.site,
        sourceIdentity: globalThis.LunaFoundation.urls.identity(capture.sourceUrl),
        usedAi: false,
        version: 6
      };
      await persist();
      if (!stillCurrent()) return;
      render();
      vendorPreviewShown = true;
      autoFillMessage.textContent = `Vendor facts are shown first. Filled ${pageApplied.length} directly from the page.${defaultedSpecs ? " Specs defaulted to Other because the page did not state a regional spec." : ""} Checking the live catalog and only unresolved details. Status remains ${statusLabels[statusBefore]}.`;
      const baseline = {
        color: listed.color,
        makeModel: listed.makeModel,
        makeCode: listed.makeCode,
        modelCode: listed.modelCode,
        trim: listed.trim,
        trimCode: listed.trimCode
      };
      const [recommendation, colorAi] = await Promise.all([
        resolveVehicleCatalog(capture),
        globalThis.LunaVehicleDetailCore.isPlainGreen(capture?.facts?.color?.value) &&
        capture.imageUrl
          ? resolveWithGroq(
              "color",
              factsFromCapture(capture),
              [
                { id: "dark-green", label: "Dark Green" },
                { id: "light-green", label: "Light Green" }
              ],
              capture.imageUrl
            )
          : Promise.resolve(null)
      ]);
      if (!stillCurrent()) return;
      captureDraft();
      const {
        modelAi,
        modelNearestFallback,
        modelTrimFallback,
        selectedModel,
        selectedTrim,
        trimAi,
        trimFallback,
        trims,
        warnings
      } = recommendation;
      const canSetModel =
        listed.makeModel === baseline.makeModel &&
        listed.makeCode === baseline.makeCode &&
        listed.modelCode === baseline.modelCode;
      const canSetTrim =
        canSetModel && listed.trim === baseline.trim && listed.trimCode === baseline.trimCode;
      const canSetColor = listed.color === baseline.color;
      const applied = [...pageApplied];
      const clearModel =
        canSetModel &&
        !selectedModel &&
        Boolean(
          listed.makeModel ||
            listed.trim ||
            Number.isInteger(listed.makeCode) ||
            Number.isInteger(listed.modelCode) ||
            Number.isInteger(listed.trimCode)
        );
      if ((canSetModel && selectedModel) || clearModel || (canSetColor && colorAi?.selected))
        recordHistory();
      if (canSetModel && selectedModel) {
        const sameModel =
          listed.makeCode === selectedModel.makeCode &&
          listed.modelCode === selectedModel.modelCode;
        listed.makeModel = selectedModel.label;
        listed.makeCode = selectedModel.makeCode;
        listed.modelCode = selectedModel.modelCode;
        listed.availableTrims = trims;
        listed.verifiedAt = new Date().toISOString();
        if (!sameModel && canSetTrim) {
          listed.trim = "";
          listed.trimCode = null;
        }
        applied.push("Make & Model");
      } else if (clearModel) {
        listed.makeModel = "";
        listed.makeCode = null;
        listed.modelCode = null;
        listed.trim = "";
        listed.trimCode = null;
        listed.availableTrims = [];
        listed.verifiedAt = "";
        applied.push("Make & Model and Trim cleared for review");
      }
      if (canSetTrim && canSetModel && selectedModel && selectedTrim) {
        listed.trim = selectedTrim.label;
        listed.trimCode = selectedTrim.trimCode;
        applied.push("Trim");
      }
      const colorAccepted =
        canSetColor && colorAi?.selected && colorAi.result?.autoFillEligible === true;
      if (colorAccepted) {
        listed.color = colorAi.selected.label;
        applied.push("Color");
      }
      if (
        globalThis.LunaVehicleDetailCore.isPlainGreen(capture?.facts?.color?.value) &&
        !colorAccepted &&
        !listed.color
      ) {
        warnings.push("Green needs a manual Light Green or Dark Green choice.");
      }
      const expected = isDubiCarsAd(ad)
        ? [
            ["Category", listed.category],
            ["Make & Model", listed.makeModel],
            ["Trim", listed.trim],
            ["Color", listed.color]
          ]
        : [
            ["Category", listed.category],
            ["Make & Model", listed.makeModel],
            ["Trim", listed.trim],
            ["Color", listed.color],
            ["Specs", listed.specs],
            ["Transmission", listed.transmission]
          ];
      const missing = expected.filter(([, value]) => !value).map(([label]) => label);
      const aiMatches = [
        canSetModel && modelAi,
        canSetTrim && trimAi,
        colorAccepted && colorAi
      ].filter(
        (resolution) => resolution?.selected && resolution.result?.autoFillEligible === true
      );
      const aiErrors = [modelAi?.error, trimAi?.error, colorAi?.error].filter(Boolean);
      const uncertainAi = [modelAi, trimAi, colorAi].filter(
        (resolution) => resolution?.selected && resolution.result?.autoFillEligible !== true
      );
      if (!listed.makeModel) warnings.push("Make & Model needs a manual live-catalog choice.");
      if (listed.makeModel && !listed.trim)
        warnings.push("Trim needs a manual live-catalog choice.");
      if (modelNearestFallback)
        warnings.push(
          "Luna used the nearest same-make live model because no exact model name was available; check it."
        );
      if (modelTrimFallback)
        warnings.push(
          "Luna skipped a generic model without trims and used the nearest specific model with trims; check it."
        );
      if (trimFallback) warnings.push("Luna used the nearest live trim fallback; check it.");
      if (aiErrors.length) warnings.push(`AI was unavailable: ${aiErrors[0]}`);
      if (uncertainAi.length)
        warnings.push(
          "AI providers disagreed or remained below the 0.85 confidence threshold; uncertain values were not auto-filled."
        );
      if (aiMatches.length)
        warnings.push(
          "AI selected only values that exist in the live Ayshei catalog; check them before saving."
        );
      ad.attention = [...missing.map((label) => `${label} needs human review`), ...warnings];
      ad.extractionEvidence = {
        applied,
        appliedAt: new Date().toISOString(),
        defaults: defaultedSpecs ? ["Specs: Other (not stated on vendor page)"] : [],
        imageUsed: aiMatches.some((resolution) => resolution.result?.imageUsed),
        site: capture.site,
        sourceIdentity: globalThis.LunaFoundation.urls.identity(capture.sourceUrl),
        usedAi: aiMatches.length > 0,
        version: 6
      };
      await persist();
      render();
      const aiLabels = [
        canSetModel && modelAi?.selected && "model",
        canSetTrim && trimAi?.selected && "trim",
        colorAccepted && "green shade"
      ].filter(Boolean);
      const aiNote = aiMatches.length
        ? ` AI matched ${aiLabels.join(", ")}${aiMatches.some((resolution) => resolution.result?.imageUsed) ? " using page text and the car image" : " using page text"}; please check the editable values.`
        : " AI added no fields; vendor facts were kept.";
      const fallbackNote = modelNearestFallback
        ? " Model is the nearest same-make choice, not an exact match; review it."
        : "";
      const missingNote = missing.length
        ? ` Missing: ${missing.join(", ")}; review these fields.`
        : "";
      autoFillMessage.textContent = `Page filled ${pageApplied.length} field${pageApplied.length === 1 ? "" : "s"}; catalog checks completed.${defaultedSpecs ? " Specs defaulted to Other because the page did not state a regional spec." : ""}${aiNote}${fallbackNote}${missingNote} Status remains ${statusLabels[statusBefore]}; Luna did not save, move to Next, or run a page action.`;
    } catch (error) {
      if (stillCurrent())
        autoFillMessage.textContent = vendorPreviewShown
          ? `Vendor facts remain available. Catalog or AI checks could not finish: ${error.message} No workflow action ran.`
          : `${error.message} Nothing was saved and no workflow action ran.`;
    } finally {
      if (run === autoFillRun) autoFillButton.disabled = false;
    }
  };

  startButton.addEventListener("click", () => {
    const parsed = globalThis.LunaWorkQueueCore.parseCopiedRows(importText.value);
    if (!parsed.ads.length) {
      importMessage.textContent = "Paste at least one complete A:F row before previewing.";
      importPreview.hidden = true;
      pendingImport = null;
      return;
    }
    const summary = globalThis.LunaVehicleDetailCore.analyzeImport(parsed);
    pendingImport = { parsed, sourceText: importText.value, summary };
    importSummary.replaceChildren();
    [
      ["Valid rows", summary.totalRows],
      ["Invalid rows", summary.invalidRows],
      ["Duplicate-name rows", `${summary.duplicateNameRows} · kept`],
      ["Duplicate-URL rows", `${summary.duplicateUrlRows} · kept`],
      [
        "Sites",
        `DubiCars ${summary.sites.dubicars} · Dubizzle ${summary.sites.dubizzle} · Other ${summary.sites.other}`
      ]
    ].forEach(([label, value]) => {
      const row = document.createElement("div");
      const name = document.createElement("span");
      const result = document.createElement("strong");
      name.textContent = label;
      result.textContent = String(value);
      row.append(name, result);
      importSummary.append(row);
    });
    importWarning.textContent = parsed.invalidLines.length
      ? `Cannot confirm yet. Correct line(s) ${parsed.invalidLines.join(", ")}; every row needs A:F and an HTTP(S) URL.`
      : queue.ads.length
        ? `Confirming will replace the saved ${queue.ads.length}-ad queue. Row order and all duplicates in this preview will be preserved.`
        : "Confirm to create this queue. Row order and all duplicates will be preserved.";
    confirmImport.disabled = parsed.invalidLines.length > 0;
    importPreview.hidden = false;
    importMessage.textContent = "Preview ready. Saved work has not changed.";
  });

  confirmImport.addEventListener("click", async () => {
    if (
      !pendingImport ||
      pendingImport.sourceText !== importText.value ||
      pendingImport.parsed.invalidLines.length
    ) {
      importMessage.textContent = "The pasted rows changed. Preview them again before confirming.";
      return;
    }
    queue = {
      ads: pendingImport.parsed.ads,
      createdAt: new Date().toISOString(),
      currentIndex: 0,
      history: [],
      jenkinsBatchSize: 20,
      reasonUsage: Array.isArray(queue.reasonUsage) ? queue.reasonUsage : [],
      version: 1
    };
    const importedCount = queue.ads.length;
    pendingImport = null;
    importText.value = "";
    importPreview.hidden = true;
    importDetails.open = false;
    importMessage.textContent = `${importedCount} ads imported in the previewed order.`;
    switchPanel("review");
    await persist();
    render();
  });

  cancelImport.addEventListener("click", () => {
    pendingImport = null;
    importPreview.hidden = true;
    importMessage.textContent = "Import preview discarded. Saved work was not changed.";
  });

  importText.addEventListener("input", () => {
    if (pendingImport && pendingImport.sourceText !== importText.value) {
      pendingImport = null;
      importPreview.hidden = true;
      importMessage.textContent = "Rows changed. Preview the import again.";
    }
  });

  listedInputs.forEach((input) => {
    input.addEventListener("input", () => {
      captureDraft();
      updateColorSwatch();
      schedulePersist();
    });
    input.addEventListener("change", () => {
      captureDraft();
      updateColorSwatch();
      schedulePersist();
    });
  });

  noonCategory.addEventListener("change", () => {
    const ad = getCurrentAd();
    if (!ad || !isNoonAd(ad)) return;
    const listed = ensureVehicleFields(ad);
    listed.noonCategory = noonCategory.value;
    listed.noonSubCategory = "";
    listed.noonSubSubCategory = "";
    renderNoonFields(listed);
    schedulePersist();
  });

  noonSubCategory.addEventListener("change", () => {
    const ad = getCurrentAd();
    if (!ad || !isNoonAd(ad)) return;
    const listed = ensureVehicleFields(ad);
    listed.noonCategory = noonCategory.value;
    listed.noonSubCategory = noonSubCategory.value;
    listed.noonSubSubCategory = "";
    renderNoonFields(listed);
    schedulePersist();
  });

  noonSubSubCategory.addEventListener("change", () => {
    const ad = getCurrentAd();
    if (!ad || !isNoonAd(ad)) return;
    const listed = ensureVehicleFields(ad);
    listed.noonCategory = noonCategory.value;
    listed.noonSubCategory = noonSubCategory.value;
    listed.noonSubSubCategory = noonSubSubCategory.value;
    schedulePersist();
  });

  listedMakeModel.addEventListener("input", () => {
    const ad = getCurrentAd();
    if (!ad) {
      return;
    }

    const listed = ensureVehicleFields(ad);
    listed.makeCode = null;
    listed.modelCode = null;
    listed.trim = "";
    listed.trimCode = null;
    listed.availableTrims = [];
    listed.verifiedAt = "";
    renderQueueTrims();
    globalThis.clearTimeout(queueModelDebounce);

    if (listedMakeModel.value.trim().length < 2) {
      queueModelResults.replaceChildren();
      queueModelMessage.textContent = "Type at least two characters.";
      return;
    }

    queueModelDebounce = globalThis.setTimeout(searchQueueModels, 380);
  });

  listedMakeModel.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      globalThis.clearTimeout(queueModelDebounce);
      searchQueueModels();
    }
  });

  listedTrim.addEventListener("change", () => {
    const ad = getCurrentAd();
    if (!ad) {
      return;
    }
    const listed = ensureVehicleFields(ad);
    const selected = listed.availableTrims.find((trim) => trim.label === listedTrim.value);
    listed.trim = selected?.label || "";
    listed.trimCode = selected?.trimCode ?? null;
    listedTrimCopy.value = listed.trim;
    setQueueLiveState(
      queueTrimStatus,
      selected ? "live" : "none",
      selected ? "Live verified" : "Choose trim"
    );
    queueTrimMessage.textContent = selected
      ? `Exact Ayshei trim · Verified ${globalThis.LunaAysheiCore.formatUaeTime(listed.verifiedAt)}.`
      : "Choose one of the live trims.";
    schedulePersist();
  });

  unlistedReason.addEventListener("input", () => {
    captureDraft();
    schedulePersist();
    showReasonSuggestions();
  });
  if (reasonSuggestions) unlistedReason.removeAttribute?.("list");
  unlistedReason.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      markAd("unlisted");
    } else if (event.key === "Escape") {
      hideReasonSuggestions();
    }
  });
  queueNoteText.addEventListener("input", () => {
    queueAddNote.disabled = !String(queueNoteText.value || "").trim();
  });

  queueAddNote.addEventListener("click", () => {
    const ad = getCurrentAd();
    const note = String(queueNoteText.value || "").trim();
    if (!ad || !note) {
      queueNoteMessage.textContent = "Write a note first.";
      return;
    }
    document.dispatchEvent(
      new CustomEvent("luna:work-queue-note", {
        detail: { adName: ad.source.adName, note, vendor: ad.source.vendor }
      })
    );
    queueNoteText.value = "";
    queueAddNote.disabled = true;
    queueNoteMessage.textContent = "Saved in Home → Notes.";
  });

  markListed.addEventListener("click", () => markAd("listed"));
  markUnlisted.addEventListener("click", () => markAd("unlisted"));
  markReview.addEventListener("click", () => markAd("review_later"));
  autoFillButton.addEventListener("click", autoFillCurrentAdvertisement);
  aiBodyTypeButton.addEventListener("click", detectBodyType);
  aiModelTrimButton.addEventListener("click", recommendModelAndTrim);
  aiFillButton.addEventListener("click", fillAiRecommendation);

  previousButton.addEventListener("click", () => {
    captureDraft();
    moveVisible(-1);
    render();
    schedulePersist();
    syncOpenAdTab();
  });

  nextButton.addEventListener("click", () => {
    captureDraft();
    moveVisible(1);
    render();
    schedulePersist();
    syncOpenAdTab();
  });

  queueFilter.addEventListener("change", () => {
    captureDraft();
    const indexes = visibleIndexes();
    const hadMatches = indexes.length > 0;
    if (indexes.length && !indexes.includes(queue.currentIndex)) queue.currentIndex = indexes[0];
    if (!indexes.length) {
      queueFilter.value = "all";
    }
    render();
    if (!hadMatches)
      actionMessage.textContent = "No advertisements match that filter. Showing all ads.";
    schedulePersist();
  });

  goButton.addEventListener("click", () => {
    const requestedIndex = Number(goNumber.value) - 1;

    if (!Number.isInteger(requestedIndex) || !queue.ads[requestedIndex]) {
      actionMessage.textContent = `Enter an Ad Number from 1 to ${queue.ads.length}.`;
      return;
    }

    captureDraft();
    queue.currentIndex = requestedIndex;
    render();
    schedulePersist();
    syncOpenAdTab();
  });

  undoButton.addEventListener("click", async () => {
    const previous = queue.history.pop();

    if (!previous) {
      return;
    }

    queue.ads[previous.index] = previous.ad;
    queue.currentIndex = previous.index;
    await persist();
    render();
    syncOpenAdTab();
  });

  openUrlButton.addEventListener("click", () => {
    openOrUpdateAdTab({ createIfMissing: true }).catch((error) => {
      actionMessage.textContent = "Luna could not open the advertisement tab.";
      console.error("Unable to open the Luna advertisement tab:", error);
    });
  });

  viewSelect?.addEventListener("change", () => {
    captureDraft();
    switchPanel(viewSelect.value);
  });

  copyListed.addEventListener("click", () =>
    copyText(
      listedOutput.value,
      listedOutput,
      "Listed output copied. Paste the tab-separated cells in the shown order."
    )
  );
  copyUnlisted.addEventListener("click", () =>
    copyText(
      unlistedOutput.value,
      unlistedOutput,
      "Unlisted K:N output copied. Paste starting in column K."
    )
  );
  copyReview?.addEventListener("click", () => {
    captureDraft();
    renderOutputs();
    copyText(reviewOutput?.value || "", reviewOutput, "Review Later URLs copied.");
  });
  copyPending?.addEventListener("click", () => {
    captureDraft();
    renderOutputs();
    copyText(pendingOutput?.value || "", pendingOutput, "Pending URLs copied.");
  });

  globalThis.LunaConnection.subscribe(({ payload, state }) => {
    sheetRows = globalThis.LunaConnection.isDataState(state) && payload ? payload.rows : [];
    populateReasons();
  });

  const restore = async () => {
    if (sessionStorageArea) {
      try {
        const savedSession = await sessionStorageArea.get({
          [adTabStorageKey]: null
        });
        const storedTabId = savedSession[adTabStorageKey];
        adTabId = Number.isInteger(storedTabId) ? storedTabId : null;
      } catch (error) {
        console.error("Unable to restore the Luna advertisement tab:", error);
      }
    }

    if (storageArea) {
      try {
        const saved = await storageArea.get({ [storageKey]: null });
        const storedQueue = saved[storageKey];

        if (storedQueue?.version === 1 && Array.isArray(storedQueue.ads)) {
          queue = storedQueue;
          queue.ads.forEach((ad) => ensureVehicleFields(ad));
          queue.history = Array.isArray(queue.history) ? queue.history : [];
          ensureReasonUsage();
          queue.currentIndex = Math.min(
            Math.max(Number(queue.currentIndex) || 0, 0),
            Math.max(queue.ads.length - 1, 0)
          );
        }
      } catch (error) {
        console.error("Unable to restore the Luna Work Queue:", error);
      }
    }

    render();
  };

  restore();

  const applyManualDraft = (draft) => {
    const ad = getCurrentAd();
    if (!ad || isNoonAd(ad) || !draft?.sourceUrl) {
      return false;
    }
    if (
      globalThis.LunaFoundation.urls.identity(ad.source.url) !==
      globalThis.LunaFoundation.urls.identity(draft.sourceUrl)
    ) {
      return false;
    }
    const listed = ensureVehicleFields(ad);
    listed.category = draft.category || listed.category;
    listed.makeModel = draft.makeModel || listed.makeModel;
    listed.makeCode = Number.isInteger(draft.makeCode) ? draft.makeCode : listed.makeCode;
    listed.modelCode = Number.isInteger(draft.modelCode) ? draft.modelCode : listed.modelCode;
    listed.trim = draft.trim || listed.trim;
    listed.trimCode = Number.isInteger(draft.trimCode) ? draft.trimCode : listed.trimCode;
    listed.color = draft.exteriorColor || listed.color;
    if (!isDubiCarsAd(ad)) {
      listed.specs = draft.regionalSpec || listed.specs;
      listed.transmission = draft.transmission || listed.transmission;
    }
    ad.manualAssistant = {
      preparedAt: new Date().toISOString()
    };
    schedulePersist();
    render();
    return true;
  };

  const canApplyManualDraft = (draft) => {
    const ad = getCurrentAd();
    return Boolean(
      ad &&
        !isNoonAd(ad) &&
        draft?.sourceUrl &&
        globalThis.LunaFoundation.urls.identity(ad.source.url) ===
          globalThis.LunaFoundation.urls.identity(draft.sourceUrl)
    );
  };

  return Object.freeze({ applyManualDraft, canApplyManualDraft, render });
})();
