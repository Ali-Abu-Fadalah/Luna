globalThis.LunaAgentTracker = (() => {
  const agentSelect = document.querySelector("#tracker-agent");
  const periodButtons = [...document.querySelectorAll(".tracker-period")];
  const refreshButton = document.querySelector("#tracker-refresh");
  const status = document.querySelector("#tracker-status");
  const message = document.querySelector("#tracker-message");
  const results = document.querySelector("#tracker-results");
  const listedCount = document.querySelector("#tracker-listed-count");
  const unlistedCount = document.querySelector("#tracker-unlisted-count");
  const auctionsCount = document.querySelector("#tracker-auctions-count");
  const totalCount = document.querySelector("#tracker-total-count");
  const vendorBody = document.querySelector("#tracker-vendor-results");
  const allAgentsSection = document.querySelector("#tracker-all-agents");
  const agentBody = document.querySelector("#tracker-agent-results");

  let connectionState = "loading";
  let rows = [];
  let todayKey = "";
  let selectedPeriod = "today";

  const getUaeTodayKey = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Dubai",
      year: "numeric"
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
  };

  const setStatus = (label, text) => {
    status.textContent = label;
    status.dataset.trackerState = label.toLowerCase().replace(/\s+/g, "-");
    message.textContent = text;
  };

  const populateAgents = () => {
    const previousValue = agentSelect.value || "__all__";
    agentSelect.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "__all__";
    allOption.textContent = "All Agents";
    agentSelect.append(allOption);

    globalThis.LunaAgentTrackerCore.getAgentOptions(rows).forEach((agent) => {
      const option = document.createElement("option");
      option.value = agent.value;
      option.textContent = agent.label;
      agentSelect.append(option);
    });

    agentSelect.value = [...agentSelect.options].some((option) => option.value === previousValue)
      ? previousValue
      : "__all__";
  };

  const renderTable = (body, items, nameProperty) => {
    body.replaceChildren();

    items.forEach((item) => {
      const row = document.createElement("tr");

      [
        item[nameProperty],
        String(item.listed),
        String(item.unlisted),
        String(item.auctions),
        String(item.total)
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });

      body.append(row);
    });
  };

  const render = () => {
    if (connectionState === "loading") {
      results.hidden = true;
      setStatus("Loading", "Loading agent work from the last 10 UAE calendar days...");
      return;
    }

    if (connectionState === "failed") {
      results.hidden = true;
      setStatus(
        "Error",
        "Luna could not read the Sheet. Check your work-account connection and refresh."
      );
      return;
    }

    const tracked = globalThis.LunaAgentTrackerCore.trackWork(rows, {
      agent: agentSelect.value,
      period: selectedPeriod,
      todayKey: todayKey || getUaeTodayKey()
    });

    if (tracked.listed + tracked.unlisted + tracked.auctions === 0) {
      results.hidden = true;
      setStatus("No Results", "No work was found for this agent and date filter.");
      return;
    }

    listedCount.textContent = String(tracked.listed);
    unlistedCount.textContent = String(tracked.unlisted);
    auctionsCount.textContent = String(tracked.auctions);
    totalCount.textContent = String(tracked.total);
    renderTable(vendorBody, tracked.vendors, "vendorName");
    renderTable(agentBody, tracked.agents, "agentName");
    allAgentsSection.hidden = agentSelect.value !== "__all__";
    results.hidden = false;
    setStatus(
      "Results Ready",
      `Showing ${tracked.total} total work items (Listed + Auctions). ${tracked.unlisted} Unlisted shown separately.`
    );
  };

  agentSelect.addEventListener("change", render);

  periodButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedPeriod = button.dataset.period;
      periodButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      render();
    });
  });

  refreshButton.addEventListener("click", () => {
    globalThis.LunaConnection.testConnection();
  });

  globalThis.LunaConnection.subscribe(({ payload, state }) => {
    connectionState = state;
    const hasData = globalThis.LunaConnection.isDataState(state) && payload;
    refreshButton.disabled = ["loading", "refreshing"].includes(state);
    agentSelect.disabled = !hasData;

    if (hasData) {
      rows = payload.rows;
      todayKey = String(payload.connection.generatedAt || "").slice(0, 10);
      populateAgents();
    } else if (state === "failed") {
      rows = [];
      populateAgents();
    }

    render();
  });

  return Object.freeze({ render });
})();
