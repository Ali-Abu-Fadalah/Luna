globalThis.LunaDailyInteractions = (() => {
  const $ = (selector) => document.querySelector(selector);
  const agentSelect = $("#interactions-agent");
  const channelSelect = $("#interactions-channel");
  const sourceSelect = $("#interactions-source");
  const monthSelect = $("#interactions-month");
  const monthWrap = $("#interactions-month-wrap");
  const refreshButton = $("#interactions-refresh");
  const status = $("#interactions-status");
  const meta = $("#interactions-meta");
  const message = $("#interactions-message");
  const results = $("#interactions-results");
  const periodButtons = [...document.querySelectorAll("[data-interaction-period]")];
  const viewButtons = [...document.querySelectorAll("[data-interaction-view]")];
  const lists = {
    agents: $("#interactions-agent-results"),
    daily: $("#interactions-daily-results"),
    sources: $("#interactions-source-results")
  };
  const counts = {
    total: $("#interactions-total"),
    inbound: $("#interactions-inbound"),
    outbound: $("#interactions-outbound"),
    chat: $("#interactions-chat")
  };
  let payload = null;
  let loading = false;
  let period = "last7";
  let view = "agents";
  const setStatus = (label, detail) => {
    status.textContent = label;
    status.dataset.trackerState = label.toLowerCase().replace(/\s+/g, "-");
    message.textContent = detail;
  };
  const setPeriod = (next) => {
    period = next;
    periodButtons.forEach((button) => {
      const active = button.dataset.interactionPeriod === next;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    monthWrap.hidden = next !== "month";
    render();
  };
  const setView = (next) => {
    view = next;
    Object.entries(lists).forEach(([key, element]) => {
      element.hidden = key !== next;
    });
    viewButtons.forEach((button) => {
      const active = button.dataset.interactionView === next;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
  };
  const addCard = (container, label, value, detail, width) => {
    const card = document.createElement("article");
    card.className = "monthly-metric-card";
    const heading = document.createElement("div");
    heading.className = "monthly-metric-heading";
    const name = document.createElement("strong");
    name.textContent = label;
    const total = document.createElement("span");
    total.textContent = String(value);
    heading.append(name, total);
    const detailLine = document.createElement("small");
    detailLine.textContent = detail;
    const bar = document.createElement("span");
    bar.className = "monthly-metric-bar";
    const fill = document.createElement("i");
    fill.style.width = `${Math.max(0, width)}%`;
    bar.append(fill);
    card.append(heading, detailLine, bar);
    container.append(card);
  };
  const renderGroup = (container, rows, labelKey, maximum) => {
    container.replaceChildren();
    rows.forEach((item) =>
      addCard(
        container,
        item[labelKey],
        item.total,
        `${item.inbound} inbound · ${item.outbound} outbound · ${item.chat} chats`,
        (item.total / maximum) * 100
      )
    );
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "monthly-explorer-description";
      empty.textContent = "No interactions in this view.";
      container.append(empty);
    }
  };
  const populateFilters = () => {
    const core = globalThis.LunaDailyInteractionsCore;
    const previousAgent = agentSelect.value || "__all__";
    agentSelect.replaceChildren(new Option("All agents", "__all__"));
    core
      .agentOptions(payload.rows)
      .forEach((agent) => agentSelect.append(new Option(agent.label, agent.value)));
    agentSelect.value = [...agentSelect.options].some((option) => option.value === previousAgent)
      ? previousAgent
      : "__all__";
    const previousMonth = monthSelect.value || payload.connection.rangeEnd.slice(0, 7);
    monthSelect.replaceChildren();
    core
      .monthOptions(payload.rows, payload.connection.rangeEnd)
      .forEach((month) => monthSelect.append(new Option(month.label, month.key)));
    monthSelect.value = [...monthSelect.options].some((option) => option.value === previousMonth)
      ? previousMonth
      : monthSelect.options[0]?.value || "";
    [agentSelect, monthSelect, channelSelect, sourceSelect].forEach((element) => {
      element.disabled = false;
    });
  };
  const render = () => {
    if (!payload || payload.connection.sourceTabState !== "available") return;
    const performance = globalThis.LunaDailyInteractionsCore.summarize(payload.rows, {
      agent: agentSelect.value,
      channel: channelSelect.value,
      month: monthSelect.value,
      period,
      source: sourceSelect.value,
      todayKey: payload.connection.rangeEnd
    });
    Object.entries(counts).forEach(([name, element]) => {
      element.textContent = String(performance.totals[name]);
    });
    const maximum = Math.max(1, performance.totals.total);
    renderGroup(lists.agents, performance.agents, "agentName", maximum);
    renderGroup(lists.daily, performance.daily, "date", maximum);
    renderGroup(
      lists.sources,
      performance.sources.filter(
        (item) => sourceSelect.value === "__all__" || item.name === sourceSelect.value
      ),
      "name",
      maximum
    );
    results.hidden = false;
    const skipped = Object.values(payload.connection.dataQuality || {}).reduce(
      (sum, value) => sum + (Number(value) || 0),
      0
    );
    meta.textContent = `${performance.range.start} to ${performance.range.end} UAE · refreshed ${String(
      payload.connection.generatedAt || ""
    )
      .slice(0, 16)
      .replace("T", " ")}`;
    setStatus(
      performance.totals.total ? "Results Ready" : "No Results",
      `${performance.totals.total} interaction${performance.totals.total === 1 ? "" : "s"} in this view.${skipped ? ` ${skipped} incomplete, unknown, or future row${skipped === 1 ? " was" : "s were"} excluded.` : ""}`
    );
  };
  const refresh = async () => {
    if (loading) return;
    loading = true;
    refreshButton.disabled = true;
    setStatus("Loading", "Reading interaction counts from the approved read-only Sheet service...");
    try {
      const next = await globalThis.LunaSheet.getDailyInteractions({ force: true });
      if (next.connection?.mode !== "interactions")
        throw new Error("The interaction service is not updated yet.");
      payload = next;
      if (next.connection.sourceTabState !== "available") {
        results.hidden = true;
        setStatus(
          "Pending",
          "The Daily interactions tab is not available to Luna yet. Check the Apps Script deployment and refresh."
        );
        return;
      }
      populateFilters();
      render();
    } catch (error) {
      results.hidden = true;
      setStatus(
        "Error",
        "Luna could not read Daily interactions. Check the read-only Apps Script deployment and refresh."
      );
    } finally {
      loading = false;
      refreshButton.disabled = false;
    }
  };
  periodButtons.forEach((button) =>
    button.addEventListener("click", () => setPeriod(button.dataset.interactionPeriod))
  );
  viewButtons.forEach((button) =>
    button.addEventListener("click", () => setView(button.dataset.interactionView))
  );
  [agentSelect, channelSelect, sourceSelect, monthSelect].forEach((element) =>
    element.addEventListener("change", render)
  );
  refreshButton.addEventListener("click", refresh);
  setView(view);
  return Object.freeze({
    ensureLoaded: () => {
      if (!payload) refresh();
    },
    refresh
  });
})();
