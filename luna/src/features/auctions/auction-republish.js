globalThis.LunaAuctionRepublish = (() => {
  const host = globalThis.LunaAuctions,
    core = globalThis.LunaAuctionRepublishCore,
    api = globalThis.LunaAuctionRepublishAPI;
  const $ = (id) => document.getElementById(`auction-republish-${id}`);
  const storageKey = "luna.auctions.republish.v1";
  const risky = (entry) =>
    ["sending", "checking", "uncertain", "awaiting_manual", "link_pending"].includes(entry.status);
  const empty = () => ({
    version: 2,
    rows: [],
    entries: [],
    history: [],
    previewSource: "",
    review: true,
    tabId: null,
    id: ""
  });
  let state = empty(),
    restored = false,
    connecting = false,
    stop = false,
    editing = null,
    draft = null;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const remember = (entry) => entry.status === "complete" || risky(entry);
  const historyKey = (entry) =>
    JSON.stringify([
      core.signature(entry.plan),
      entry.receipt?.id || entry.prepared?.ticket || entry.completedAt || entry.rowId
    ]);
  const migrate = (saved) => {
    if (saved?.version === 2 && Array.isArray(saved.rows) && Array.isArray(saved.entries))
      return {
        ...empty(),
        ...saved,
        entries: core.recover(saved.entries),
        history: core.recover(saved.history || [])
      };
    const value = empty();
    if (saved?.version === 1)
      value.history = core
        .recover([...(saved.history || []), ...(saved.entries || [])])
        .filter(remember)
        .map((entry) => ({ ...entry, tabId: entry.tabId || saved.tabId }));
    return value;
  };
  const notify = (text, kind = "info") => {
    $("status").textContent = text;
    $("status").hidden = !text;
    $("status").dataset.kind = kind;
  };
  const persist = () => chrome.storage.local.set({ [storageKey]: state });
  const dirty = () => host.sourceText() !== state.previewSource;
  const next = () => state.entries.find((entry) => entry.status !== "complete");
  const signature = (row) => core.signature(core.validate(row).plan);
  const seen = (row) =>
    [...state.entries, ...state.history].find(
      (entry) => remember(entry) && core.signature(entry.plan) === signature(row)
    );
  const rowStatus = {
    queued: "Ready",
    prepared: "Ready",
    blocked: "Needs attention",
    awaiting_manual: "Waiting for your republish",
    sending: "Republishing…",
    checking: "Checking result…",
    uncertain: "Result needs checking",
    link_pending: "Getting auction link",
    complete: "Done"
  };
  const withLock = async (task) => {
    if (!navigator.locks) throw new Error("Reload Luna in Chrome before using this batch.");
    return navigator.locks.request(
      "luna.auction.republish",
      { ifAvailable: true },
      async (lock) => {
        if (!lock)
          throw new Error(
            "Another Luna window is working. Use that window or wait for its current row."
          );
        const saved = await chrome.storage.local.get({ [storageKey]: null });
        state = migrate(saved[storageKey]);
        try {
          return await task();
        } finally {
          await persist();
          host.refresh();
        }
      }
    );
  };
  const local = (task) => withLock(task).catch((error) => notify(error.message, "error"));
  const perform = (task) => host.run(() => withLock(task));
  const archive = (entries = state.entries) => {
    const all = [
      ...state.history,
      ...entries
        .filter(remember)
        .map((entry) => ({ ...clone(entry), tabId: entry.tabId || state.tabId }))
    ];
    state.history = [...new Map(all.map((entry) => [historyKey(entry), entry])).values()];
  };
  const setRows = async (rows, source) =>
    withLock(async () => {
      archive();
      state.entries = [];
      state.id = "";
      state.tabId = null;
      state.previewSource = source;
      state.rows = rows.map((row, index) => ({
        ...row,
        id: `republish-${crypto.randomUUID()}`,
        order: index + 1,
        selected: true
      }));
      const known = new Set();
      for (const row of state.rows) {
        const key = signature(row);
        if (known.has(key) || seen(row)) row.selected = false;
        known.add(key);
      }
      editing = null;
      draft = null;
    });
  const selectedRows = () => state.rows.filter((row) => row.selected);
  const checkRows = () => {
    const chosen = selectedRows();
    if (!chosen.length) throw new Error("Select a row from this preview.");
    const signatures = new Set();
    for (const row of chosen) {
      const validation = core.validate(row);
      if (!validation.valid) throw new Error(`Row ${row.order}: ${validation.issues.join(" ")}`);
      const key = core.signature(validation.plan);
      if (signatures.has(key))
        throw new Error(`Row ${row.order} duplicates another selected row. Remove one copy.`);
      signatures.add(key);
      const prior = state.history.find(
        (entry) => remember(entry) && core.signature(entry.plan) === key
      );
      if (prior)
        throw new Error(
          prior.status === "complete"
            ? `Row ${row.order} was already completed. Its link is in History.`
            : `Row ${row.order} already has a result to check in History. It will not be sent again.`
        );
    }
    return chosen;
  };
  const synchronize = (required = true) => {
    const chosen = required || selectedRows().length ? checkRows() : [],
      selected = new Set(chosen.map((row) => row.id));
    const retained = [];
    for (const entry of state.entries) {
      const row = chosen.find((item) => item.id === entry.rowId);
      if (entry.status === "complete" || (row && core.signature(entry.plan) === signature(row)))
        retained.push(entry);
      else if (remember(entry)) archive([entry]);
    }
    state.entries = retained;
    for (const row of chosen)
      if (
        !state.entries.some(
          (entry) => entry.rowId === row.id && core.signature(entry.plan) === signature(row)
        )
      )
        state.entries.push({
          rowId: row.id,
          order: row.order,
          plan: core.validate(row).plan,
          status: "queued",
          issue: ""
        });
    state.entries = state.entries
      .filter((entry) => entry.status === "complete" || selected.has(entry.rowId))
      .sort((a, b) => a.order - b.order);
    state.id ||= crypto.randomUUID();
  };
  const ensure = async (entry) => {
    if (risky(entry) || entry.status === "complete")
      throw new Error(
        "This row has already reached the admin. Check its result instead of sending it again."
      );
    const row = state.rows.find((item) => item.id === entry.rowId);
    if (!row || signature(row) !== core.signature(entry.plan))
      throw new Error("This preview changed. Review the current row before continuing.");
    entry.prepared = await api.call(state.tabId, "prepare", {
      row: {
        title: row.title,
        startDate: row.startDate,
        endDate: row.endDate,
        startPrice: row.startPrice,
        reservePrice: row.reservePrice,
        tamara: row.tamara
      }
    });
    if (core.signature(entry.prepared.plan) !== core.signature(entry.plan))
      throw new Error("The admin preparation differs from this preview. Processing stopped.");
    entry.status = "prepared";
    entry.issue = "";
    await persist();
    entry.prepared = await api.call(state.tabId, "arm", { prepared: entry.prepared });
    await persist();
  };
  const getResult = async (entry, polls = 3) => {
    if (!entry.receipt) {
      for (let attempt = 0; attempt < polls; attempt++) {
        entry.receipt = await api.call(entry.tabId || state.tabId, "verify", {
          prepared: entry.prepared
        });
        if (entry.receipt) break;
        if (attempt + 1 < polls) await new Promise((done) => setTimeout(done, 1000));
      }
      if (!entry.receipt)
        throw new Error(
          "The new auction is not visible yet. Check the admin, then click Check result again. This row will not be republished again."
        );
      entry.status = "link_pending";
      await persist();
    }
    entry.link = await api.link(entry.receipt);
    entry.status = "complete";
    entry.issue = "";
    entry.completedAt = Date.now();
    const row = state.rows.find((item) => item.id === entry.rowId);
    if (row) row.selected = false;
    await persist();
    host.refresh();
  };
  const openReview = async (entry) => {
    await ensure(entry);
    entry.status = "awaiting_manual";
    await persist();
    host.refresh();
    await chrome.tabs.update(state.tabId, { active: true });
    await api.call(state.tabId, "review", { prepared: entry.prepared });
    notify(
      `Row ${entry.order} is filled. Check it in the admin and click Republish yourself, then Check result & next here.`
    );
  };
  const continuous = async () => {
    stop = false;
    while (next() && !stop) {
      const entry = next();
      if (risky(entry)) throw new Error("Check this row's existing result before continuing.");
      try {
        notify(`Republishing row ${entry.order}: ${entry.plan.title}`);
        await ensure(entry);
        entry.status = "sending";
        await persist();
        host.refresh();
        const result = await api.call(state.tabId, "commit", { prepared: entry.prepared });
        entry.status = result.confirmed ? "checking" : "uncertain";
        entry.issue = result.issue || "";
        await persist();
        await getResult(entry, 8);
      } catch (error) {
        if (entry.status === "sending")
          entry.status = error.definitelyUnsent ? "blocked" : "uncertain";
        entry.issue = error.message;
        await persist();
        throw error;
      }
    }
    notify(
      next()
        ? "Paused. Click Continue batch when ready."
        : "Batch complete. Your auction links are ready below.",
      "success"
    );
  };
  const advance = async () => {
    const current = next();
    if (current && risky(current)) {
      await getResult(current);
      synchronize(false);
      await persist();
      if (next() && state.review) await openReview(next());
      else
        notify(
          next()
            ? "Result saved. Continue the batch when ready."
            : "Batch complete. Your auction links are ready below.",
          "success"
        );
      return;
    }
    synchronize();
    await persist();
    if (state.review) await openReview(next());
    else await continuous();
  };
  const copy = async () => {
    await navigator.clipboard.writeText(core.tsv(state.entries));
    notify("Auction links copied in the same order as this batch.", "success");
  };
  const primary = async () => {
    if (host.isBusy() || connecting || editing) return;
    if (dirty())
      return notify("Your paste changed. Click Review rows to replace this preview first.");
    if (state.entries.length && !next())
      return copy().catch(() => notify("Copy failed. You can copy the links below.", "error"));
    const current = next();
    try {
      if (!current || !risky(current)) checkRows();
      connecting = true;
      render();
      const tabId = current?.receipt ? state.tabId : await api.connect();
      await perform(async () => {
        if (dirty()) throw new Error("Your paste changed. Review rows before continuing.");
        state.tabId = tabId;
        try {
          await advance();
        } catch (error) {
          const entry = next();
          if (entry) entry.issue = error.message;
          throw error;
        }
      });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      connecting = false;
      host.refresh();
    }
  };
  const node = (tag, text, className) => {
    const value = document.createElement(tag);
    if (text !== undefined) value.textContent = text;
    if (className) value.className = className;
    return value;
  };
  const button = (text, action, className = "auction-text-button") => {
    const value = node("button", text, className);
    value.type = "button";
    value.addEventListener("click", action);
    return value;
  };
  const time = (local) => {
    if (!local) return "Choose a date";
    const [date, clock] = local.split("T");
    const hour = Number(clock?.slice(0, 2));
    return `${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))} · ${hour > 12 ? hour - 12 : hour} PM`;
  };
  const amount = (value) =>
    value
      ? Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })
      : "Choose an amount";
  const editRow = (row) => {
    editing = row.id;
    draft = {};
    for (const field of ["title", "startDate", "endDate", "startPrice", "reservePrice", "tamara"])
      draft[field] = row[field] || "";
    render();
  };
  const editor = (row) => {
    const box = node("div", undefined, "auction-row-editor");
    for (const [field, title] of [
      ["title", "Title"],
      ["startDate", "Start date"],
      ["endDate", "End date"],
      ["startPrice", "Initial price · AED"],
      ["reservePrice", "Reserve / No Reserve"],
      ["tamara", "Tamara"]
    ]) {
      const label = node("label", title),
        choices = row.importReview?.find((entry) => entry.field === field)?.candidates || [];
      const input = node(field === "tamara" ? "select" : "input");
      input.setAttribute("aria-label", title);
      if (field === "tamara")
        for (const [value, text] of [
          ["", "Off"],
          ["Yes", "On"],
          ["No", "Off (No)"]
        ]) {
          const option = node("option", text);
          option.value = value;
          input.append(option);
        }
      else {
        input.type = field.endsWith("Date") ? "date" : "text";
        if (choices.length) {
          const list = node("datalist");
          list.id = `${row.id}-${field}-choices`;
          input.setAttribute("list", list.id);
          input.placeholder = "Type or choose a source cell";
          for (const choice of choices) {
            const option = node("option");
            option.value = choice.value;
            option.label = `Cell ${choice.column + 1} · ${choice.text}`;
            list.append(option);
          }
          label.append(list);
        }
      }
      input.value = draft[field];
      input.addEventListener("input", () => {
        draft[field] = input.value;
      });
      input.addEventListener("change", () => {
        draft[field] = input.value;
      });
      label.append(input);
      box.append(label);
    }
    box.append(
      button(
        "Done",
        () =>
          local(async () => {
            const target = state.rows.find((item) => item.id === row.id);
            if (target) Object.assign(target, draft);
            editing = null;
            draft = null;
          }),
        "settings-secondary-button"
      )
    );
    return box;
  };
  const render = () => {
    if (!restored || document.getElementById("auction-workflow")?.value === "placement") return;
    const busy = host.isBusy() || connecting,
      current = next();
    $("preview").hidden = !state.rows.length;
    document.getElementById("auction-paste")?.setAttribute("rows", state.rows.length ? "3" : "7");
    $("rows").replaceChildren();
    const keys = new Set();
    let eligible = 0,
      chosen = 0;
    for (const row of state.rows) {
      const validation = core.validate(row),
        key = core.signature(validation.plan),
        prior = seen(row),
        duplicate = keys.has(key);
      keys.add(key);
      const entry = state.entries.find((entry) => entry.rowId === row.id),
        finished = prior?.status === "complete",
        archived = prior && state.history.includes(prior),
        blockedPrior = archived && risky(prior);
      const disabled = busy || finished || duplicate || blockedPrior;
      if (!finished && !duplicate && !blockedPrior) {
        eligible++;
        if (row.selected) chosen++;
      }
      const li = node("li", undefined, "auction-preview-row"),
        label = node("label", undefined, "auction-row-title"),
        checkbox = node("input"),
        title = node("span", `${row.order}. ${row.title || "Choose a title"}`);
      checkbox.type = "checkbox";
      checkbox.checked = !!row.selected && !finished && !duplicate && !blockedPrior;
      checkbox.disabled = disabled;
      checkbox.setAttribute("aria-label", `Select row ${row.order}`);
      checkbox.addEventListener("change", () =>
        local(async () => {
          const found = state.rows.find((item) => item.id === row.id);
          if (found) found.selected = checkbox.checked;
        })
      );
      label.append(checkbox, title);
      li.append(label);
      const summary = node("dl", undefined, "auction-row-values");
      for (const [name, value] of [
        ["Start", time(validation.plan.startLocal)],
        ["End", time(validation.plan.endLocal)],
        ["Initial · AED", amount(validation.plan.initialPrice)],
        ["Reserve · AED", amount(validation.plan.reservePrice)],
        ["Tamara", validation.plan.includeTamara ? "On" : "Off"]
      ])
        summary.append(node("dt", name), node("dd", value));
      li.append(summary);
      const issue = duplicate
        ? "Duplicate of an earlier row in this paste."
        : blockedPrior
          ? "This schedule has a previous result to check in History."
          : entry?.issue || (!validation.valid ? validation.issues.join(" ") : "");
      if (issue) li.append(node("p", issue, "auction-row-issue"));
      else if (entry || finished)
        li.append(
          node(
            "p",
            `${rowStatus[finished ? "complete" : entry.status]}${entry?.prepared?.source?.codeNumber ? ` · Source ${entry.prepared.source.codeNumber}` : ""}`,
            "auction-row-state"
          )
        );
      if (finished && prior.link) {
        const a = node("a", "Open auction");
        a.href = prior.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        li.append(a);
      }
      if (editing === row.id) li.append(editor(row));
      else {
        const actions = node("div", undefined, "auction-row-actions"),
          edit = button("Edit", () => editRow(row)),
          remove = button("Remove", () =>
            local(async () => {
              const entry = state.entries.find((entry) => entry.rowId === row.id);
              if (entry) archive([entry]);
              state.entries = state.entries.filter((entry) => entry.rowId !== row.id);
              state.rows = state.rows.filter((entry) => entry.id !== row.id);
              editing = null;
            })
          );
        edit.disabled = busy || (!!entry && remember(entry));
        remove.disabled = busy;
        remove.setAttribute("aria-label", `Remove row ${row.order} from this preview`);
        actions.append(edit, remove);
        li.append(actions);
      }
      li.dataset.kind = issue ? "error" : finished ? "success" : "info";
      $("rows").append(li);
    }
    $("count").textContent =
      `${state.rows.length} ${state.rows.length === 1 ? "row" : "rows"}${state.rows.length > 1 ? ` · ${chosen} selected` : ""}`;
    $("all").disabled = busy || !eligible;
    $("none").disabled = busy || !eligible;
    $("review").checked = state.review;
    $("review").disabled = busy || (!!current && risky(current));
    $("mode").textContent = state.review
      ? "You click Republish in the admin window."
      : "Luna republishes selected rows and pauses if a result needs checking.";
    const complete = state.entries.length > 0 && !current;
    $("primary").textContent = complete
      ? "Copy auction links"
      : current && risky(current)
        ? current.receipt
          ? "Get auction link"
          : "Check result & next"
        : state.review
          ? "Open admin review"
          : state.entries.length
            ? "Continue batch"
            : "Start batch";
    const invalid = selectedRows().some((row) => !core.validate(row).valid);
    $("primary").disabled =
      busy ||
      !!editing ||
      dirty() ||
      (!complete && !(current && risky(current)) && (!chosen || invalid));
    $("pause").hidden = !host.isBusy();
    $("pause").disabled = false;
    $("results").hidden = !state.entries.some((entry) => entry.link);
    $("links").replaceChildren();
    for (const entry of state.entries) {
      if (!entry.link) continue;
      const li = node("li", `${entry.order}. ${entry.plan.title} · `),
        a = node("a", "Open auction");
      a.href = entry.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      li.append(a);
      $("links").append(li);
    }
    $("copy").disabled = busy;
    $("history-count").textContent = state.history.length ? `(${state.history.length})` : "";
    $("history-list").replaceChildren();
    for (const entry of state.history.slice().reverse()) {
      const li = node("li", `${entry.plan.title} · ${rowStatus[entry.status] || entry.status}`);
      if (entry.link) {
        const a = node("a", "Open auction");
        a.href = entry.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        li.append(document.createTextNode(" · "), a);
      } else if (risky(entry)) {
        const check = button("Check result", async () => {
          try {
            const tabId = await api.connect();
            await perform(async () => {
              const found = state.history.find((item) => historyKey(item) === historyKey(entry));
              found.tabId = tabId;
              await getResult(found);
              notify("Previous result saved in History.", "success");
            });
          } catch (error) {
            notify(error.message, "error");
          }
        });
        check.disabled = busy;
        li.append(check);
      }
      $("history-list").append(li);
    }
    if (dirty() && state.rows.length && !busy)
      notify("Your paste changed. Review rows to replace this preview.");
  };
  for (const [id, value] of [
    ["all", true],
    ["none", false]
  ])
    $(id).addEventListener("click", () =>
      local(async () => {
        const keys = new Set();
        for (const row of state.rows) {
          const key = signature(row);
          row.selected = value && !seen(row) && !keys.has(key);
          keys.add(key);
        }
      })
    );
  $("review").addEventListener("change", () => {
    const review = $("review").checked;
    return local(async () => {
      state.review = review;
    });
  });
  $("primary").addEventListener("click", primary);
  $("pause").addEventListener("click", () => {
    stop = true;
    notify("Pausing after the current row finishes.");
  });
  $("copy").addEventListener("click", () =>
    copy().catch(() => notify("Copy failed. Copy the visible links instead.", "error"))
  );
  chrome.storage.local
    .get({ [storageKey]: null })
    .then((saved) => {
      state = migrate(saved[storageKey]);
      restored = true;
      // Restoring a panel is read-only. A startup save outside the batch lock
      // could overwrite another window's freshly journaled sending state.
      render();
    })
    .catch(() => {
      restored = true;
      notify("The local batch could not be restored. Reload Luna before continuing.", "error");
    });
  return Object.freeze({ render, setRows, notify });
})();
