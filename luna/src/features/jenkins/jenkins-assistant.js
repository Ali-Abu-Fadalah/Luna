globalThis.LunaJenkinsAssistant = (() => {
  const view = document.querySelector(".jenkins-assistant-view");
  const typeSelect = document.querySelector("#jenkins-type");
  const pasteInput = document.querySelector("#jenkins-paste");
  const prepareButton = document.querySelector("#jenkins-prepare");
  const clearButton = document.querySelector("#jenkins-clear");
  const fillButton = document.querySelector("#jenkins-fill");
  const status = document.querySelector("#jenkins-status");
  const message = document.querySelector("#jenkins-message");
  const preview = document.querySelector("#jenkins-preview");
  const previewFields = document.querySelector("#jenkins-preview-fields");
  const fieldSelect = document.querySelector("#jenkins-field-select");
  const fieldCopy = document.querySelector("#jenkins-field-copy");
  const rowCount = document.querySelector("#jenkins-row-count");
  const fieldCount = document.querySelector("#jenkins-field-count");
  let batch = null;
  let busy = false;
  let columnPreviews = [];

  const resetFieldReview = () => {
    columnPreviews = [];
    if (fieldSelect) {
      fieldSelect.replaceChildren();
      fieldSelect.disabled = true;
    }
    if (fieldCopy) fieldCopy.disabled = true;
  };

  const showSelectedField = () => {
    columnPreviews.forEach(({ key, card }) => {
      card.hidden = Boolean(fieldSelect) && key !== fieldSelect.value;
    });
    if (fieldCopy) {
      fieldCopy.disabled =
        busy || !batch?.columns.some((column) => column.key === fieldSelect?.value);
    }
  };

  const setStatus = (state, text) => {
    status.dataset.jenkinsState = state;
    status.textContent = text;
  };

  const setMessage = (text, kind = "info") => {
    message.dataset.kind = kind;
    message.textContent = text;
  };

  const setBusy = (value) => {
    busy = Boolean(value);
    typeSelect.disabled = busy;
    pasteInput.disabled = busy;
    prepareButton.disabled = busy;
    clearButton.disabled = busy || (!pasteInput.value && !batch);
    fillButton.disabled = busy || !batch;
    if (fieldSelect) fieldSelect.disabled = busy || !batch;
    showSelectedField();
  };

  const invalidate = () => {
    batch = null;
    preview.hidden = true;
    previewFields.replaceChildren();
    resetFieldReview();
    rowCount.textContent = "0";
    fieldCount.textContent = "0";
    fillButton.disabled = true;
    clearButton.disabled = !pasteInput.value;
    setStatus("idle", "Ready");
    setMessage("Paste complete rows, then prepare and review every Jenkins field.");
  };

  const renderPreview = () => {
    previewFields.replaceChildren();
    resetFieldReview();
    batch.columns.forEach((column) => {
      const card = document.createElement("article");
      const heading = document.createElement("div");
      const label = document.createElement("strong");
      const meta = document.createElement("span");
      const output = document.createElement("textarea");
      card.className = "jenkins-field-preview";
      card.dataset.jenkinsField = column.key;
      label.textContent = column.key;
      meta.textContent = `${column.sheetColumn} · ${column.lineCount} lines`;
      heading.append(label, meta);
      output.value = column.value;
      output.readOnly = true;
      output.rows = Math.min(5, Math.max(2, column.lineCount));
      output.spellcheck = false;
      output.setAttribute("aria-label", `${column.key} line preview`);
      card.append(heading, output);
      previewFields.append(card);
      columnPreviews.push({ key: column.key, card, output });
      if (fieldSelect) {
        const option = document.createElement("option");
        option.value = column.key;
        option.textContent = `${column.sheetColumn} · ${column.key}`;
        fieldSelect.append(option);
      }
    });
    if (fieldSelect) fieldSelect.value = batch.columns[0]?.key || "";
    showSelectedField();
    rowCount.textContent = String(batch.rowCount);
    fieldCount.textContent = String(batch.columns.length);
    preview.hidden = false;
  };

  const prepare = () => {
    if (busy) return;
    try {
      batch = globalThis.LunaJenkinsCore.parseBatch(pasteInput.value, typeSelect.value);
      renderPreview();
      setStatus("ready", "Review ready");
      setMessage(
        `${batch.displayName}: ${batch.rowCount} complete rows separated into ${batch.columns.length} equal Jenkins fields. Review before filling.`,
        "success"
      );
      setBusy(false);
    } catch (error) {
      batch = null;
      preview.hidden = true;
      previewFields.replaceChildren();
      resetFieldReview();
      rowCount.textContent = "0";
      fieldCount.textContent = "0";
      setStatus("error", "Needs correction");
      setMessage(error.message, "error");
      setBusy(false);
    }
  };

  const fillCurrentPage = async () => {
    if (busy || !batch) return;
    setBusy(true);
    setStatus("filling", "Filling");
    setMessage(
      `Filling ${batch.columns.length} ${batch.displayName} Jenkins fields. Credentials and Build remain untouched.`
    );
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error("Luna could not find the active Jenkins tab.");
      }
      const results = await chrome.scripting.executeScript({
        args: [batch],
        func: globalThis.LunaJenkinsPage.fillJenkinsPage,
        target: { tabId: tab.id }
      });
      const result = results?.[0]?.result;
      if (!result?.ok) {
        throw new Error(result?.detail || "The Jenkins page did not confirm the field fill.");
      }
      setStatus("filled", "Fields filled");
      setMessage(
        `Filled ${result.filledFields} fields with ${result.rowCount} aligned lines. Enter credentials yourself, inspect every field, then click Build manually.`,
        "success"
      );
    } catch (error) {
      setStatus("error", "Not filled");
      setMessage(`${error.message} Nothing was submitted.`, "error");
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    if (busy) return;
    pasteInput.value = "";
    invalidate();
  };

  const copySelectedField = async () => {
    if (busy || !batch) return;
    const reviewedBatch = batch;
    const column = batch.columns.find((item) => item.key === fieldSelect?.value);
    if (!column) return;
    try {
      await navigator.clipboard.writeText(column.value);
      if (batch === reviewedBatch) setMessage(`${column.key} copied.`, "success");
    } catch {
      if (batch !== reviewedBatch) return;
      const output = columnPreviews.find((item) => item.key === column.key)?.output;
      output?.focus();
      output?.select();
      setMessage(`Select and copy the ${column.key} output.`, "info");
    }
  };

  typeSelect.addEventListener("change", invalidate);
  pasteInput.addEventListener("input", invalidate);
  prepareButton.addEventListener("click", prepare);
  clearButton.addEventListener("click", clear);
  fillButton.addEventListener("click", fillCurrentPage);
  fieldSelect?.addEventListener("change", showSelectedField);
  fieldCopy?.addEventListener("click", copySelectedField);
  invalidate();

  return Object.freeze({
    onSectionShown(sectionId) {
      if (sectionId === "jenkins-assistant" && !view.hidden) {
        setBusy(false);
      }
    }
  });
})();
