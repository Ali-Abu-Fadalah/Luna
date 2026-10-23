globalThis.LunaAuctions = (() => {
  const core = globalThis.LunaAuctionCore;
  const $ = (id) => document.getElementById(`auction-${id}`);
  const storageKey = "luna.auctions.v1";
  let state = { version: 1, rows: [], index: 0, mappings: {}, headers: [], workflow: "placement" };
  let busy = false,
    richTable = null,
    pasteError = "",
    renderedImagesKey = "",
    workbook = null,
    worksheetCells = null;
  const categoryInstructions =
    "Title filled. Choose the correct category on Ayshei and click Next. On step 2, click Continue filling Ayshei here.";
  const current = () => state.rows[state.index];
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const message = (text, kind = "info") => {
    if (republishMode() && globalThis.LunaAuctionRepublish?.notify)
      return globalThis.LunaAuctionRepublish.notify(text, kind);
    $("message").hidden = !text;
    $("message").textContent = text;
    $("message").dataset.kind = kind;
  };
  const save = () => chrome.storage.local.set({ [storageKey]: state });
  const invalidate = (row) => {
    row.audit = null;
    if (row.status !== "posted") row.status = "pending";
  };
  const republishMode = () => $("workflow")?.value === "republish";
  const checks = (row, details = false) =>
    core.validate(row, { details, today: new Date().toLocaleDateString("en-CA") });
  const source = () => $("paste").value;
  const bindingStamp = (row) =>
    JSON.stringify([
      row.title,
      row.photosUrl,
      row.startDate,
      row.endDate,
      row.startPrice,
      row.reservePrice
    ]);
  const keepBinding = (row) => {
    if (row.draftId || row.creatingDraft || row.awaitingCategory) {
      state.bindings ||= {};
      state.bindings[bindingStamp(row)] = row;
    }
  };
  const sourceTable = (table) =>
    table
      .map((row) =>
        row
          .map((cell) => {
            const value = cell?.url
              ? `[${cell.text || cell.url}](${cell.url})`
              : String(typeof cell === "object" ? (cell?.text ?? "") : (cell ?? ""));
            return /[\t\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
          })
          .join("\t")
      )
      .join("\n");
  const rememberSource = (cells = richTable) => {
    state.pastes ||= {};
    state.pastes[republishMode() ? "republish" : "placement"] = { text: source(), cells };
    save().catch(() => message("The pasted rows could not be saved locally.", "error"));
  };
  const run = async (task) => {
    if (busy) return;
    busy = true;
    render();
    try {
      await task();
      await save();
    } catch (error) {
      message(error.message || "The action could not finish. Your row is saved locally.", "error");
    } finally {
      busy = false;
      render();
    }
  };
  const button = (label, handler, className = "settings-secondary-button") => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.className = className;
    node.addEventListener("click", handler);
    return node;
  };
  const call = async (tabId, request) => {
    const tab = await chrome.tabs.get(tabId);
    if (new URL(tab.url).origin !== "https://marketplace.example.invalid")
      throw new Error("The auction tab is no longer on Ayshei.");
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/features/auctions/auction-page.js"]
    });
    const response = await chrome.tabs.sendMessage(tabId, { type: "luna.auction.v3", ...request });
    if (!response?.ok) throw new Error(response?.detail || "Ayshei did not finish the action.");
    return response.data;
  };
  const waitTab = async (tabId, test) => {
    for (let i = 0; i < 120; i++) {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status !== "loading" && test(new URL(tab.url))) return tab;
      await pause(150);
    }
    throw new Error(
      "Ayshei did not reach the next step. Prepare & fill will resume from the open page."
    );
  };
  const bound = async (row) => {
    const tab = await chrome.tabs.get(row.tabId).catch(() => null);
    const url = tab && new URL(tab.url);
    if (
      !url ||
      url.origin !== "https://marketplace.example.invalid" ||
      url.pathname !== `/place-ad/${row.draftId}` ||
      url.searchParams.get("step") !== "2"
    )
      throw new Error("The bound draft is not open at step 2. Use Prepare & fill to reopen it.");
    return tab;
  };
  const bindDraft = async (row) => {
    const tab = await waitTab(
      row.tabId,
      (url) =>
        /^\/place-ad\/(?!new$|list-draft$)[^/]+$/.test(url.pathname) &&
        url.searchParams.get("step") === "2"
    );
    const draftId = new URL(tab.url).pathname.split("/").at(-1);
    if (state.rows.some((other) => other.id !== row.id && other.draftId === draftId))
      throw new Error("This draft is already assigned to another row.");
    if (row.draftId && row.draftId !== draftId)
      throw new Error("This row is already bound to a different draft. Filling stopped.");
    await call(row.tabId, { operation: "ready", draftId, title: row.title });
    const inspected = await call(row.tabId, { operation: "inspect" });
    if (!inspected.auction || inspected.title !== row.title)
      throw new Error("The draft’s auction type or title differs from this row. Filling stopped.");
    if (typeof globalThis.LunaAuctionAPI?.identity !== "function")
      throw new Error(
        "Reload Luna to read the category selected on Ayshei, then continue filling."
      );
    const identity = await globalThis.LunaAuctionAPI.identity(row.tabId, {
      draftId,
      title: row.title
    });
    if (
      !Array.isArray(identity.categoryPath) ||
      identity.categoryPath.length !== 3 ||
      identity.categoryPath.some((label) => !core.clean(label))
    )
      throw new Error("The category selected on Ayshei could not be verified. Filling stopped.");
    if (
      row.draftId &&
      row.categoryPath?.length === 3 &&
      !row.awaitingCategory &&
      JSON.stringify(row.categoryPath.map(core.key)) !==
        JSON.stringify(identity.categoryPath.map(core.key))
    )
      throw new Error(
        "The saved category changed for this bound draft. Review it before continuing."
      );
    row.draftId = draftId;
    row.categoryPath = [...identity.categoryPath];
    row.boundTitle = row.title;
    row.awaitingCategory = false;
    row.creatingDraft = false;
    row.status = "draft";
    await save();
  };
  const ensureDraft = async (row) => {
    let tab = row.tabId ? await chrome.tabs.get(row.tabId).catch(() => null) : null;
    if (row.status === "posted")
      throw new Error("This row was already marked posted. Choose another row.");
    if (!tab && (row.creatingDraft || row.awaitingCategory) && !row.draftId)
      throw new Error(
        "The draft-creation tab closed before its ID was saved. Recover the existing draft on Ayshei before retrying; Luna will not create a duplicate."
      );
    if (row.draftId) {
      const url = `https://marketplace.example.invalid/place-ad/${row.draftId}?step=2`;
      if (!tab) tab = await chrome.tabs.create({ url, active: true });
      else if (tab.url !== url) tab = await chrome.tabs.update(tab.id, { url, active: true });
      row.tabId = tab.id;
      await waitTab(
        tab.id,
        (entry) =>
          entry.pathname === `/place-ad/${row.draftId}` && entry.searchParams.get("step") === "2"
      );
      await bindDraft(row);
      return true;
    }
    // A missing unfinished tab is restarted only before a draft ID exists. A
    // navigation that already produced a draft is recovered from the tab URL.
    if (!tab)
      tab = await chrome.tabs.create({
        url: "https://marketplace.example.invalid/uae/auctions",
        active: true
      });
    row.tabId = tab.id;
    await save();
    tab = await waitTab(tab.id, (url) => url.origin === "https://marketplace.example.invalid");
    let url = new URL(tab.url);
    if (
      /^\/place-ad\/(?!new$|list-draft$)[^/]+$/.test(url.pathname) &&
      url.searchParams.get("step") === "2"
    ) {
      await bindDraft(row);
      return true;
    }
    if ((row.creatingDraft || row.awaitingCategory) && url.pathname !== "/place-ad/new")
      throw new Error(
        "Open this row’s existing auction at step 2 in its original tab. Luna will not start another draft while your category step is unfinished."
      );
    if (url.pathname === "/uae/auctions") {
      message("Opening a new auction…");
      await call(tab.id, { operation: "start" });
      tab = await waitTab(
        tab.id,
        (entry) => entry.pathname === "/place-ad/list-draft" || entry.pathname === "/place-ad/new"
      );
      url = new URL(tab.url);
    }
    if (url.pathname === "/place-ad/list-draft") await call(tab.id, { operation: "new" });
    await waitTab(tab.id, (entry) => entry.pathname === "/place-ad/new");
    if (!row.awaitingCategory) {
      await call(tab.id, { operation: "title", title: row.title });
      row.awaitingCategory = true;
      row.categoryPath = [];
      row.status = "category";
      await save();
    } else {
      const inspected = await call(tab.id, { operation: "inspect" });
      if (!inspected.auction || inspected.title !== row.title)
        throw new Error(
          "The step-1 auction title differs from this row. Check the original page before continuing."
        );
    }
    await chrome.tabs.update(tab.id, { active: true });
    message(categoryInstructions);
    return false;
  };
  const capturePhotos = async (row) => {
    const expected = new URL(core.safeUrl(row.photosUrl) || "https://invalid.test");
    if (!/^[a-z0-9-]+\.sharepoint\.com$/i.test(expected.hostname))
      throw new Error("Add the actual Descale Photoes folder link in Links & options.");
    const origins = [`${expected.origin}/*`];
    if (
      !(await chrome.permissions.contains({ origins })) &&
      !(await chrome.permissions.request({ origins }))
    )
      throw new Error("Allow access to this photo folder in Chrome to collect its images.");
    let tab = row.photoTabId ? await chrome.tabs.get(row.photoTabId).catch(() => null) : null;
    if (!tab) {
      tab = await chrome.tabs.create({ url: expected.href, active: false });
      row.photoTabId = tab.id;
      await save();
    }
    message("Getting original photos from this row’s folder…");
    let last = "Open the item’s image folder, then click Get photos again.";
    for (let attempt = 0; attempt < 16; attempt++) {
      tab = await chrome.tabs.get(tab.id);
      const url = new URL(tab.url);
      if (tab.status !== "loading" && url.origin === expected.origin) {
        const folder = expected.searchParams.get("id"),
          actual = url.searchParams.get("id");
        if (folder && actual && actual !== folder && !actual.startsWith(`${folder}/`))
          throw new Error("The open photo folder differs from this row’s link.");
        try {
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["src/features/images/image-scraper-source.js"]
          });
          const capture = globalThis.LunaImageScraperCore.sanitizeCapture(result?.[0]?.result);
          if (capture.images.length >= 3) {
            row.capture = capture;
            row.imagesImported = false;
            invalidate(row);
            await save();
            return;
          }
          last =
            "The folder has fewer than three image files. Open the item’s image folder, then click Get photos.";
        } catch (error) {
          last = error.message;
        }
      }
      await pause(650);
    }
    await chrome.tabs.update(tab.id, { active: true });
    throw new Error(last);
  };
  const openDescription = async (row) => {
    const url = core.safeUrl(row.descriptionUrl);
    if (!url)
      throw new Error("The Description cell has no link. Paste the product text into Source.");
    let tab = row.descriptionTabId
      ? await chrome.tabs.get(row.descriptionTabId).catch(() => null)
      : null;
    if (!tab || tab.url !== url) tab = await chrome.tabs.create({ url, active: true });
    else await chrome.tabs.update(tab.id, { active: true });
    row.descriptionTabId = tab.id;
  };
  const rephrase = async (row) => {
    const source = row.descriptionSource?.trim();
    if (!source) throw new Error("Add the product description to Source first.");
    if (source.length > 2400)
      throw new Error(
        "AI accepts up to 2,400 characters. Shorten Source explicitly, or use the preserved source bullets already shown."
      );
    message("Rephrasing the product description…");
    const result = await globalThis.LunaGroq.analyze(
      {
        task: "description",
        facts: { sourceText: source, title: row.title, format: "product-bullets" }
      },
      { sourceScope: row.id }
    );
    const output = core.bulletize(result.description),
      issues = core.descriptionIssues(source, output);
    if (issues.length) throw new Error(issues.join("\n"));
    row.description = output;
    invalidate(row);
    message("Product bullet points updated.", "success");
  };
  const fillDraft = async (row) => {
    const validation = checks(row, true);
    if (!validation.valid) throw new Error(validation.issues.join("\n"));
    invalidate(row);
    await save();
    await bound(row);
    const inspected = await call(row.tabId, { operation: "inspect" });
    if (!inspected.auction || inspected.title !== row.title)
      throw new Error("The draft title does not match the selected row. Filling stopped.");
    const request = {
      draftId: row.draftId,
      title: row.title,
      plan: validation.plan,
      categoryPath: row.categoryPath
    };
    let backend = null;
    if (
      row.imagesImported &&
      row.fieldTransport !== "form" &&
      typeof globalThis.LunaAuctionAPI?.preflight === "function"
    ) {
      if (validation.plan.tamara)
        await call(row.tabId, { operation: "delivery", draftId: row.draftId, title: row.title });
      message("Checking the saved auction and live field configuration…");
      try {
        backend = await globalThis.LunaAuctionAPI.preflight(row.tabId, request);
      } catch (error) {
        if (!["unsupported", "read_unavailable"].includes(error.code)) throw error;
        message(
          "The draft API read is unavailable. Filling and checking the open Ayshei form instead."
        );
      }
    }
    if (!row.capture?.images?.length) await capturePhotos(row);
    let fieldTask = null;
    if (!row.imagesImported) {
      message("Uploading the main image first, then the remaining images together…");
      await globalThis.LunaImageScraper.loadReviewedCapture(row.capture);
      const upload = await globalThis.LunaImageScraper.uploadToAysheiTab(
        row.tabId,
        undefined,
        () => {
          if (fieldTask) return;
          // The saved cover gates field filling. Keep the remaining upload and
          // form work in the same page; an API save/reload would interrupt them.
          backend = null;
          row.fieldTransport = "form";
          message("Main image saved. Filling the details while the remaining images upload…");
          fieldTask = call(row.tabId, {
            operation: "fill",
            draftId: row.draftId,
            plan: validation.plan,
            categoryPath: row.categoryPath
          }).then(
            (result) => ({ result }),
            (error) => ({ error })
          );
        }
      ).then(
        (result) => ({ result }),
        (error) => ({ error })
      );
      // Settle both jobs, including failures, before allowing another action.
      // A failed gallery must never leave a successful field-only ready audit.
      const fields = fieldTask ? await fieldTask : null;
      if (upload.error) throw upload.error;
      const result = upload.result;
      if (!result.retained || result.imported !== row.capture.images.length || !result.mainImage)
        throw new Error(
          "The complete photo upload was not retained. Check the draft before retrying."
        );
      row.imagesImported = true;
      row.mainImage = result.mainImage;
      row.importedCount = result.imported;
      await save();
      if (fields?.error) throw fields.error;
    } else
      await globalThis.LunaImageScraper.verifyOnAysheiTab(
        row.tabId,
        row.importedCount,
        row.mainImage
      );
    let result;
    if (backend) {
      message("Saving the auction details through Ayshei’s draft API…");
      const saved = await globalThis.LunaAuctionAPI.save(row.tabId, {
        ...request,
        domStamp: backend.domStamp
      });
      await chrome.tabs.reload(row.tabId);
      await waitTab(
        row.tabId,
        (url) => url.pathname === `/place-ad/${row.draftId}` && url.searchParams.get("step") === "2"
      );
      await call(row.tabId, { operation: "ready", draftId: row.draftId, title: row.title });
      const receipts = await globalThis.LunaAuctionAPI.receipts(row.tabId, request);
      if (JSON.stringify(receipts.imageNames) !== JSON.stringify(saved.imageNames))
        throw new Error(
          "The reloaded gallery differs from the saved gallery. Check the draft before retrying."
        );
      row.mainImage = receipts.mainImage;
      await globalThis.LunaImageScraper.verifyOnAysheiTab(
        row.tabId,
        row.importedCount,
        row.mainImage
      );
      const visible = await call(row.tabId, {
        operation: "audit",
        draftId: row.draftId,
        plan: validation.plan,
        categoryPath: row.categoryPath
      });
      result = {
        ...visible,
        ok: saved.ok && visible.ok,
        entries: [...saved.entries, ...visible.entries],
        transport: "draft-api"
      };
    } else if (fieldTask) {
      message("Checking the completed photos and auction fields…");
      await globalThis.LunaImageScraper.verifyOnAysheiTab(
        row.tabId,
        row.importedCount,
        row.mainImage
      );
      result = await call(row.tabId, {
        operation: "audit",
        draftId: row.draftId,
        plan: validation.plan,
        categoryPath: row.categoryPath
      });
    } else {
      row.fieldTransport = "form";
      message("Filling the auction fields and checking their values…");
      result = await call(row.tabId, {
        operation: "fill",
        draftId: row.draftId,
        plan: validation.plan,
        categoryPath: row.categoryPath
      });
    }
    row.audit = { ...result, checkedAt: Date.now(), fingerprint: core.fingerprint(row) };
    row.status = result.ok ? "filled" : "blocked";
    await chrome.tabs.update(row.tabId, { active: true });
    message(
      result.ok
        ? "Filled and checked. Review the Ayshei form and post it yourself when ready."
        : "Some fields differ from the row. Open Field checks for the mismatches.",
      result.ok ? "success" : "error"
    );
  };
  const prepare = async () => {
    const row = current();
    if (!row) return;
    if (row.status === "posted")
      throw new Error("This row was already marked posted. Choose another row.");
    const validation = checks(row);
    if (!validation.valid) throw new Error(validation.issues.join("\n"));
    if (!(await ensureDraft(row))) return;
    if (!row.descriptionSource?.trim()) {
      if (row.descriptionUrl) await openDescription(row);
      throw new Error("Paste the product description into Source, then use Prepare & fill.");
    }
    if (!row.description) row.description = core.bulletize(row.descriptionSource);
    const issues = core.descriptionIssues(row.descriptionSource, row.description);
    if (issues.length) throw new Error(issues.join("\n"));
    await fillDraft(row);
  };
  const renderImages = (row) => {
    const stamp = JSON.stringify([row.id, row.capture?.images]);
    if (stamp === renderedImagesKey) return;
    renderedImagesKey = stamp;
    $("images").replaceChildren();
    for (const [index, entry] of (row.capture?.images || []).entries()) {
      const li = document.createElement("li"),
        img = document.createElement("img");
      img.src = entry.url;
      img.alt = entry.alt || `Photo ${index + 1}`;
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", async () => {
        if (img.dataset.retried) return;
        img.dataset.retried = "true";
        try {
          const result = await chrome.runtime.sendMessage({
            type: globalThis.LunaFoundation?.messageTypes.imageFetch || "luna.manualAd.fetchImage",
            url: entry.url
          });
          if (
            result?.ok &&
            result.data?.base64 &&
            /^image\/(jpeg|png|webp|avif)$/.test(result.data.contentType)
          )
            img.src = `data:${result.data.contentType};base64,${result.data.base64}`;
        } catch {
          /* The source tab remains available. */
        }
      });
      const main = button(index === 0 ? "Main" : "Make main", () => {
        if (busy || row.imagesImported) return;
        row.capture.images = globalThis.LunaImageScraperCore.moveImage(
          row.capture.images,
          entry.id,
          0
        );
        invalidate(row);
        save()
          .then(render)
          .catch((error) => message(error.message, "error"));
      });
      main.disabled = busy || row.imagesImported;
      const remove = button(
        "×",
        () => {
          if (busy || row.imagesImported) return;
          row.capture.images = row.capture.images.filter((photo) => photo.id !== entry.id);
          invalidate(row);
          save()
            .then(render)
            .catch((error) => message(error.message, "error"));
        },
        "auction-image-remove"
      );
      remove.setAttribute("aria-label", `Remove ${img.alt}`);
      remove.disabled = busy || row.imagesImported;
      li.append(img, main, remove);
      $("images").append(li);
    }
  };
  const fields = [
    "title",
    "brand",
    "category",
    "condition",
    "startPrice",
    "reservePrice",
    "startDate",
    "endDate",
    "tamara",
    "photosUrl",
    "descriptionUrl",
    "descriptionSource",
    "description"
  ];
  const render = () => {
    const row = current();
    const admin = republishMode();
    $("republish-panel").hidden = !admin;
    $("placement-panel").hidden = admin;
    $("message").hidden = admin || !$("message").textContent;
    $("work").hidden = admin || !row;
    $("empty").hidden = admin || !!row;
    $("tab-republish").setAttribute("aria-selected", String(admin));
    $("tab-placement").setAttribute("aria-selected", String(!admin));
    document
      .querySelectorAll(
        ".auctions-view button,.auctions-view input,.auctions-view textarea,.auctions-view select"
      )
      .forEach((node) => {
        node.disabled = busy;
      });
    $("import").hidden = false;
    $("import").disabled = busy || (!source().trim() && !richTable);
    $("clear").disabled = busy;
    $("workbook-add").disabled = busy || !worksheetCells;
    $("workbook-sheet").disabled = busy || !workbook;
    if (admin) {
      globalThis.LunaAuctionRepublish?.render();
      return;
    }
    $("queue").replaceChildren();
    state.rows.forEach((entry, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${index + 1} of ${state.rows.length} · ${entry.title || "Untitled"}${entry.status === "filled" ? " · Filled" : ""}`;
      $("queue").append(option);
    });
    $("workbook-add").disabled = busy || !worksheetCells;
    $("workbook-sheet").disabled = busy || !workbook;
    $("paste").placeholder = "Paste sheet rows here — headers optional";
    $("remove-row").disabled = busy || !row;
    if (!row) {
      globalThis.LunaAuctionRepublish?.render();
      return;
    }
    $("queue").value = String(state.index);
    for (const name of fields)
      if (document.activeElement !== $(name)) $(name).value = row[name] || "";
    $("description").disabled = busy || !row.descriptionSource?.trim();
    $("rephrase").disabled = busy || !row.descriptionSource?.trim();
    $("open-description").hidden = !core.safeUrl(row.descriptionUrl);
    $("get-photos").disabled = busy || row.imagesImported;
    const validation = checks(row);
    const labels = {
      title: "Title",
      brand: "Brand",
      category: "Category",
      startPrice: "Starting price",
      reservePrice: "Reserve price",
      startDate: "Start date",
      endDate: "End date",
      photosUrl: "Photo folder",
      descriptionUrl: "Description source",
      condition: "Condition",
      tamara: "Tamara"
    };
    $("import-review").replaceChildren();
    const unresolved = (row.importReview || []).filter(
      (entry) => !core.clean(row[entry.field]) && entry.candidates?.length
    );
    $("import-review").hidden = !unresolved.length;
    for (const entry of unresolved) {
      const label = document.createElement("label"),
        select = document.createElement("select"),
        empty = document.createElement("option");
      label.textContent = `${labels[entry.field] || entry.field} · choose a cell or type below`;
      empty.value = "";
      empty.textContent = "Choose the source cell";
      select.append(empty);
      select.disabled = busy;
      for (const [index, candidate] of entry.candidates.entries()) {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `Column ${candidate.column + 1} · ${candidate.text || candidate.url}`;
        select.append(option);
      }
      select.addEventListener("change", () => {
        if (busy || select.value === "") return;
        const chosen = entry.candidates[Number(select.value)];
        if (!chosen) return;
        if (entry.field === "descriptionUrl") {
          row.descriptionUrl = core.safeUrl(chosen.url || chosen.value);
          row.descriptionSource = row.descriptionUrl ? "" : chosen.text;
          row.description = row.descriptionSource ? core.bulletize(row.descriptionSource) : "";
          row.descriptionConflict = false;
        } else row[entry.field] = chosen.value;
        row.importReview = row.importReview.filter((item) => item !== entry);
        invalidate(row);
        save()
          .then(render)
          .catch((error) => message(error.message, "error"));
      });
      label.append(select);
      $("import-review").append(label);
    }
    const missingFields = {
      title: core.missing(row.title),
      brand: core.missing(row.brand),
      category: core.missing(row.category),
      startPrice: !validation.plan.initialPrice,
      reservePrice: !validation.plan.reservePrice,
      startDate: !validation.plan.startDate,
      endDate: !validation.plan.endDate,
      condition: !validation.plan.condition,
      tamara: validation.issues.some((issue) => issue.startsWith("Tamara")),
      photosUrl: validation.issues.some((issue) =>
        /SharePoint|photo.folder|photo source/i.test(issue)
      )
    };
    for (const [field, invalid] of Object.entries(missingFields)) {
      $(field).setAttribute("aria-invalid", String(invalid));
    }
    if (missingFields.condition || missingFields.tamara) $("condition-options").open = true;
    $("alerts").replaceChildren();
    for (const issue of [
      ...new Set([
        ...validation.issues,
        ...(row.issues || []).filter((item) => item.includes("duplicate"))
      ])
    ]) {
      const li = document.createElement("li");
      li.textContent = issue;
      $("alerts").append(li);
    }
    $("schedule").textContent = validation.plan.startDate
      ? `${validation.plan.startTime} PM start · ${validation.plan.startDate} → ${validation.plan.endDate || "Choose end date"}`
      : "9:00 PM start · Saturday 10:00 PM";
    $("price-rule").textContent = validation.plan.noReserve
      ? `No Reserve → both prices ${validation.plan.initialPrice || "—"} AED`
      : "";
    $("images-status").textContent = row.imagesImported
      ? `${row.importedCount} photos retained · main first`
      : row.capture
        ? `${row.capture.images.length} photos · main first`
        : "Main image first. Other photos and fields fill together.";
    renderImages(row);
    $("images")
      .querySelectorAll("button")
      .forEach((node) => {
        node.disabled = busy || row.imagesImported;
      });
    $("audit-details").hidden = !row.audit;
    $("audit").replaceChildren();
    for (const entry of row.audit?.entries || []) {
      const li = document.createElement("li");
      li.dataset.ok = String(entry.ok);
      li.textContent = `${entry.ok ? "✓" : "!"} ${entry.field}: ${entry.ok ? entry.expected : `expected ${entry.expected}; read ${entry.actual || "empty"}`}`;
      $("audit").append(li);
    }
    $("draft-link").hidden = !row.draftId;
    $("draft-link").href = row.draftId
      ? `https://marketplace.example.invalid/place-ad/${row.draftId}?step=2`
      : "#";
    $("prev").disabled = busy || state.index === 0;
    $("next").disabled = $("next-row").disabled = busy || state.index >= state.rows.length - 1;
    $("prepare").textContent = busy
      ? "Working…"
      : row.awaitingCategory || (row.draftId && !row.audit)
        ? "Continue filling Ayshei"
        : row.audit?.ok
          ? "Update & check Ayshei"
          : "Prepare & fill Ayshei";
    if (row.awaitingCategory && $("message").hidden) message(categoryInstructions);
  };
  const htmlTable = (html) => {
    if (!html) return null;
    const table = new DOMParser().parseFromString(html, "text/html").querySelector("table");
    if (!table) return null;
    return [...table.querySelectorAll("tr")]
      .filter((tr) => {
        const cells = [...tr.querySelectorAll("th,td")];
        return !(
          cells.length === 1 &&
          Number(cells[0].getAttribute("colspan") || 1) > 1 &&
          Number(cells[0].getAttribute("rowspan") || 1) === 1
        );
      })
      .map((tr) =>
        [...tr.querySelectorAll("th,td")].map((cell) => {
          if (
            Number(cell.getAttribute("colspan") || 1) !== 1 ||
            Number(cell.getAttribute("rowspan") || 1) !== 1
          )
            throw new Error("Copy unmerged data rows; merged cells cannot be aligned safely.");
          const links = [...cell.querySelectorAll("a[href]")]
            .map((link) => core.safeUrl(link.getAttribute("href")))
            .filter(Boolean);
          const direct = core.safeUrl(cell.getAttribute("data-sheets-hyperlink"));
          if (direct) links.push(direct);
          for (const node of cell.querySelectorAll("[data-sheets-hyperlink]")) {
            const url = core.safeUrl(node.getAttribute("data-sheets-hyperlink"));
            if (url) links.push(url);
          }
          if (new Set(links).size > 1)
            throw new Error("A pasted cell has several different links. Copy one link per cell.");
          return { text: cell.innerText || cell.textContent, url: links[0] || "" };
        })
      );
  };
  const importRows = async (input, sourceLabel = "") => {
    if (pasteError) throw new Error(pasteError);
    const rows = core.parseSheet(input, $("date-format").value || "strict", {
      layout: $("layout").value || "auto",
      savedHeaders: $("layout").value === "saved" ? state.headers || [] : [],
      allowHeaderlessPhotoSource: true
    });
    if (rows.hasHeaders || $("layout").value === "saved") {
      state.headers = rows.layoutHeaders;
      state.headersVerified = true;
    }
    if (!rows.length)
      throw new Error(
        "No listing rows were found. Your paste is still above; review the copied cells."
      );
    if (republishMode()) {
      await globalThis.LunaAuctionRepublish.setRows(rows, source());
      message("");
      return;
    }
    state.bindings ||= {};
    for (const row of state.rows) keepBinding(row);
    state.rows = rows.map((row) => {
      const previous = state.bindings[bindingStamp(row)];
      return previous
        ? {
            ...previous,
            ...row,
            id: previous.id,
            tabId: previous.tabId,
            draftId: previous.draftId,
            categoryPath: previous.categoryPath,
            awaitingCategory: previous.awaitingCategory,
            creatingDraft: previous.creatingDraft,
            capture: previous.capture,
            imagesImported: previous.imagesImported,
            importedCount: previous.importedCount,
            mainImage: previous.mainImage,
            descriptionSource: previous.descriptionSource || row.descriptionSource,
            description: previous.description || row.description
          }
        : { ...row, id: `auction-${crypto.randomUUID()}` };
    });
    state.index = 0;
    message(
      `${rows.length} ${rows.length === 1 ? "row" : "rows"} in this preview. Previous rows were replaced.${sourceLabel ? ` ${sourceLabel}.` : ""}`,
      "success"
    );
  };
  $("paste").addEventListener("paste", (event) => {
    event.preventDefault();
    if (busy) return;
    $("paste").value = event.clipboardData.getData("text/plain");
    pasteError = "";
    try {
      richTable = htmlTable(event.clipboardData.getData("text/html"));
    } catch (error) {
      richTable = null;
      if (!source().trim()) pasteError = error.message;
    }
    if (!source().trim() && richTable) $("paste").value = sourceTable(richTable);
    rememberSource();
    render();
  });
  $("paste").addEventListener("input", () => {
    richTable = null;
    pasteError = "";
    rememberSource();
    render();
  });
  $("import").addEventListener("click", () => run(() => importRows(richTable || source())));
  $("clear").addEventListener("click", () =>
    run(async () => {
      if (republishMode()) await globalThis.LunaAuctionRepublish.setRows([], "");
      else {
        for (const row of state.rows) keepBinding(row);
        state.rows = [];
        state.index = 0;
      }
      $("paste").value = "";
      richTable = null;
      pasteError = "";
      rememberSource();
      message("");
    })
  );
  $("remove-row").addEventListener("click", () =>
    run(async () => {
      const row = current();
      if (!row) return;
      keepBinding(row);
      state.rows.splice(state.index, 1);
      state.index = Math.max(0, Math.min(state.index, state.rows.length - 1));
    })
  );
  $("open-workbook").addEventListener("click", () => $("workbook-file").click());
  $("workbook-file").addEventListener("change", () =>
    run(async () => {
      const file = $("workbook-file").files?.[0];
      if (!file) return;
      $("workbook-file").value = "";
      workbook?.close();
      workbook = null;
      worksheetCells = null;
      $("workbook-panel").hidden = true;
      message("Opening the spreadsheet locally…");
      workbook = await globalThis.LunaAuctionWorkbook.open(file);
      $("workbook-sheet").replaceChildren();
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Choose a worksheet";
      $("workbook-sheet").append(empty);
      for (const sheet of workbook.sheets) {
        const option = document.createElement("option");
        option.value = sheet.id;
        option.textContent = sheet.name;
        $("workbook-sheet").append(option);
      }
      $("workbook-sheet").value = "";
      $("workbook-range").value = "";
      $("workbook-name").textContent = file.name;
      $("workbook-panel").hidden = false;
      message(
        "Choose a worksheet, then add all its rows or enter the worksheet row numbers. The file stays local."
      );
    })
  );
  $("workbook-sheet").addEventListener("change", () =>
    run(async () => {
      worksheetCells = null;
      if (!workbook || !$("workbook-sheet").value) return;
      message("Reading the selected worksheet…");
      worksheetCells = await workbook.readSheet($("workbook-sheet").value);
      $("workbook-info").textContent =
        `${worksheetCells.length} worksheet rows · Enter row numbers to add only part of this tab. No upload.`;
      message("Worksheet ready. Add all rows or enter the worksheet row numbers you need.");
    })
  );
  $("workbook-add").addEventListener("click", () =>
    run(async () => {
      if (!worksheetCells) throw new Error("Choose a worksheet first.");
      let selected = worksheetCells;
      const header = worksheetCells.find((row) => {
        const keys = row.map((cell) => core.key(cell?.text ?? cell));
        return (
          keys.some((key) =>
            ["modeltitle", "modelandtitle", "listingname", "title"].includes(key)
          ) && keys.some((key) => ["startprice", "initialprice"].includes(key))
        );
      });
      if (!header)
        throw new Error(
          "This worksheet has no auction table headers. Choose the auction tab or paste its data rows above."
        );
      const range = $("workbook-range").value.trim();
      if (range) {
        const indexes = new Set();
        for (const part of range.replaceAll("–", "-").split(",")) {
          const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
          if (!match) throw new Error("Use worksheet rows like 12-20, 24.");
          const start = Number(match[1]),
            end = Number(match[2] || match[1]);
          if (start < 1 || end < start || end > worksheetCells.length)
            throw new Error("The row range is outside this worksheet.");
          for (let index = start - 1; index < end; index++) indexes.add(index);
        }
        selected = [
          header,
          ...[...indexes].sort((a, b) => a - b).map((index) => worksheetCells[index])
        ];
      }
      pasteError = "";
      richTable = selected;
      $("paste").value = sourceTable(selected);
      rememberSource();
      await importRows(selected, "From workbook headers");
    })
  );
  for (const name of fields)
    $(name).addEventListener("input", () => {
      const row = current();
      if (busy || !row) return;
      if (["photosUrl", "title", "category"].includes(name) && row.draftId) {
        $(name).value = row[name] || "";
        message(
          "This row is bound to an existing draft. Import a new row for a different title, category or photo folder.",
          "error"
        );
        return;
      }
      row[name] = $(name).value;
      invalidate(row);
      if (name === "descriptionSource")
        row.description = row.descriptionSource.trim() ? core.bulletize(row.descriptionSource) : "";
      if (name === "photosUrl") {
        row.capture = null;
        row.imagesImported = false;
        row.photoTabId = null;
      }
      save().catch(() =>
        message("The row could not be saved locally. Check Chrome storage.", "error")
      );
      render();
    });
  const selectRow = (index) => {
    if (busy) return;
    state.index = Math.max(0, Math.min(state.rows.length - 1, index));
    message("");
    save()
      .then(render)
      .catch((error) => message(error.message, "error"));
  };
  $("queue").addEventListener("change", () => selectRow(Number($("queue").value)));
  $("prev").addEventListener("click", () => selectRow(state.index - 1));
  for (const id of ["next", "next-row"])
    $(id).addEventListener("click", () => selectRow(state.index + 1));
  $("get-photos").addEventListener("click", () =>
    run(async () => {
      await capturePhotos(current());
      message("Photos ready. The first photo will be the main image.", "success");
    })
  );
  $("open-description").addEventListener("click", () => run(() => openDescription(current())));
  $("rephrase").addEventListener("click", () => run(() => rephrase(current())));
  $("prepare").addEventListener("click", () => run(prepare));
  $("workflow").addEventListener("change", () => {
    state.workflow = $("workflow").value;
    const saved = state.pastes?.[state.workflow];
    $("paste").value = saved?.text || "";
    richTable = saved?.cells || null;
    pasteError = "";
    $("workbook-panel").hidden = true;
    save().catch(() => message("The workflow could not be saved locally.", "error"));
    render();
  });
  for (const mode of ["republish", "placement"])
    $("tab-" + mode).addEventListener("click", () => {
      if (busy) return;
      $("workflow").value = mode;
      $("workflow").dispatchEvent(new Event("change"));
    });
  $("draft-link").addEventListener("click", (event) => {
    event.preventDefault();
    run(() => ensureDraft(current()));
  });
  chrome.storage.local
    .get({ [storageKey]: null })
    .then((saved) => {
      if (saved[storageKey]?.version === 1 && Array.isArray(saved[storageKey].rows))
        state = { ...state, ...saved[storageKey] };
      for (const row of state.rows) {
        // Older queues did not record whether a link came from Description or
        // link photos. Do not silently reuse a link with unknown provenance.
        if (!row.descriptionColumnOnly) {
          row.descriptionUrl = "";
          row.descriptionColumnOnly = true;
        }
      }
      state.index = Math.max(0, Math.min(state.index, Math.max(0, state.rows.length - 1)));
      $("workflow").value = state.workflow === "republish" ? "republish" : "placement";
      const pasted = state.pastes?.[$("workflow").value];
      $("paste").value = pasted?.text || "";
      richTable = pasted?.cells || null;
      render();
    })
    .catch(() => message("The local auction queue could not be restored.", "error"));
  return Object.freeze({
    rows: () => state.rows,
    sourceText: source,
    selectRow,
    run,
    isBusy: () => busy,
    refresh: render,
    notify: message,
    onSectionShown(section) {
      if (section === "auctions") render();
    }
  });
})();
