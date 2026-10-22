globalThis.LunaSheetReportCore = (() => {
  const DAY = 24 * 60 * 60 * 1000;
  const clean = (value) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ");
  const key = (value) => clean(value).toLocaleLowerCase("en");
  const validDate = (value) => {
    const text = String(value ?? "");
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return false;
    const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Date(day).toISOString().slice(0, 10) === text;
  };
  const makeCount = () => ({ listed: 0, unlisted: 0, auctions: 0, workTotal: 0, trackerTotal: 0 });
  const addWork = (target, outcome) => {
    const field = outcome.toLowerCase();
    target[field] += 1;
    if (outcome !== "Unlisted") {
      target.trackerTotal += 1;
      target.workTotal += 1;
    }
  };
  const makeInteraction = () => ({ inbound: 0, outbound: 0, chat: 0, total: 0 });
  const addInteraction = (target, channel, count) => {
    target[channel.toLowerCase()] += count;
    target.total += count;
  };
  const getOrCreate = (map, id, create) => {
    if (!map.has(id)) map.set(id, create());
    return map.get(id);
  };
  const workEvents = (rows, start, end) => {
    const events = [];
    rows.forEach((row) => {
      const agent = clean(row.agentName);
      if (!agent) return;
      [
        ["Listed", row.listedVendor, row.date],
        ["Unlisted", row.unlistedVendor, row.unlistedDate],
        ["Auctions", row.auctionVendor, row.date]
      ].forEach(([outcome, vendor, workDate]) => {
        const date = String(workDate || "");
        if (!validDate(date) || date < start || date > end) return;
        if (clean(vendor))
          events.push({
            date,
            month: date.slice(0, 7),
            agent,
            vendor: clean(vendor),
            outcome,
            reason: outcome === "Unlisted" ? clean(row.unlistedReason) : "",
            credit: outcome === "Unlisted" ? 0 : 1
          });
      });
    });
    return events;
  };
  const summarizeEvents = (events) =>
    events.reduce((totals, event) => {
      addWork(totals, event.outcome);
      return totals;
    }, makeCount());
  const summarizeInteractions = (rows) =>
    rows.reduce((totals, row) => {
      addInteraction(totals, row.channel, row.count);
      return totals;
    }, makeInteraction());
  const byName = (left, right) => left.localeCompare(right, undefined, { sensitivity: "base" });
  const buildReport = ({ months, recent, interactions, selectedMonth = "" }) => {
    if (!Array.isArray(months) || !months.length)
      throw new Error("No monthly work tabs are available for the report.");
    if (
      recent?.connection?.mode !== "window" ||
      Number(recent.connection.windowDays) !== 30 ||
      recent.connection.missingTabs?.length
    )
      throw new Error("The recent 30-day work window is incomplete.");
    if (
      interactions?.connection?.mode !== "interactions" ||
      interactions.connection.sourceTabState !== "available"
    )
      throw new Error("Daily interactions is not available to the report.");
    const monthMap = new Map();
    months.forEach((payload) => {
      const connection = payload?.connection;
      if (
        connection?.mode !== "month" ||
        connection.sourceTabState !== "available" ||
        connection.auctionsTabState !== "available" ||
        !validDate(connection.rangeStart) ||
        !validDate(connection.rangeEnd) ||
        !Array.isArray(payload.rows)
      )
        throw new Error("A monthly work source is incomplete.");
      const month = connection.rangeStart.slice(0, 7);
      if (monthMap.has(month)) throw new Error(`The ${month} work source was repeated.`);
      monthMap.set(month, payload);
    });
    if (recent.connection.auctionsTabState !== "available")
      throw new Error("The Auctions tab is unavailable to the report.");
    if (!Array.isArray(recent.rows) || !Array.isArray(interactions.rows))
      throw new Error("The Sheet service returned incomplete report data.");

    const work = [...monthMap]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([, payload]) =>
        workEvents(payload.rows, payload.connection.rangeStart, payload.connection.rangeEnd)
      );
    const recentWork = workEvents(
      recent.rows,
      recent.connection.rangeStart,
      recent.connection.rangeEnd
    );
    const interactionRows = interactions.rows
      .map((row) => ({
        date: String(row.date || ""),
        month: String(row.date || "").slice(0, 7),
        agent: clean(row.agentName),
        company: row.source,
        channel: row.channel,
        count: Number(row.count)
      }))
      .filter(
        (row) =>
          validDate(row.date) &&
          row.date <= interactions.connection.rangeEnd &&
          row.agent &&
          ["Ayshei", "Other source"].includes(row.company) &&
          ["Inbound", "Outbound", "Chat"].includes(row.channel) &&
          Number.isSafeInteger(row.count) &&
          row.count > 0
      );
    if (interactionRows.length !== interactions.rows.length)
      throw new Error("The interaction source has an invalid grouped row.");
    if (summarizeInteractions(interactionRows).total !== Number(interactions.connection.rowsRead))
      throw new Error("Interaction source counts do not reconcile.");

    const monthlyAgents = new Map();
    const dailyWork = new Map();
    const vendors = new Map();
    const agentDays = new Map();
    work.forEach((event) => {
      const agentId = key(event.agent);
      const agent = getOrCreate(monthlyAgents, `${event.month}\u0000${agentId}`, () => ({
        month: event.month,
        agent: event.agent,
        days: new Set(),
        ...makeCount()
      }));
      if (event.credit) agent.days.add(event.date);
      addWork(agent, event.outcome);
      const day = getOrCreate(dailyWork, `${event.date}\u0000${agentId}`, () => ({
        date: event.date,
        month: event.month,
        agent: event.agent,
        ...makeCount()
      }));
      addWork(day, event.outcome);
      const vendor = getOrCreate(
        vendors,
        `monthly\u0000${event.month}\u0000${key(event.vendor)}\u0000${agentId}`,
        () => ({
          scope: "Monthly",
          period: event.month,
          vendor: event.vendor,
          agent: event.agent,
          ...makeCount()
        })
      );
      addWork(vendor, event.outcome);
      const perDay = getOrCreate(
        agentDays,
        `${event.month}\u0000${agentId}\u0000${event.date}`,
        () => ({ date: event.date, total: 0 })
      );
      if (event.credit) perDay.total += 1;
    });
    const agentRows = [...monthlyAgents.values()]
      .map((row) => {
        const best = [...agentDays]
          .filter(([id]) => id.startsWith(`${row.month}\u0000${key(row.agent)}\u0000`))
          .map(([, value]) => value)
          .sort((a, b) => b.total - a.total || a.date.localeCompare(b.date))[0];
        return {
          ...row,
          activeDays: row.days.size,
          average: row.days.size ? row.workTotal / row.days.size : 0,
          bestDay: best?.date || "",
          bestDayWork: best?.total || 0
        };
      })
      .sort((a, b) => b.month.localeCompare(a.month) || byName(a.agent, b.agent));

    const today = recent.connection.rangeEnd;
    const todayDay = Date.UTC(
      Number(today.slice(0, 4)),
      Number(today.slice(5, 7)) - 1,
      Number(today.slice(8, 10))
    );
    const periods = [
      { name: "Today", start: today },
      {
        name: "This week",
        start: new Date(todayDay - ((new Date(todayDay).getUTCDay() + 6) % 7) * DAY)
          .toISOString()
          .slice(0, 10)
      },
      { name: "Last 7 days", start: new Date(todayDay - 6 * DAY).toISOString().slice(0, 10) },
      { name: "Last 10 days", start: new Date(todayDay - 9 * DAY).toISOString().slice(0, 10) },
      { name: "Last 30 days", start: recent.connection.rangeStart }
    ];
    const recentRows = new Map();
    periods.forEach((period) =>
      recentWork.forEach((event) => {
        if (event.date < period.start || event.date > today) return;
        const item = getOrCreate(recentRows, `${period.name}\u0000${key(event.agent)}`, () => ({
          period: period.name,
          start: period.start,
          end: today,
          agent: event.agent,
          ...makeCount()
        }));
        addWork(item, event.outcome);
        if (period.name === "Last 30 days") {
          const vendor = getOrCreate(
            vendors,
            `recent\u0000${key(event.vendor)}\u0000${key(event.agent)}`,
            () => ({
              scope: "Recent 30 days",
              period: `${period.start} to ${today}`,
              vendor: event.vendor,
              agent: event.agent,
              ...makeCount()
            })
          );
          addWork(vendor, event.outcome);
        }
      })
    );

    const interactionAgents = new Map();
    const interactionDaily = new Map();
    interactionRows.forEach((row) => {
      const agent = getOrCreate(
        interactionAgents,
        `${row.month}\u0000${key(row.agent)}\u0000${row.company}`,
        () => ({ month: row.month, agent: row.agent, company: row.company, ...makeInteraction() })
      );
      addInteraction(agent, row.channel, row.count);
      const day = getOrCreate(
        interactionDaily,
        `${row.date}\u0000${key(row.agent)}\u0000${row.company}`,
        () => ({ date: row.date, agent: row.agent, company: row.company, ...makeInteraction() })
      );
      addInteraction(day, row.channel, row.count);
    });

    const leaderboardByMonth = new Map([...monthMap.keys()].map((month) => [month, new Map()]));
    const leaderboardEntry = (month, agent) =>
      getOrCreate(leaderboardByMonth.get(month), key(agent), () => ({
        month,
        agent,
        listed: 0,
        unlisted: 0,
        auctions: 0,
        workTotal: 0,
        activeDays: 0,
        ...makeInteraction()
      }));
    agentRows.forEach((row) => {
      const entry = leaderboardEntry(row.month, row.agent);
      ["listed", "unlisted", "auctions", "workTotal", "activeDays"].forEach((field) => {
        entry[field] = row[field];
      });
    });
    interactionAgents.forEach((row) => {
      if (!leaderboardByMonth.has(row.month)) return;
      const entry = leaderboardEntry(row.month, row.agent);
      ["inbound", "outbound", "chat", "total"].forEach((field) => {
        entry[field] += row[field];
      });
    });
    const leaderboard = [...leaderboardByMonth]
      .sort(([a], [b]) => b.localeCompare(a))
      .flatMap(([, agents]) => {
        const entries = [...agents.values()];
        const maxWork = Math.max(0, ...entries.map((entry) => entry.workTotal));
        const maxInteractions = Math.max(0, ...entries.map((entry) => entry.total));
        const activeStreams = Number(maxWork > 0) + Number(maxInteractions > 0);
        entries.forEach((entry) => {
          entry.workIndex = maxWork ? Math.round((entry.workTotal / maxWork) * 1000) / 10 : 0;
          entry.interactionIndex = maxInteractions
            ? Math.round((entry.total / maxInteractions) * 1000) / 10
            : 0;
          entry.activityIndex = activeStreams
            ? Math.round(
                (((maxWork ? entry.workTotal / maxWork : 0) +
                  (maxInteractions ? entry.total / maxInteractions : 0)) /
                  activeStreams) *
                  1000
              ) / 10
            : 0;
          entry.summary = `${entry.listed} listed, ${entry.auctions} auctions; ${entry.inbound} inbound, ${entry.outbound} outbound, ${entry.chat} chats.${entry.unlisted ? ` ${entry.unlisted} unlisted (not credited).` : ""}`;
        });
        entries.sort(
          (a, b) =>
            b.activityIndex - a.activityIndex ||
            b.workTotal - a.workTotal ||
            b.total - a.total ||
            byName(a.agent, b.agent)
        );
        return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
      });

    const monthKeys = [...monthMap.keys()].sort().reverse();
    const interactionMonthKeys = [...new Set(interactionRows.map((row) => row.month))]
      .sort()
      .reverse();
    const agentNames = new Map();
    [
      ...work.map((item) => item.agent),
      ...recentWork.map((item) => item.agent),
      ...interactionRows.map((item) => item.agent)
    ].forEach((name) => {
      if (!agentNames.has(key(name))) agentNames.set(key(name), name);
    });
    const defaultMonth = monthKeys.includes(selectedMonth) ? selectedMonth : monthKeys[0];
    const monthSources = [...monthMap]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, payload]) => ({
        month,
        tab: payload.connection.tab,
        generatedAt: payload.connection.generatedAt,
        sourceRows: payload.connection.rowsRead,
        ...summarizeEvents(
          workEvents(payload.rows, payload.connection.rangeStart, payload.connection.rangeEnd)
        ),
        quality: payload.connection.dataQuality || {}
      }));
    const result = {
      defaultMonth,
      generatedAt: interactions.connection.generatedAt,
      months: monthKeys,
      interactionMonths: interactionMonthKeys,
      agents: [...agentNames.values()].sort(byName),
      work,
      recentWork,
      interactionRows,
      monthlyAgents: agentRows,
      leaderboard,
      dailyWork: [...dailyWork.values()].sort(
        (a, b) => b.date.localeCompare(a.date) || byName(a.agent, b.agent)
      ),
      vendors: [...vendors.values()].sort(
        (a, b) =>
          a.scope.localeCompare(b.scope) ||
          b.period.localeCompare(a.period) ||
          byName(a.vendor, b.vendor) ||
          byName(a.agent, b.agent)
      ),
      recentRows: [...recentRows.values()].sort(
        (a, b) =>
          periods.findIndex((item) => item.name === a.period) -
            periods.findIndex((item) => item.name === b.period) || byName(a.agent, b.agent)
      ),
      interactionAgents: [...interactionAgents.values()].sort(
        (a, b) =>
          b.month.localeCompare(a.month) || byName(a.agent, b.agent) || byName(a.company, b.company)
      ),
      interactionDaily: [...interactionDaily.values()].sort(
        (a, b) =>
          b.date.localeCompare(a.date) || byName(a.agent, b.agent) || byName(a.company, b.company)
      ),
      audit: {
        monthSources,
        recent: {
          rangeStart: recent.connection.rangeStart,
          rangeEnd: recent.connection.rangeEnd,
          generatedAt: recent.connection.generatedAt,
          sourceRows: recent.connection.rowsRead,
          quality: recent.connection.dataQuality || {},
          ...summarizeEvents(recentWork)
        },
        interactions: {
          rangeStart: interactions.connection.rangeStart,
          rangeEnd: interactions.connection.rangeEnd,
          generatedAt: interactions.connection.generatedAt,
          sourceRows: interactions.connection.rowsRead,
          groupedRows: interactions.connection.groupedRows,
          quality: interactions.connection.dataQuality || {},
          ...summarizeInteractions(interactionRows)
        }
      }
    };
    return result;
  };
  return Object.freeze({ buildReport });
})();
