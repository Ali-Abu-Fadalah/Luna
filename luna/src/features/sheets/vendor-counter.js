globalThis.LunaVendorCounter = (() => {
  const form = document.querySelector("#vendor-counter-form");
  const input = document.querySelector("#vendor-name");
  const options = document.querySelector("#vendor-options");
  const refreshButton = document.querySelector("#vendor-counter-refresh");
  const status = document.querySelector("#vendor-counter-status");
  const message = document.querySelector("#vendor-counter-message");
  const windowLabel = document.querySelector("#vendor-counter-window");
  const results = document.querySelector("#vendor-counter-results");
  const listedCount = document.querySelector("#vendor-listed-count");
  const unlistedCount = document.querySelector("#vendor-unlisted-count");
  const auctionsCount = document.querySelector("#vendor-auctions-count");
  const totalCount = document.querySelector("#vendor-total-count");
  const agentBody = document.querySelector("#vendor-agent-results");

  let rows = [];
  let connectionState = "loading";
  let windowDays = 10;

  const windowText = () => `last ${windowDays} UAE calendar days`;

  const setMessage = (state, text) => {
    status.textContent = state;
    status.dataset.counterState = state.toLowerCase().replace(/\s+/g, "-");
    message.textContent = text;
  };

  const renderOptions = () => {
    options.replaceChildren();

    globalThis.LunaVendorCounterCore.getVendorOptions(rows).forEach((vendorName) => {
      const option = document.createElement("option");
      option.value = vendorName;
      options.append(option);
    });
  };

  const renderAgentRows = (agents) => {
    agentBody.replaceChildren();

    agents.forEach((agent) => {
      const row = document.createElement("tr");

      [
        agent.agentName,
        String(agent.listed),
        String(agent.unlisted),
        String(agent.auctions),
        String(agent.total)
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });

      agentBody.append(row);
    });
  };

  const showCounts = () => {
    const query = input.value;

    if (connectionState === "loading") {
      results.hidden = true;
      setMessage("Loading", `Loading the ${windowText()}...`);
      return;
    }

    if (connectionState === "failed") {
      results.hidden = true;
      setMessage(
        "Connection error",
        "Luna could not read the Sheet. Check your work-account connection and refresh."
      );
      return;
    }

    if (!globalThis.LunaVendorCounterCore.normalizeName(query)) {
      results.hidden = true;
      setMessage("Ready", `Type or select a vendor to count the ${windowText()}.`);
      return;
    }

    const counts = globalThis.LunaVendorCounterCore.countVendor(rows, query);

    if (counts.listed + counts.unlisted + counts.auctions === 0) {
      results.hidden = true;
      setMessage(
        "No results",
        `No exact vendor match was found for “${query.trim()}” in the ${windowText()}.`
      );
      return;
    }

    listedCount.textContent = String(counts.listed);
    unlistedCount.textContent = String(counts.unlisted);
    auctionsCount.textContent = String(counts.auctions);
    totalCount.textContent = String(counts.total);
    renderAgentRows(counts.agents);
    results.hidden = false;
    setMessage(
      "Results ready",
      `Exact match results across ${rows.length} rows from the ${windowText()}.`
    );
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    showCounts();
  });

  input.addEventListener("input", () => {
    if (!input.value.trim()) {
      showCounts();
    }
  });

  refreshButton.addEventListener("click", () => {
    globalThis.LunaConnection.testConnection();
  });

  globalThis.LunaConnection.subscribe(({ payload, state }) => {
    connectionState = state;
    const hasData = globalThis.LunaConnection.isDataState(state) && payload;
    refreshButton.disabled = ["loading", "refreshing"].includes(state);

    if (hasData) {
      rows = payload.rows;
      windowDays = Number(payload.connection.windowDays) || 10;
      windowLabel.textContent = `Available data: ${windowText()}.`;
      renderOptions();
    } else if (state === "failed") {
      rows = [];
      renderOptions();
    }

    showCounts();
  });

  return Object.freeze({ showCounts });
})();
