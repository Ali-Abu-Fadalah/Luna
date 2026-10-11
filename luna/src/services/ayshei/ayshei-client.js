globalThis.LunaAyshei = (() => {
  const send = async (message) => {
    const response = await chrome.runtime.sendMessage({
      ...message,
      type: globalThis.LunaFoundation?.messageTypes.aysheiLookup || "luna.ayshei.lookup"
    });

    if (!response?.ok) {
      throw new Error(response?.detail || "The live Ayshei service is unavailable.");
    }

    return response.data;
  };

  return Object.freeze({
    fetchTrims: (makeCode, modelCode) => send({ makeCode, modelCode, operation: "fetchTrims" }),
    fetchTrimsFromMirror: (modelLabel, yearCode) =>
      send({ modelLabel, operation: "fetchTrimsMirror", yearCode }),
    resolveYearFromMirror: (year) => send({ operation: "resolveYearMirror", year }),
    searchModels: (keyword) => send({ keyword, operation: "searchModels" }),
    searchModelsFromMirror: (keyword, yearCode) =>
      send({ keyword, operation: "searchModelsMirror", yearCode }),
    testConnection: () => send({ operation: "health" })
  });
})();
