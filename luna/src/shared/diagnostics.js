globalThis.LunaDiagnostics = (() => {
  const VERSION = 1;
  const MAX_ENTRIES = 40;
  const storageKey = globalThis.LunaFoundation.storageKeys.diagnostics;
  const storageArea = globalThis.chrome?.storage?.session;
  const safeToken = (value) => {
    const token = String(value || "").toLowerCase();
    return /^[a-z0-9][a-z0-9._-]{0,47}$/.test(token) ? token : "unknown";
  };
  const sanitizeEntry = (entry) => {
    const timestamp = new Date(String(entry?.timestamp || ""));
    return {
      area: safeToken(entry?.area),
      code: safeToken(entry?.code),
      level: ["error", "info", "warning"].includes(entry?.level) ? entry.level : "info",
      timestamp: Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : "unknown"
    };
  };

  const read = async () => {
    if (!storageArea) return [];
    const saved = await storageArea.get({ [storageKey]: null });
    const payload = saved[storageKey];
    return payload?.version === VERSION && Array.isArray(payload.entries)
      ? payload.entries.slice(-MAX_ENTRIES).map(sanitizeEntry)
      : [];
  };

  const record = async ({ area, code, level = "info" }) => {
    if (!storageArea) return;
    const entries = await read();
    entries.push({
      area: safeToken(area),
      code: safeToken(code),
      level: ["error", "info", "warning"].includes(level) ? level : "info",
      timestamp: new Date().toISOString()
    });
    await storageArea.set({
      [storageKey]: { entries: entries.slice(-MAX_ENTRIES), version: VERSION }
    });
  };

  const buildSafeReport = async ({ version = "unknown" } = {}) => {
    const safeVersion = /^\d+\.\d+\.\d+$/.test(String(version)) ? String(version) : "unknown";
    const entries = await read();
    return [
      `Luna ${safeVersion} safe diagnostics`,
      `Generated: ${new Date().toISOString()}`,
      `Entries: ${entries.length}/${MAX_ENTRIES}`,
      ...entries.map(
        (entry) => `${entry.timestamp} | ${entry.level} | ${entry.area} | ${entry.code}`
      )
    ].join("\n");
  };

  return Object.freeze({ buildSafeReport, read, record });
})();
