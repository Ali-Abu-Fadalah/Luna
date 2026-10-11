globalThis.LunaAysheiEndpointSettings = (() => {
  const storageKey =
    globalThis.LunaFoundation?.storageKeys.aysheiEndpoint || "luna.aysheiEndpoint.v1";
  const statusStorageKey =
    globalThis.LunaFoundation?.storageKeys.aysheiEndpointStatus || "luna.aysheiEndpointStatus.v1";
  const defaultEndpoint = "mirror";
  const labels = Object.freeze({ mirror: "Mirror", original: "Original" });
  const storageArea = globalThis.chrome?.storage?.local;
  const select = document.querySelector("#settings-ayshei-endpoint");
  const status = document.querySelector("#settings-ayshei-endpoint-status");
  const message = document.querySelector("#settings-ayshei-endpoint-message");
  const testButton = document.querySelector("#settings-test-ayshei-endpoint");
  const lastRequest = document.querySelector("#settings-ayshei-endpoint-last");

  if (!select || !status || !message || !testButton || !lastRequest) {
    return Object.freeze({ ready: Promise.resolve() });
  }

  const isValidEndpoint = (value) => Object.hasOwn(labels, value);
  const selectedEndpoint = () => (isValidEndpoint(select.value) ? select.value : defaultEndpoint);

  const render = (value) => {
    const endpoint = isValidEndpoint(value) ? value : defaultEndpoint;
    select.value = endpoint;
    status.dataset.endpointState = "configured";
    status.textContent = `${labels[endpoint]} selected`;
    message.dataset.kind = "success";
    message.textContent =
      `${labels[endpoint]} is the only endpoint used by Work Queue for Make, Model, and Trim. ` +
      "Manual Ad Assistant always uses Mirror. Luna does not combine results or switch automatically.";
  };

  const formatTime = (value) => {
    const date = new Date(String(value || ""));
    if (!Number.isFinite(date.getTime())) return "unknown time";
    return (
      new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
        minute: "2-digit",
        month: "short",
        timeZone: "Asia/Dubai"
      }).format(date) + " UAE"
    );
  };

  const renderLastRequest = (value) => {
    if (
      value?.version !== 1 ||
      !isValidEndpoint(value.endpoint) ||
      !Number.isFinite(value.durationMs) ||
      typeof value.lastSuccessAt !== "string"
    ) {
      lastRequest.textContent = "No successful catalog request recorded yet.";
      return;
    }
    lastRequest.textContent =
      `Last successful request: ${labels[value.endpoint]} · ` +
      `${Math.max(0, Math.round(value.durationMs))} ms · ` +
      formatTime(value.lastSuccessAt);
  };

  const restore = async () => {
    if (!storageArea?.get) {
      render(defaultEndpoint);
      renderLastRequest(null);
      return;
    }

    try {
      const saved = await storageArea.get({
        [statusStorageKey]: null,
        [storageKey]: defaultEndpoint
      });
      render(saved[storageKey]);
      renderLastRequest(saved[statusStorageKey]);
    } catch (error) {
      render(defaultEndpoint);
      renderLastRequest(null);
      message.dataset.kind = "warning";
      message.textContent =
        "Mirror is selected for this session. Luna could not restore the saved choice.";
    }
  };

  const testSelectedEndpoint = async () => {
    const endpoint = selectedEndpoint();
    testButton.disabled = true;
    status.dataset.endpointState = "testing";
    status.textContent = `Testing ${labels[endpoint]}`;
    message.dataset.kind = "info";
    message.textContent = `Testing ${labels[endpoint]} only. The saved selection will not change.`;

    try {
      const result = await globalThis.LunaAyshei.testConnection();
      if (result?.endpoint !== endpoint) {
        throw new Error("The selected endpoint did not handle the response.");
      }
      await globalThis.LunaAysheiStatus?.reportSuccess?.(result);
      render(endpoint);
      message.textContent = `${labels[endpoint]} responded in ${Math.max(
        0,
        Math.round(Number(result.durationMs) || 0)
      )} ms and remains the only selected source.`;
      message.textContent += " Manual Ad Assistant still uses Mirror.";
      return result;
    } catch (error) {
      await globalThis.LunaAysheiStatus?.reportFailure?.();
      status.dataset.endpointState = "error";
      status.textContent = `${labels[endpoint]} unavailable`;
      message.dataset.kind = "error";
      message.textContent = `${labels[endpoint]} did not respond. Luna did not try ${
        endpoint === "mirror" ? "Original" : "Mirror"
      }. Switch manually if you want to use the other endpoint.`;
      return null;
    } finally {
      testButton.disabled = false;
    }
  };

  select.addEventListener("change", async () => {
    const endpoint = selectedEndpoint();
    render(endpoint);
    if (!storageArea?.set) return;

    try {
      await storageArea.set({ [storageKey]: endpoint });
      await globalThis.LunaAysheiStatus?.refresh?.();
    } catch (error) {
      render(defaultEndpoint);
      message.dataset.kind = "warning";
      message.textContent =
        "Mirror remains selected for this session. Luna could not save the change.";
    }
  });
  testButton.addEventListener("click", testSelectedEndpoint);

  if (globalThis.chrome?.storage?.onChanged?.addListener) {
    globalThis.chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && Object.hasOwn(changes, statusStorageKey)) {
        renderLastRequest(changes[statusStorageKey].newValue);
      }
    });
  }

  const ready = restore();
  return Object.freeze({ ready, testSelectedEndpoint });
})();
