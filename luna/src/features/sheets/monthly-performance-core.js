globalThis.LunaMonthlyPerformanceCore = (() => {
  const normalizeName = (value) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("en");
  const displayName = (value) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ");
  const dateToDay = (key) => {
    const match = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Date(day).toISOString().slice(0, 10) === key ? day : null;
  };
  const dateRange = (todayKey) => {
    const endDay = dateToDay(todayKey);
    if (endDay === null) throw new Error("A valid UAE date is required.");
    const date = new Date(endDay);
    return { endDay, startDay: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) };
  };
  const dayKey = (day) => new Date(day).toISOString().slice(0, 10);
  const percent = (part, total) => (total ? part / total : 0);

  const metric = (name) => ({
    activeDays: new Set(),
    agentName: name,
    auctions: 0,
    listed: 0,
    total: 0,
    unlisted: 0
  });
  const add = (target, type, date) => {
    target[type] += 1;
    if (type !== "unlisted") {
      target.total += 1;
      target.activeDays.add(date);
    }
  };
  const finalize = (value, teamTotal) => {
    const activeDays = value.activeDays.size;
    return {
      ...value,
      activeDays,
      averagePerActiveDay: activeDays ? value.total / activeDays : 0,
      share: percent(value.total, teamTotal)
    };
  };

  const summarize = (rows, { agent = "__all__", todayKey } = {}) => {
    const { endDay, startDay } = dateRange(todayKey);
    const selectedAgent = agent === "__all__" ? agent : normalizeName(agent);
    const agents = new Map();
    const vendors = new Map();
    const daily = new Map();
    const agentDaily = new Map();
    const team = metric("Team");

    rows.forEach((row) => {
      const agentKey = normalizeName(row.agentName);
      if (!agentKey || (selectedAgent !== "__all__" && agentKey !== selectedAgent)) return;
      [
        ["listed", row.listedVendor, row.date],
        ["unlisted", row.unlistedVendor, row.unlistedDate],
        ["auctions", row.auctionVendor, row.date]
      ].forEach(([type, vendorValue, workDate]) => {
        const day = dateToDay(workDate);
        const vendorKey = normalizeName(vendorValue);
        if (!vendorKey || day === null || day < startDay || day > endDay) return;
        if (!agents.has(agentKey)) agents.set(agentKey, metric(displayName(row.agentName)));
        const agentMetric = agents.get(agentKey);
        const date = dayKey(day);
        if (!daily.has(date)) daily.set(date, metric(date));
        const dailyMetric = daily.get(date);
        const agentDateKey = `${agentKey}\u0000${date}`;
        if (!agentDaily.has(agentDateKey)) agentDaily.set(agentDateKey, metric(date));
        const agentDailyMetric = agentDaily.get(agentDateKey);
        if (!vendors.has(vendorKey)) vendors.set(vendorKey, metric(displayName(vendorValue)));
        add(team, type, date);
        add(agentMetric, type, date);
        add(dailyMetric, type, date);
        add(agentDailyMetric, type, date);
        add(vendors.get(vendorKey), type, date);
      });
    });

    const teamResult = finalize(team, team.total);
    const dailyResult = [...daily.values()]
      .map((item) => finalize(item, team.total))
      .sort((a, b) => a.agentName.localeCompare(b.agentName));
    const agentResult = [...agents.values()]
      .map((item) => {
        const final = finalize(item, team.total);
        const agentDays = [...agentDaily.entries()]
          .filter(([key]) => key.startsWith(`${normalizeName(item.agentName)}\u0000`))
          .map(([, day]) => finalize(day, team.total));
        const best = agentDays.reduce(
          (bestDay, current) => (!bestDay || current.total > bestDay.total ? current : bestDay),
          null
        );
        return {
          ...final,
          bestRecordedDay: best ? { date: best.agentName, total: best.total } : null
        };
      })
      .sort((a, b) => a.agentName.localeCompare(b.agentName, undefined, { sensitivity: "base" }));

    return {
      agents: agentResult,
      agentDaily: [...agentDaily.entries()]
        .map(([key, item]) => ({
          agentName: agents.get(key.split("\u0000")[0]).agentName,
          date: item.agentName,
          ...finalize(item, team.total)
        }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.agentName.localeCompare(b.agentName)),
      daily: dailyResult.map(({ agentName, ...item }) => ({ date: agentName, ...item })),
      range: { end: dayKey(endDay), start: dayKey(startDay) },
      team: teamResult,
      vendors: [...vendors.values()]
        .map((item) => finalize(item, team.total))
        .sort((a, b) => a.agentName.localeCompare(b.agentName, undefined, { sensitivity: "base" }))
    };
  };

  const sortAgents = (agents, key = "total", direction = "desc") =>
    [...agents].sort((left, right) => {
      const factor = direction === "asc" ? 1 : -1;
      if (key === "name")
        return (
          factor * left.agentName.localeCompare(right.agentName, undefined, { sensitivity: "base" })
        );
      const difference = Number(left[key] || 0) - Number(right[key] || 0);
      return difference
        ? factor * difference
        : left.agentName.localeCompare(right.agentName, undefined, { sensitivity: "base" });
    });

  return Object.freeze({ dateRange, normalizeName, sortAgents, summarize });
})();
