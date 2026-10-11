globalThis.LunaAgentTrackerCore = (() => {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  const normalizeName = (value) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("en");

  const displayName = (value) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ");

  const compareOptionLabels = (left, right) => {
    const leftIsOther = normalizeName(left) === "other";
    const rightIsOther = normalizeName(right) === "other";
    if (leftIsOther !== rightIsOther) return leftIsOther ? 1 : -1;
    return left.localeCompare(right, undefined, { sensitivity: "base" });
  };

  const dateKeyToDay = (dateKey) => {
    const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return null;
    }

    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };

  const getDateRange = (period, todayKey) => {
    const endDay = dateKeyToDay(todayKey);

    if (endDay === null) {
      throw new Error("A valid UAE date is required.");
    }

    const daysBack = {
      last10: 9,
      last7: 6,
      today: 0,
      week: (new Date(endDay).getUTCDay() + 1) % 7
    }[period];

    if (typeof daysBack === "undefined") {
      throw new Error("Unknown tracker date filter.");
    }

    return {
      endDay,
      startDay: endDay - daysBack * millisecondsPerDay
    };
  };

  const getAgentOptions = (rows) => {
    const agents = new Map();

    rows.forEach((row) => {
      const key = normalizeName(row.agentName);

      if (key && !agents.has(key)) {
        agents.set(key, displayName(row.agentName));
      }
    });

    return [...agents.entries()]
      .map(([value, label]) => ({ label, value }))
      .sort((left, right) => compareOptionLabels(left.label, right.label));
  };

  const trackWork = (rows, { agent = "__all__", period, todayKey }) => {
    const { endDay, startDay } = getDateRange(period, todayKey);
    const selectedAgent = agent === "__all__" ? agent : normalizeName(agent);
    const agents = new Map();
    const vendors = new Map();
    let listed = 0;
    let unlisted = 0;
    let auctions = 0;

    rows.forEach((row) => {
      const rowDay = dateKeyToDay(row.date);
      const agentKey = normalizeName(row.agentName);

      if (
        rowDay === null ||
        rowDay < startDay ||
        rowDay > endDay ||
        !agentKey ||
        (selectedAgent !== "__all__" && agentKey !== selectedAgent)
      ) {
        return;
      }

      const listedKey = normalizeName(row.listedVendor);
      const unlistedKey = normalizeName(row.unlistedVendor);
      const auctionKey = normalizeName(row.auctionVendor);

      if (!listedKey && !unlistedKey && !auctionKey) {
        return;
      }

      if (!agents.has(agentKey)) {
        agents.set(agentKey, {
          agentName: displayName(row.agentName),
          auctions: 0,
          listed: 0,
          total: 0,
          unlisted: 0
        });
      }

      const agentResult = agents.get(agentKey);

      const addVendorWork = (vendorKey, vendorValue, type) => {
        if (!vendorKey) {
          return;
        }

        if (!vendors.has(vendorKey)) {
          vendors.set(vendorKey, {
            auctions: 0,
            listed: 0,
            total: 0,
            unlisted: 0,
            vendorName: displayName(vendorValue)
          });
        }

        const vendorResult = vendors.get(vendorKey);
        vendorResult[type] += 1;
        agentResult[type] += 1;

        if (type !== "unlisted") {
          vendorResult.total += 1;
          agentResult.total += 1;
        }

        if (type === "listed") listed += 1;
        else if (type === "unlisted") unlisted += 1;
        else auctions += 1;
      };

      addVendorWork(listedKey, row.listedVendor, "listed");
      addVendorWork(unlistedKey, row.unlistedVendor, "unlisted");
      addVendorWork(auctionKey, row.auctionVendor, "auctions");
    });

    const sortByName = (property) => (left, right) =>
      left[property].localeCompare(right[property], undefined, {
        sensitivity: "base"
      });

    return {
      agents: [...agents.values()].sort(sortByName("agentName")),
      auctions,
      listed,
      total: listed + auctions,
      unlisted,
      vendors: [...vendors.values()].sort(sortByName("vendorName"))
    };
  };

  return Object.freeze({
    getAgentOptions,
    getDateRange,
    normalizeName,
    trackWork
  });
})();
