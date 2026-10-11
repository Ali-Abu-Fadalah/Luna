globalThis.LunaMonthlyPerformance = (() => {
  const $ = (selector) => document.querySelector(selector);
  const monthSelect = $("#monthly-performance-month");
  const agentSelect = $("#monthly-performance-agent");
  const refreshButton = $("#monthly-performance-refresh");
  const status = $("#monthly-performance-status");
  const meta = $("#monthly-performance-meta");
  const message = $("#monthly-performance-message");
  const results = $("#monthly-performance-results");
  const agentBody = $("#monthly-agent-results");
  const dailyBody = $("#monthly-daily-results");
  const vendorBody = $("#monthly-vendor-results");
  const explorerDescription = $("#monthly-explorer-description");
  const explorerButtons = [...document.querySelectorAll("[data-monthly-view]")];
  const sheetView = $(".sheet-connection-view");
  const subviewButtons = [...document.querySelectorAll("[data-sheet-subview-button]")];
  const counts = {
    activeAgents: $("#monthly-active-agents-count"),
    activeDays: $("#monthly-active-days-count"),
    auctions: $("#monthly-auctions-count"),
    listed: $("#monthly-listed-count"),
    total: $("#monthly-total-count"),
    unlisted: $("#monthly-unlisted-count")
  };
  let payload = null;
  let hasLoaded = false;
  let selectedExplorerView = "agents";
  const setStatus = (label, detail) => {
    status.textContent = label;
    status.dataset.trackerState = label.toLowerCase().replace(/\s+/g, "-");
    message.textContent = detail;
  };
  const clearTable = (body) => body.replaceChildren();
  const appendMetricCard = (body, { detail, label, meta, total, width }) => {
    const card = document.createElement("article");
    card.className = "monthly-metric-card";
    const heading = document.createElement("div");
    heading.className = "monthly-metric-heading";
    const name = document.createElement("strong");
    name.textContent = label;
    const value = document.createElement("span");
    value.textContent = String(total);
    heading.append(name, value);
    const detailLine = document.createElement("small");
    detailLine.textContent = detail;
    const metaLine = document.createElement("small");
    metaLine.className = "monthly-metric-meta";
    metaLine.textContent = meta;
    const bar = document.createElement("span");
    bar.className = "monthly-metric-bar";
    const fill = document.createElement("i");
    fill.style.width = `${Math.max(4, width)}%`;
    bar.append(fill);
    card.append(heading, detailLine, metaLine, bar);
    body.append(card);
  };
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  const populateAgents = (agents) => {
    const previous = agentSelect.value || "__all__";
    agentSelect.replaceChildren(new Option("All Agents", "__all__"));
    agents.forEach((agent) =>
      agentSelect.append(
        new Option(
          agent.agentName,
          globalThis.LunaMonthlyPerformanceCore.normalizeName(agent.agentName)
        )
      )
    );
    agentSelect.value = [...agentSelect.options].some((item) => item.value === previous)
      ? previous
      : "__all__";
    agentSelect.disabled = false;
  };
  const populateMonths = (connection) => {
    const selected = connection.selectedMonth || connection.month || "";
    const months = Array.isArray(connection.availableMonths) ? connection.availableMonths : [];
    monthSelect.replaceChildren();
    const included = new Set();
    const appendMonth = (name, year, suffix = "") => {
      if (!name || included.has(name)) return;
      included.add(name);
      const label = `${name}${year ? ` ${year}` : ""}${suffix}`;
      monthSelect.append(new Option(label, name));
    };
    const selectedOption = months.find((month) => month?.name === selected);
    if (!selectedOption && selected) appendMonth(selected, "", " (current, pending)");
    months.forEach((month) => appendMonth(month?.name, month?.year));
    if (!monthSelect.options.length) appendMonth(selected || "Current month", "");
    monthSelect.value = included.has(selected) ? selected : monthSelect.options[0].value;
    monthSelect.disabled = false;
  };
  const render = () => {
    if (!payload) return;
    const performance = globalThis.LunaMonthlyPerformanceCore.summarize(payload.rows, {
      agent: agentSelect.value,
      todayKey: payload.connection.rangeEnd
    });
    counts.listed.textContent = performance.team.listed;
    counts.unlisted.textContent = performance.team.unlisted;
    counts.auctions.textContent = performance.team.auctions;
    counts.total.textContent = performance.team.total;
    counts.activeAgents.textContent = performance.agents.filter((agent) => agent.total > 0).length;
    counts.activeDays.textContent = performance.team.activeDays;
    clearTable(agentBody);
    clearTable(dailyBody);
    clearTable(vendorBody);
    const maximumAgentTotal = Math.max(1, ...performance.agents.map((agent) => agent.total));
    const maximumDailyTotal = Math.max(1, ...performance.daily.map((day) => day.total));
    const maximumVendorTotal = Math.max(1, ...performance.vendors.map((vendor) => vendor.total));
    performance.agents.forEach((agent) =>
      appendMetricCard(agentBody, {
        label: agent.agentName,
        total: agent.total,
        detail: `${agent.listed} listed · ${agent.unlisted} unlisted · ${agent.auctions} auctions`,
        meta: `${agent.activeDays} active days · ${percent(agent.share)} of displayed work · ${agent.averagePerActiveDay.toFixed(1)} average/day`,
        width: (agent.total / maximumAgentTotal) * 100
      })
    );
    performance.daily.forEach((day) =>
      appendMetricCard(dailyBody, {
        label: day.date,
        total: day.total,
        detail: `${day.listed} listed · ${day.unlisted} unlisted · ${day.auctions} auctions`,
        meta: "Recorded team work",
        width: (day.total / maximumDailyTotal) * 100
      })
    );
    performance.vendors.forEach((vendor) =>
      appendMetricCard(vendorBody, {
        label: vendor.agentName,
        total: vendor.total,
        detail: `${vendor.listed} listed · ${vendor.unlisted} unlisted · ${vendor.auctions} auctions`,
        meta: `${percent(vendor.share)} of displayed work`,
        width: (vendor.total / maximumVendorTotal) * 100
      })
    );
    const hasAnyEntries =
      performance.team.listed + performance.team.unlisted + performance.team.auctions > 0;
    results.hidden = !hasAnyEntries;
    const skipped = Object.values(payload.connection.dataQuality || {}).reduce(
      (total, value) => total + Number(value || 0),
      0
    );
    setStatus(
      hasAnyEntries ? "Results Ready" : "No Results",
      hasAnyEntries
        ? `Showing ${performance.team.total} total work items (Listed + Auctions). ${performance.team.unlisted} Unlisted shown separately. ${skipped ? `${skipped} incomplete or out-of-range row${skipped === 1 ? " was" : "s were"} skipped.` : "All rows had a usable date, agent, and work value."}`
        : `No recorded work was found for this agent in ${payload.connection.month}.`
    );
  };
  const refresh = async () => {
    const requestedMonth = monthSelect.value;
    refreshButton.disabled = true;
    monthSelect.disabled = true;
    agentSelect.disabled = true;
    results.hidden = true;
    setStatus(
      "Loading",
      `Reading ${requestedMonth || "the current UAE month"} from the approved read-only Sheet service...`
    );
    try {
      payload = await globalThis.LunaSheet.getMonthlyPerformance({
        force: true,
        month: requestedMonth
      });
      hasLoaded = true;
      const connection = payload.connection;
      const pending = connection.sourceTabState === "pending";
      populateMonths(connection);
      meta.textContent = `${connection.month} · ${connection.rangeStart} to ${connection.rangeEnd} UAE · ${pending ? `monthly tab pending (${(connection.missingTabs || []).join(", ")})` : `source tab: ${connection.tab}`} · updated ${String(
        connection.generatedAt || ""
      )
        .slice(0, 16)
        .replace("T", " ")} UAE`;
      if (pending) {
        setStatus(
          "Pending",
          `The ${connection.month} tab is not available yet. This is expected; refresh after the tab is created.`
        );
        return;
      }
      populateAgents(
        globalThis.LunaMonthlyPerformanceCore.summarize(payload.rows, {
          todayKey: connection.rangeEnd
        }).agents
      );
      render();
    } catch (error) {
      setStatus(
        "Error",
        "Luna could not read the selected month. Check the work Google account, then refresh."
      );
    } finally {
      refreshButton.disabled = false;
      monthSelect.disabled = false;
    }
  };
  const setSubview = (subview) => {
    const isMonthly = subview === "monthly";
    sheetView.classList.toggle("is-monthly-subview", isMonthly);
    document.querySelectorAll("[data-sheet-subview]").forEach((element) => {
      element.hidden = element.dataset.sheetSubview !== subview;
    });
    subviewButtons.forEach((button) => {
      const active = button.dataset.sheetSubviewButton === subview;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (subview === "tools" || subview === "tracker") globalThis.LunaConnection?.ensureLoaded?.();
    if (isMonthly && !hasLoaded) refresh();
    if (subview === "interactions") globalThis.LunaDailyInteractions?.ensureLoaded();
  };
  const setExplorerView = (view) => {
    selectedExplorerView = view;
    const descriptions = {
      agents: "Agent totals, active recorded days, and share of displayed work.",
      daily: "Daily team volume. Only dates with recorded work appear.",
      vendors: "Vendor volume across the displayed agents and month."
    };
    explorerDescription.textContent = descriptions[view];
    const panels = { agents: agentBody, daily: dailyBody, vendors: vendorBody };
    Object.entries(panels).forEach(([key, panel]) => {
      panel.hidden = key !== view;
    });
    explorerButtons.forEach((button) => {
      const active = button.dataset.monthlyView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
  };
  monthSelect.addEventListener("change", refresh);
  agentSelect.addEventListener("change", render);
  refreshButton.addEventListener("click", refresh);
  subviewButtons.forEach((button) =>
    button.addEventListener("click", () => setSubview(button.dataset.sheetSubviewButton))
  );
  explorerButtons.forEach((button) =>
    button.addEventListener("click", () => setExplorerView(button.dataset.monthlyView))
  );
  setExplorerView(selectedExplorerView);
  setSubview("tools");
  return Object.freeze({ refresh, setSubview });
})();
