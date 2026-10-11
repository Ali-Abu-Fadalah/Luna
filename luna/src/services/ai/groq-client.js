globalThis.LunaGroq = (() => {
  const send = async (message) => {
    const response = await chrome.runtime.sendMessage({
      ...message,
      type: globalThis.LunaFoundation?.messageTypes.groq || "luna.groq"
    });
    if (!response?.ok) throw new Error(response?.detail || "The Luna AI Router is unavailable.");
    return response.data;
  };
  return Object.freeze({
    analyze: (input) => send({ input, operation: "analyze" }),
    clearLocalKey: (provider) => send({ operation: "clearLocalKey", provider }),
    clearWorkerUrl: () => send({ operation: "clearWorkerUrl" }),
    saveLocalKey: (provider, apiKey) => send({ operation: "saveLocalKey", provider, apiKey }),
    saveWorkerUrl: (workerUrl) => send({ operation: "saveWorkerUrl", workerUrl }),
    status: () => send({ operation: "status" }),
    test: () => send({ operation: "test" }),
    testLocalProvider: (provider) => send({ operation: "testLocalProvider", provider })
  });
})();
