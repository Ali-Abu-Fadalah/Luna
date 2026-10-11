globalThis.LunaSheet = (() => {
  const endpoint = globalThis.LunaConfig?.sheetEndpoint;
  const defaultWindowDays = 10;
  const maximumWindowDays = 30;
  const minimumWindowDays = 1;
  const requestTimeoutMilliseconds = 20000;

  const normalizeWindowDays = (value) => {
    if (value === null || typeof value === "undefined" || String(value).trim() === "") {
      return defaultWindowDays;
    }

    const days = Number(value);

    if (!Number.isInteger(days)) {
      return defaultWindowDays;
    }

    return Math.min(maximumWindowDays, Math.max(minimumWindowDays, days));
  };

  const validatePayload = (payload) => {
    if (payload?.ok !== true || !payload.connection || !Array.isArray(payload.rows)) {
      throw new Error("The Sheet service returned an invalid response.");
    }

    return payload;
  };

  const requestSheetData = async ({
    force = false,
    mode = "window",
    month = "",
    requestedWindowDays = defaultWindowDays
  } = {}) => {
    if (!endpoint) {
      throw new Error("The Luna Sheet endpoint is not configured.");
    }

    const windowDays = normalizeWindowDays(requestedWindowDays);
    const separator = endpoint.includes("?") ? "&" : "?";
    const params = new URLSearchParams(mode === "interactions" ? {} : { days: String(windowDays) });

    if (mode === "month" || mode === "interactions") {
      params.set("mode", mode);
    }
    if (mode === "month") {
      if (String(month).trim()) {
        params.set("month", String(month).trim());
      }
    }

    const requestUrl = `${endpoint}${separator}${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
    let response;

    try {
      response = await fetch(requestUrl, {
        cache: force ? "no-store" : "default",
        credentials: "include",
        headers: {
          Accept: "application/json"
        },
        method: "GET",
        redirect: "follow",
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("The Sheet service did not respond within 20 seconds.");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`The Sheet service returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("Google sign-in is required or the Sheet service is unavailable.");
    }

    return validatePayload(await response.json());
  };

  const testConnection = (requestedWindowDays = defaultWindowDays, { force = false } = {}) =>
    requestSheetData({ force, requestedWindowDays, mode: "window" });

  const getMonthlyPerformance = ({ force = false, month = "" } = {}) =>
    requestSheetData({ force, mode: "month", month, requestedWindowDays: defaultWindowDays });

  const getDailyInteractions = ({ force = false } = {}) =>
    requestSheetData({ force, mode: "interactions", requestedWindowDays: defaultWindowDays });

  return Object.freeze({
    getDailyInteractions,
    getMonthlyPerformance,
    normalizeWindowDays,
    requestTimeoutMilliseconds,
    testConnection,
    validatePayload
  });
})();
