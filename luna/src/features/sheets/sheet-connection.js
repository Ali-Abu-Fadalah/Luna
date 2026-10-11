globalThis.LunaConnection = (() => {
  const homeStatus = document.querySelector("#home-sheet-status");
  const homeDetail = document.querySelector("#home-sheet-detail");
  const connectionStatus = document.querySelector("#sheet-connection-status");
  const connectionDetail = document.querySelector("#sheet-connection-detail");
  const connectionTab = document.querySelector("#sheet-connection-tab");
  const connectionRows = document.querySelector("#sheet-connection-rows");
  const connectionWindow = document.querySelector("#sheet-date-window");
  const connectionRefresh = document.querySelector("#sheet-connection-refresh");
  const settingsStatus = document.querySelector("#settings-sheet-status");
  const settingsTest = document.querySelector("#settings-test-connection");
  const storageArea = globalThis.chrome?.storage?.local;
  const cacheKey = globalThis.LunaFoundation?.storageKeys.sheetCache || "luna.sheetCache.v1";
  const cacheMaximumAgeMilliseconds = 24 * 60 * 60 * 1000;
  const maximumCachedWindows = 3;
  const liveRefreshAgeMilliseconds = 5 * 60 * 1000;

  let requestPromise = null;
  let restorePromise = null;
  let hasTestedConnection = false;
  let lastSuccessfulRequestAt = 0;
  let latestPayload = null;
  let currentState = "loading";
  const subscribers = new Set();

  const statusLabels = {
    cached: "Saved data",
    connected: "Connected",
    failed: globalThis.LunaConfig?.publicBuild ? "Not included" : "Connection failed",
    loading: "Loading",
    refreshing: "Refreshing"
  };

  const applyStatus = (state, detail, homeSummary = "") => {
    currentState = state;
    const label = statusLabels[state];

    [homeStatus, connectionStatus, settingsStatus].forEach((element) => {
      element.textContent = label;
      element.dataset.connectionState = state;
    });

    connectionDetail.textContent = detail;
    homeDetail.textContent = homeSummary || detail;
    globalThis.LunaHomeStatus?.updateService("sheet", { state });
  };

  const notifySubscribers = (error = null) => {
    const snapshot = Object.freeze({
      error,
      payload: latestPayload,
      state: currentState
    });

    subscribers.forEach((subscriber) => subscriber(snapshot));
  };

  const getSelectedWindowDays = () => {
    const windowDays = globalThis.LunaSheet.normalizeWindowDays(connectionWindow.value);
    connectionWindow.value = String(windowDays);
    return windowDays;
  };

  const isDataState = (state) => ["cached", "connected", "refreshing"].includes(state);

  const formatGeneratedAt = (payload) => {
    const generatedAt = String(payload?.connection?.generatedAt || "");
    return generatedAt ? `${generatedAt.slice(0, 16).replace("T", " ")} UAE` : "an earlier time";
  };

  const renderPayloadSummary = (payload) => {
    const { connection, rows } = payload;
    connectionTab.textContent = connection.tab;
    connectionRows.textContent = String(rows.length);
    connectionWindow.value = String(connection.windowDays);
  };

  const buildConnectedDetail = (payload) => {
    const { connection, rows } = payload;
    const missingTabs = Array.isArray(connection.missingTabs) ? connection.missingTabs : [];
    const missingDetail = missingTabs.length
      ? ` ${missingTabs.join(" + ")} ${missingTabs.length === 1 ? "tab is" : "tabs are"} not available yet and ${missingTabs.length === 1 ? "was" : "were"} skipped.`
      : "";

    return `Received ${rows.length} rows from the last ${connection.windowDays} UAE days.${missingDetail} Updated ${formatGeneratedAt(payload)}.`;
  };

  const applyPayload = (payload, state, detail, error = null) => {
    latestPayload = payload;
    renderPayloadSummary(payload);
    const sourceLabel = ["cached", "refreshing"].includes(state) ? "Saved" : "Live";
    applyStatus(
      state,
      detail,
      `${sourceLabel} ${payload.rows.length} rows · updated ${formatGeneratedAt(payload)}`
    );
    notifySubscribers(error);
  };

  const readCachedPayload = async (windowDays) => {
    if (!storageArea?.get) {
      return null;
    }

    try {
      const saved = await storageArea.get({ [cacheKey]: null });
      const cache = saved[cacheKey];
      const entry = cache?.version === 1 ? cache.windows?.[String(windowDays)] : null;

      if (
        !entry ||
        !Number.isFinite(entry.savedAt) ||
        Date.now() - entry.savedAt > cacheMaximumAgeMilliseconds
      ) {
        return null;
      }

      const payload = globalThis.LunaSheet.validatePayload(entry.payload);

      return Number(payload.connection.windowDays) === windowDays
        ? { payload, savedAt: entry.savedAt }
        : null;
    } catch (error) {
      console.error("Unable to restore the saved Luna Sheet result:", error);
      return null;
    }
  };

  const saveCachedPayload = async (payload) => {
    if (!storageArea?.get || !storageArea?.set) {
      return;
    }

    try {
      const saved = await storageArea.get({ [cacheKey]: null });
      const existing = saved[cacheKey];
      const windows = existing?.version === 1 && existing.windows ? { ...existing.windows } : {};
      windows[String(payload.connection.windowDays)] = {
        payload,
        savedAt: Date.now()
      };
      const newestWindows = Object.fromEntries(
        Object.entries(windows)
          .sort((left, right) => right[1].savedAt - left[1].savedAt)
          .slice(0, maximumCachedWindows)
      );

      await storageArea.set({
        [cacheKey]: { version: 1, windows: newestWindows }
      });
    } catch (error) {
      console.error("Unable to save the Luna Sheet result:", error);
    }
  };

  const runTestConnection = async ({ force }) => {
    const windowDays = getSelectedWindowDays();
    const hasMatchingPayload =
      latestPayload && Number(latestPayload.connection.windowDays) === windowDays;
    hasTestedConnection = true;
    connectionRefresh.disabled = true;
    connectionWindow.disabled = true;
    settingsTest.disabled = true;

    if (hasMatchingPayload) {
      applyPayload(
        latestPayload,
        "refreshing",
        `Showing ${latestPayload.rows.length} saved rows while Luna refreshes live data. Last updated ${formatGeneratedAt(latestPayload)}.`
      );
    } else {
      applyStatus(
        "loading",
        "Checking the approved read-only Sheet service...",
        "Checking approved read-only service."
      );
      notifySubscribers();
    }

    try {
      const payload = await globalThis.LunaSheet.testConnection(windowDays, { force });
      lastSuccessfulRequestAt = Date.now();
      applyPayload(payload, "connected", buildConnectedDetail(payload));
      await saveCachedPayload(payload);
      return payload;
    } catch (error) {
      if (!globalThis.LunaConfig?.publicBuild)
        console.error("Luna Sheet connection failed:", error);

      if (hasMatchingPayload) {
        applyPayload(
          latestPayload,
          "cached",
          `The live refresh did not finish. Showing ${latestPayload.rows.length} saved rows from ${formatGeneratedAt(latestPayload)}. Use Refresh Connection to try again.`,
          error
        );
      } else {
        latestPayload = null;
        connectionTab.textContent = "Unavailable";
        connectionRows.textContent = "0";
        applyStatus(
          "failed",
          error?.message?.includes("20 seconds")
            ? "The Sheet did not respond within 20 seconds. Use Refresh Connection to try again."
            : error?.message ||
                "The Sheet service is unavailable. Use Refresh Connection to try again.",
          "No live or recent saved Sheet data."
        );
        notifySubscribers(error);
      }

      return null;
    } finally {
      connectionRefresh.disabled = false;
      connectionWindow.disabled = false;
      settingsTest.disabled = false;
    }
  };

  // Every caller awaits the same live request instead of receiving an empty startup snapshot.
  const testConnection = ({ force = true } = {}) => {
    if (requestPromise) return requestPromise;
    requestPromise = Promise.resolve()
      .then(() => runTestConnection({ force }))
      .finally(() => {
        requestPromise = null;
      });
    return requestPromise;
  };

  const restoreAndRefresh = ({ force = false, reset = false } = {}) => {
    if (restorePromise) return restorePromise;
    if (requestPromise) return requestPromise;
    restorePromise = Promise.resolve()
      .then(async () => {
        const windowDays = getSelectedWindowDays();
        if (reset) latestPayload = null;

        const cached = await readCachedPayload(windowDays);
        if (cached && !latestPayload) {
          applyPayload(
            cached.payload,
            "refreshing",
            `Showing ${cached.payload.rows.length} saved rows while Luna refreshes live data. Last updated ${formatGeneratedAt(cached.payload)}.`
          );
        }

        return testConnection({ force });
      })
      .finally(() => {
        restorePromise = null;
      });
    return restorePromise;
  };

  const ensureLoaded = () => {
    if (restorePromise) return restorePromise;
    if (requestPromise) return requestPromise;
    const fresh =
      currentState === "connected" &&
      latestPayload &&
      Number(latestPayload.connection.windowDays) === getSelectedWindowDays() &&
      Date.now() - lastSuccessfulRequestAt < liveRefreshAgeMilliseconds;
    if (hasTestedConnection && fresh) return Promise.resolve(latestPayload);
    return restoreAndRefresh({ force: true });
  };

  connectionRefresh.addEventListener("click", () => testConnection());
  connectionWindow.addEventListener("change", () =>
    restoreAndRefresh({ force: true, reset: true })
  );
  settingsTest.addEventListener("click", () => testConnection());

  restoreAndRefresh();

  return Object.freeze({
    onSectionShown(sectionId) {
      if (sectionId === "sheet-statistics") return ensureLoaded();
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      subscriber(
        Object.freeze({
          error: null,
          payload: latestPayload,
          state: currentState
        })
      );

      return () => subscribers.delete(subscriber);
    },
    isDataState,
    ensureLoaded,
    testConnection
  });
})();
