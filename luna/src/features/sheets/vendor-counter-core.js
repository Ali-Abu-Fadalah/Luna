globalThis.LunaVendorCounterCore = (() => {
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

  const getVendorOptions = (rows) => {
    const options = new Map();

    rows.forEach((row) => {
      [row.listedVendor, row.unlistedVendor, row.auctionVendor].forEach((value) => {
        const normalized = normalizeName(value);

        if (normalized && !options.has(normalized)) {
          options.set(normalized, displayName(value));
        }
      });
    });

    return [...options.values()].sort(compareOptionLabels);
  };

  const countVendor = (rows, query) => {
    const normalizedQuery = normalizeName(query);

    if (!normalizedQuery) {
      return { agents: [], auctions: 0, listed: 0, total: 0, unlisted: 0 };
    }

    const agents = new Map();
    let listed = 0;
    let unlisted = 0;
    let auctions = 0;

    rows.forEach((row) => {
      const listedMatch = normalizeName(row.listedVendor) === normalizedQuery;
      const unlistedMatch = normalizeName(row.unlistedVendor) === normalizedQuery;
      const auctionMatch = normalizeName(row.auctionVendor) === normalizedQuery;

      if (!listedMatch && !unlistedMatch && !auctionMatch) {
        return;
      }

      const agentName = displayName(row.agentName) || "Unknown agent";
      const agentKey = normalizeName(agentName);

      if (!agents.has(agentKey)) {
        agents.set(agentKey, {
          agentName,
          auctions: 0,
          listed: 0,
          total: 0,
          unlisted: 0
        });
      }

      const agent = agents.get(agentKey);

      if (listedMatch) {
        listed += 1;
        agent.listed += 1;
        agent.total += 1;
      }

      if (unlistedMatch) {
        unlisted += 1;
        agent.unlisted += 1;
      }
      if (auctionMatch) {
        auctions += 1;
        agent.auctions += 1;
        agent.total += 1;
      }
    });

    return {
      agents: [...agents.values()].sort((left, right) =>
        left.agentName.localeCompare(right.agentName, undefined, {
          sensitivity: "base"
        })
      ),
      auctions,
      listed,
      total: listed + auctions,
      unlisted
    };
  };

  return Object.freeze({ countVendor, getVendorOptions, normalizeName });
})();
