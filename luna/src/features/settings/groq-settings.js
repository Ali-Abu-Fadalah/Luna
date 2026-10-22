globalThis.LunaGroqSettings = (() => {
  const input = document.querySelector("#settings-groq-worker-url");
  const saveButton = document.querySelector("#settings-save-groq-worker-url");
  const testButton = document.querySelector("#settings-test-groq");
  const clearButton = document.querySelector("#settings-clear-groq-worker-url");
  const badge = document.querySelector("#settings-groq-status");
  const message = document.querySelector("#settings-groq-message");
  const localBadge = document.querySelector("#settings-local-ai-status");
  const localMessage = document.querySelector("#settings-local-ai-message");
  const providers = ["groq", "gemini", "openrouter"].map((name) => ({
    clear: document.querySelector(`#settings-clear-local-${name}`),
    input: document.querySelector(`#settings-local-${name}-key`),
    message: document.querySelector(`#settings-local-${name}-message`),
    name,
    save: document.querySelector(`#settings-save-local-${name}`),
    status: document.querySelector(`#settings-local-${name}-status`),
    test: document.querySelector(`#settings-test-local-${name}`)
  }));
  const providerLabel = (name) =>
    name === "openrouter" ? "OpenRouter" : name[0].toUpperCase() + name.slice(1);
  const renderWorker = ({
    connected = false,
    detail = "",
    error = false,
    host = "",
    workerUrl = ""
  }) => {
    const state = connected ? "connected" : workerUrl ? (error ? "error" : "saved") : "missing";
    badge.dataset.groqState = state;
    badge.textContent = connected
      ? "AI Router connected"
      : workerUrl
        ? error
          ? "Connection failed"
          : "Saved · not tested"
        : "Worker URL missing";
    input.value = workerUrl || "";
    testButton.disabled = !workerUrl;
    clearButton.disabled = !workerUrl;
    message.textContent =
      detail ||
      (workerUrl
        ? `Ready through ${host || "Cloudflare"}. The Worker is Luna's preferred AI connection.`
        : "Add the Worker URL, or configure a local provider below.");
  };
  const renderLocal = (status = {}) => {
    const saved = status.localProviders || {};
    const names = providers
      .filter(({ name }) => saved[name])
      .map(({ name }) => providerLabel(name));
    localBadge.dataset.localAiState = names.length ? "ready" : "missing";
    localBadge.textContent = names.length
      ? `${names.length} local key${names.length === 1 ? "" : "s"} saved`
      : "No local keys";
    localMessage.textContent = names.length
      ? `${names.join(", ")} will be tried only if the AI Router cannot be used. Saved values are never shown again.`
      : "Saved values are never shown again, synced, included in diagnostics, or sent to the AI Router.";
    providers.forEach((provider) => {
      const isSaved = Boolean(saved[provider.name]);
      provider.status.dataset.localProviderState = isSaved ? "saved" : "missing";
      provider.status.textContent = isSaved ? "Saved" : "Not saved";
      provider.test.disabled = !isSaved;
      provider.clear.disabled = !isSaved;
      if (!isSaved) provider.message.textContent = "Stored only in this Chrome profile.";
    });
  };
  const refresh = async () => {
    const status = await globalThis.LunaGroq.status();
    renderWorker(status);
    renderLocal(status);
    return status;
  };
  saveButton.addEventListener("click", async () => {
    try {
      const saved = await globalThis.LunaGroq.saveWorkerUrl(input.value);
      renderWorker({ ...saved, detail: "Worker URL saved. Checking AI Router now…" });
      const tested = await globalThis.LunaGroq.test();
      renderWorker({
        ...tested,
        connected: true,
        detail: `AI Router connected through ${tested.host}. ${
          Object.entries(tested.providers || {})
            .filter(([, ready]) => ready)
            .map(([name]) => name)
            .join(", ") || "Groq"
        } verified.${tested.degraded ? " Some providers are unavailable; available providers can still be used." : ""}`
      });
    } catch (error) {
      const current = await globalThis.LunaGroq.status();
      renderWorker({ ...current, detail: error.message, error: Boolean(current.workerUrl) });
      renderLocal(current);
    }
  });
  testButton.addEventListener("click", async () => {
    try {
      const result = await globalThis.LunaGroq.test();
      renderWorker({
        ...result,
        connected: true,
        detail: `Connected: ${
          Object.entries(result.providers || {})
            .filter(([, ready]) => ready)
            .map(([name]) => name)
            .join(", ") || "Groq"
        }.${result.degraded ? " Some providers are unavailable." : ""}`
      });
    } catch (error) {
      const current = await globalThis.LunaGroq.status();
      renderWorker({ ...current, detail: error.message, error: true });
      renderLocal(current);
    }
  });
  clearButton.addEventListener("click", async () => {
    await globalThis.LunaGroq.clearWorkerUrl();
    renderWorker({});
    renderLocal(await globalThis.LunaGroq.status());
  });
  providers.forEach((provider) => {
    provider.save.addEventListener("click", async () => {
      try {
        const status = await globalThis.LunaGroq.saveLocalKey(provider.name, provider.input.value);
        provider.input.value = "";
        renderLocal(status);
        provider.message.textContent = "Saved locally. The value is hidden after saving.";
      } catch (error) {
        provider.message.textContent = error.message;
      }
    });
    provider.test.addEventListener("click", async () => {
      provider.status.dataset.localProviderState = "testing";
      provider.status.textContent = "Testing…";
      try {
        const result = await globalThis.LunaGroq.testLocalProvider(provider.name);
        provider.status.dataset.localProviderState = "saved";
        provider.status.textContent = "Verified";
        provider.message.textContent = result.verifiedModels
          ? `Verified: ${result.verifiedModels.join(", ")}.${result.unavailableModels?.length ? ` Unavailable: ${result.unavailableModels.map((item) => item.model).join(", ")}. Images need a vision model.` : ""}`
          : `${result.provider} is ready with Luna's approved model.`;
      } catch (error) {
        provider.status.dataset.localProviderState = "error";
        provider.status.textContent = "Test failed";
        provider.message.textContent = error.message;
      }
    });
    provider.clear.addEventListener("click", async () => {
      const status = await globalThis.LunaGroq.clearLocalKey(provider.name);
      provider.input.value = "";
      renderLocal(status);
    });
  });
  return Object.freeze({
    ready: refresh().catch((error) => {
      renderWorker({ detail: error.message, error: true });
      renderLocal({});
    })
  });
})();
