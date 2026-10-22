globalThis.LunaGroq = (() => {
  const send = async (message) => {
    const response = await chrome.runtime.sendMessage({
      ...message,
      type: globalThis.LunaFoundation?.messageTypes.groq || "luna.groq"
    });
    if (!response?.ok) throw new Error(response?.detail || "The Luna AI Router is unavailable.");
    return response.data;
  };
  const analyze = async (input, { signal, deadline, sourceScope = "" } = {}) => {
    const requestId = crypto.randomUUID();
    const timeoutMs = deadline ? Math.min(14500, deadline - Date.now()) : 14500;
    const cancelled = () =>
      Object.assign(new Error("AI request cancelled or timed out."), { name: "AbortError" });
    if (signal?.aborted || timeoutMs < 800) throw cancelled();
    let rejectCancelled;
    const cancellation = new Promise((_, reject) => {
      rejectCancelled = reject;
    });
    const cancel = () => {
      send({ operation: "cancel", requestId }).catch(() => {});
      rejectCancelled(cancelled());
    };
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs);
    try {
      return await Promise.race([
        send({ input, operation: "analyze", requestId, timeoutMs, sourceScope }),
        cancellation
      ]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  };
  return Object.freeze({
    analyze,
    clearLocalKey: (provider) => send({ operation: "clearLocalKey", provider }),
    clearWorkerUrl: () => send({ operation: "clearWorkerUrl" }),
    saveLocalKey: (provider, apiKey) => send({ operation: "saveLocalKey", provider, apiKey }),
    saveWorkerUrl: (workerUrl) => send({ operation: "saveWorkerUrl", workerUrl }),
    status: () => send({ operation: "status" }),
    test: () => send({ operation: "test" }),
    testLocalProvider: (provider) => send({ operation: "testLocalProvider", provider })
  });
})();
