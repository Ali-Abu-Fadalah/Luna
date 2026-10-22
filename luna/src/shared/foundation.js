globalThis.LunaFoundation = (() => {
  const storageKeys = Object.freeze({
    activeSection: "luna.activeSection",
    auctions: "luna.auctions.v1",
    aysheiEndpoint: "luna.aysheiEndpoint.v1",
    aysheiEndpointStatus: "luna.aysheiEndpointStatus.v1",
    diagnostics: "luna.diagnostics.v1",
    aiProviderKeys: "luna.aiProviderKeys.v1",
    groqClientId: "luna.groqClientId.v1",
    groqWorkerUrl: "luna.groqWorkerUrl.v1",
    imageDraft: "luna.imageScraper.draft.v1",
    inventory: "luna.inventoryChecker.v1",
    inventorySheetData: "luna.inventorySheetData.v1",
    listingSeparator: "luna.scraper.addSeparator.v1",
    manualAdDraft: "luna.manualAd.draft.v2",
    rawDataSend: "luna.rawDataSend.v1",
    retiredAysheiLookupCache: "luna.aysheiLookup.v1",
    sheetCache: "luna.sheetCache.v1",
    workQueue: "luna.workQueue.v1",
    workQueueAdTab: "luna.workQueue.adTabId",
    workQueueNotes: "luna.workQueueNotes.v1"
  });

  const messageTypes = Object.freeze({
    aysheiLookup: "luna.ayshei.lookup",
    groq: "luna.groq",
    imageFetch: "luna.manualAd.fetchImage",
    imageUpload: "luna.imageScraper.upload.v2",
    inventoryCapture: "luna.inventory.capture",
    manualAdFill: "luna.manualAd.fill"
  });

  const storageSchemas = Object.freeze({
    activeSection: Object.freeze({ area: "local", key: storageKeys.activeSection, version: 0 }),
    auctions: Object.freeze({ area: "local", key: storageKeys.auctions, version: 1 }),
    aysheiEndpoint: Object.freeze({ area: "local", key: storageKeys.aysheiEndpoint, version: 1 }),
    aysheiEndpointStatus: Object.freeze({
      area: "local",
      key: storageKeys.aysheiEndpointStatus,
      version: 1
    }),
    diagnostics: Object.freeze({ area: "session", key: storageKeys.diagnostics, version: 1 }),
    aiProviderKeys: Object.freeze({ area: "local", key: storageKeys.aiProviderKeys, version: 1 }),
    groqClientId: Object.freeze({ area: "local", key: storageKeys.groqClientId, version: 1 }),
    groqWorkerUrl: Object.freeze({ area: "sync", key: storageKeys.groqWorkerUrl, version: 1 }),
    imageDraft: Object.freeze({ area: "local", key: storageKeys.imageDraft, version: 1 }),
    inventory: Object.freeze({ area: "local", key: storageKeys.inventory, version: 1 }),
    inventorySheetData: Object.freeze({
      area: "local",
      key: storageKeys.inventorySheetData,
      version: 1
    }),
    listingSeparator: Object.freeze({
      area: "local",
      key: storageKeys.listingSeparator,
      version: 1
    }),
    manualAdDraft: Object.freeze({ area: "local", key: storageKeys.manualAdDraft, version: 2 }),
    rawDataSend: Object.freeze({ area: "local", key: storageKeys.rawDataSend, version: 1 }),
    retiredAysheiLookupCache: Object.freeze({
      area: "local",
      key: storageKeys.retiredAysheiLookupCache,
      retired: true,
      version: 1
    }),
    sheetCache: Object.freeze({ area: "local", key: storageKeys.sheetCache, version: 2 }),
    workQueue: Object.freeze({ area: "local", key: storageKeys.workQueue, version: 1 }),
    workQueueAdTab: Object.freeze({ area: "session", key: storageKeys.workQueueAdTab, version: 0 }),
    workQueueNotes: Object.freeze({ area: "local", key: storageKeys.workQueueNotes, version: 1 })
  });

  const adapterMethods = Object.freeze({
    detail: Object.freeze(["supports", "extract"]),
    image: Object.freeze(["supports", "collect"]),
    listing: Object.freeze(["supports", "collect"])
  });

  const normalizeUrlIdentity = (value) => {
    let url;
    try {
      url = new URL(String(value || ""));
    } catch (error) {
      return "";
    }

    if (![/^http:$/, /^https:$/].some((pattern) => pattern.test(url.protocol))) {
      return "";
    }

    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    const keptParameters = [...url.searchParams.entries()]
      .filter(([name]) => !/^(?:utm_.+|fbclid|gclid)$/i.test(name))
      .sort(
        ([leftName, leftValue], [rightName, rightValue]) =>
          leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue)
      );
    url.search = "";
    keptParameters.forEach(([name, parameterValue]) => {
      url.searchParams.append(name, parameterValue);
    });
    return url.href;
  };

  const validateActiveTab = (tab, { expectedUrl = "", hosts = [] } = {}) => {
    if (!Number.isInteger(tab?.id) || tab.id <= 0) {
      return Object.freeze({ ok: false, reason: "missing-tab" });
    }
    const identity = normalizeUrlIdentity(tab.url);
    if (!identity) {
      return Object.freeze({ ok: false, reason: "unsupported-url" });
    }
    const hostname = new URL(identity).hostname;
    const allowedHosts = hosts.map((host) => String(host).toLowerCase());
    if (allowedHosts.length && !allowedHosts.includes(hostname)) {
      return Object.freeze({ ok: false, reason: "wrong-host" });
    }
    const expectedIdentity = expectedUrl ? normalizeUrlIdentity(expectedUrl) : "";
    if (expectedUrl && (!expectedIdentity || identity !== expectedIdentity)) {
      return Object.freeze({ ok: false, reason: "url-mismatch" });
    }
    return Object.freeze({ identity, ok: true, tabId: tab.id });
  };

  const renderStatus = (element, { datasetKey = "lunaState", label, state }) => {
    if (!element || !/^[a-z][a-zA-Z0-9]*$/.test(datasetKey)) {
      return false;
    }
    element.dataset[datasetKey] = String(state || "unknown");
    element.textContent = String(label || "");
    return true;
  };

  const defineAdapter = (kind, adapter) => {
    const methods = adapterMethods[kind];
    if (!methods || !adapter || typeof adapter !== "object") {
      throw new TypeError("Unknown Luna adapter kind or invalid adapter.");
    }
    if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(String(adapter.id || ""))) {
      throw new TypeError("A Luna adapter needs a safe, stable id.");
    }
    methods.forEach((method) => {
      if (typeof adapter[method] !== "function") {
        throw new TypeError(`The ${adapter.id} adapter must implement ${method}().`);
      }
    });
    return Object.freeze({ ...adapter, kind });
  };

  const readPreserved = async (storageArea, schemaName, fallback = null) => {
    const schema = storageSchemas[schemaName];
    if (!schema || !storageArea?.get) {
      return fallback;
    }
    const saved = await storageArea.get({ [schema.key]: fallback });
    return saved[schema.key];
  };

  return Object.freeze({
    adapters: Object.freeze({ define: defineAdapter, methods: adapterMethods }),
    messageTypes,
    status: Object.freeze({ render: renderStatus }),
    storage: Object.freeze({ readPreserved, schemas: storageSchemas }),
    storageKeys,
    tabs: Object.freeze({ validateActive: validateActiveTab }),
    urls: Object.freeze({ identity: normalizeUrlIdentity })
  });
})();
