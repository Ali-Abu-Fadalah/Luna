globalThis.LunaDailyInteractionsCore = (() => {
  const DAY = 24 * 60 * 60 * 1000;
  const normalizeName = (value) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("en");
  const displayName = (value) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ");
  const toDay = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Date(day).toISOString().slice(0, 10) === value ? day : null;
  };
  const dayKey = (value) => new Date(value).toISOString().slice(0, 10);
  const monthOptions = (rows, todayKey) => {
    const keys = new Set([String(todayKey || "").slice(0, 7)]);
    rows.forEach((row) => {
      if (toDay(row.date) !== null) keys.add(row.date.slice(0, 7));
    });
    return [...keys]
      .filter((key) => /^\d{4}-\d{2}$/.test(key))
      .sort()
      .reverse()
      .map((key) => ({
        key,
        label: new Intl.DateTimeFormat("en-US", {
          month: "long",
          year: "numeric",
          timeZone: "UTC"
        }).format(new Date(`${key}-01T12:00:00Z`))
      }));
  };
  const agentOptions = (rows) => {
    const names = new Map();
    rows.forEach((row) => {
      const key = normalizeName(row.agentName);
      if (key && !names.has(key)) names.set(key, displayName(row.agentName));
    });
    return [...names]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  };
  const emptyCount = () => ({ total: 0, inbound: 0, outbound: 0, chat: 0 });
  const add = (target, channel, count) => {
    target.total += count;
    target[channel.toLowerCase()] += count;
  };
  const summarize = (
    rows,
    {
      agent = "__all__",
      channel = "__all__",
      month = "",
      period = "today",
      source = "__all__",
      todayKey
    } = {}
  ) => {
    const today = toDay(todayKey);
    if (today === null) throw new Error("A valid UAE date is required.");
    const chosenMonth = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) ? month : todayKey.slice(0, 7);
    const monthStart = toDay(`${chosenMonth}-01`);
    const monthEnd = Date.UTC(Number(chosenMonth.slice(0, 4)), Number(chosenMonth.slice(5, 7)), 0);
    const allDays = rows
      .map((row) => toDay(row.date))
      .filter((day) => day !== null && day <= today);
    const start =
      period === "all"
        ? allDays.reduce((earliest, day) => Math.min(earliest, day), today)
        : period === "last7"
          ? today - 6 * DAY
          : period === "month"
            ? monthStart
            : today;
    const end = period === "month" ? Math.min(today, monthEnd) : today;
    const totals = emptyCount();
    const agents = new Map();
    const daily = new Map();
    const sources = new Map([
      ["Ayshei", emptyCount()],
      ["Other source", emptyCount()]
    ]);
    rows.forEach((row) => {
      const day = toDay(row.date);
      const agentKey = normalizeName(row.agentName);
      const count = Number(row.count);
      if (
        day === null ||
        day < start ||
        day > end ||
        !agentKey ||
        !Number.isSafeInteger(count) ||
        count <= 0 ||
        !["Inbound", "Outbound", "Chat"].includes(row.channel) ||
        !sources.has(row.source) ||
        (agent !== "__all__" && agentKey !== normalizeName(agent)) ||
        (channel !== "__all__" && row.channel !== channel) ||
        (source !== "__all__" && row.source !== source)
      )
        return;
      if (!agents.has(agentKey))
        agents.set(agentKey, { agentName: displayName(row.agentName), ...emptyCount() });
      if (!daily.has(row.date)) daily.set(row.date, { date: row.date, ...emptyCount() });
      add(totals, row.channel, count);
      add(agents.get(agentKey), row.channel, count);
      add(daily.get(row.date), row.channel, count);
      add(sources.get(row.source), row.channel, count);
    });
    return {
      agents: [...agents.values()].sort(
        (a, b) =>
          b.total - a.total ||
          a.agentName.localeCompare(b.agentName, undefined, { sensitivity: "base" })
      ),
      daily: [...daily.values()].sort((a, b) => b.date.localeCompare(a.date)),
      range: { start: dayKey(start), end: dayKey(end) },
      sources: [...sources].map(([name, counts]) => ({ name, ...counts })),
      totals
    };
  };
  return Object.freeze({ agentOptions, monthOptions, normalizeName, summarize });
})();
