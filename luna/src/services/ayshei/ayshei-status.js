globalThis.LunaAysheiStatus = (() => {
  const status = document.querySelector("#home-ayshei-status");
  const detail = document.querySelector("#home-ayshei-detail");
  if (!status || !detail) return Object.freeze({ ready: Promise.resolve() });

  const labels = Object.freeze({ mirror: "Mirror", original: "Original" });

  const render = (state, label) =>
    globalThis.LunaFoundation.status.render(status, {
      datasetKey: "aysheiState",
      label,
      state
    });

  const record = async (entry) => {
    try {
      await globalThis.LunaDiagnostics?.record(entry);
    } catch (error) {
      // Diagnostics must never interrupt a visible Luna workflow.
    }
  };

  const reportSuccess = async (result) => {
    const endpointLabel = labels[result?.endpoint] || "Selected endpoint";
    const duration = Number.isFinite(result?.durationMs)
      ? ` in ${Math.round(result.durationMs)} ms`
      : "";
    render("connected", `${endpointLabel} connected`);
    detail.textContent = `${endpointLabel} handled the live check${duration}. No automatic switching.`;
    globalThis.LunaHomeStatus?.updateService("ayshei", { state: "connected" });
    await record({ area: "ayshei", code: "connection-ok" });
  };

  const reportFailure = async () => {
    render("error", "Selected endpoint unavailable");
    detail.textContent =
      "Luna did not try the other endpoint. Open Settings if you want to switch manually.";
    globalThis.LunaHomeStatus?.updateService("ayshei", { state: "error" });
    await record({
      area: "ayshei",
      code: "connection-failed",
      level: "error"
    });
  };

  const refresh = async () => {
    if (globalThis.LunaConfig?.publicBuild) {
      render("unavailable", "Not included");
      detail.textContent = "Private catalog connections are omitted from the public edition.";
      globalThis.LunaHomeStatus?.updateService("ayshei", { state: "unavailable" });
      return;
    }
    render("loading", "Loading");
    detail.textContent = "Checking the selected endpoint only.";
    globalThis.LunaHomeStatus?.updateService("ayshei", { state: "loading" });
    try {
      await reportSuccess(await globalThis.LunaAyshei.testConnection());
    } catch (error) {
      await reportFailure();
    }
  };

  const ready = refresh();
  return Object.freeze({ ready, refresh, reportFailure, reportSuccess });
})();
