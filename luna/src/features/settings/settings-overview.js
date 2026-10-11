globalThis.LunaSettingsOverview = (() => {
  const versionView = document.querySelector("#settings-luna-version");
  const storageView = document.querySelector("#settings-storage-summary");
  const copyButton = document.querySelector("#settings-copy-diagnostics");
  const message = document.querySelector("#settings-diagnostics-message");

  if (!versionView || !storageView || !copyButton || !message) {
    return Object.freeze({ ready: Promise.resolve() });
  }

  const version = String(globalThis.chrome?.runtime?.getManifest?.().version || "unknown");
  const localKeys = Object.values(globalThis.LunaFoundation?.storage?.schemas || {})
    .filter((schema) => schema.area === "local" && schema.retired !== true)
    .map((schema) => schema.key);

  versionView.textContent = version;

  const refresh = async () => {
    let usedAreas = 0;
    let diagnosticCount = 0;
    try {
      const saved = globalThis.chrome?.storage?.local?.get
        ? await globalThis.chrome.storage.local.get(localKeys)
        : {};
      usedAreas = localKeys.filter(
        (key) => saved[key] !== null && typeof saved[key] !== "undefined"
      ).length;
    } catch (error) {
      // A count failure should not expose or alter saved data.
    }
    try {
      diagnosticCount = (await globalThis.LunaDiagnostics.read()).length;
    } catch (error) {
      // Diagnostics are optional session metadata.
    }
    storageView.textContent =
      `${usedAreas}/${localKeys.length} local · ` + `${diagnosticCount}/40 diagnostic events`;
  };

  copyButton.addEventListener("click", async () => {
    copyButton.disabled = true;
    try {
      const report = await globalThis.LunaDiagnostics.buildSafeReport({ version });
      await globalThis.navigator.clipboard.writeText(report);
      message.textContent =
        "Safe diagnostics copied. No endpoints, credentials, tokens, vendor content, or image URLs were included.";
    } catch (error) {
      message.textContent = "Luna could not copy safe diagnostics.";
    } finally {
      copyButton.disabled = false;
    }
  });

  globalThis.chrome?.storage?.onChanged?.addListener?.(() => refresh());
  const ready = refresh();
  return Object.freeze({ ready, refresh });
})();
