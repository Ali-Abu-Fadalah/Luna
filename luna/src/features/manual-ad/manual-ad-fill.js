(() => {
  const clean = (value) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ");
  const normalize = (value) =>
    clean(value)
      .toLocaleLowerCase("en")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const result = (field, status, detail = "") => ({ detail, field, status });
  const isSuccessful = (item) => ["Filled", "Unchanged"].includes(item?.status);
  const waitForReadback = async (readValue, choice, attempts = 20) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const current = readValue();
      const values = Array.isArray(current) ? current : [current];
      if (values.some((value) => normalize(value) === normalize(choice))) return true;
      await delay(40);
    }
    return false;
  };

  const nativeSetText = (input, value) => {
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set.call(input, value);
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: String(value),
        inputType: "insertText"
      })
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const setTextField = async (field, selector, value) => {
    if (!clean(value)) {
      return result(field, "Needs manual check", "No reviewed value is available.");
    }
    const input = document.querySelector(selector);
    if (!input || !visible(input)) {
      return result(field, "Needs manual check", "Required text field was not found.");
    }
    if (normalize(input.value) === normalize(value)) {
      return result(field, "Unchanged", "Already matched the reviewed value.");
    }
    nativeSetText(input, value);
    const retained = await waitForReadback(() => input.value, value, 10);
    return retained
      ? result(field, "Filled", "Read-back matched.")
      : result(field, "Failed", "Ayshei did not retain the reviewed value.");
  };

  const openSelect = (trigger) => {
    trigger.focus();
    trigger.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        view: window
      })
    );
  };

  const waitForOption = async (trigger, choice, attempts = 160) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controlledList = trigger.getAttribute("aria-controls");
      const listbox = controlledList ? document.getElementById(controlledList) : null;
      const root =
        listbox || [...document.querySelectorAll("[role='listbox']")].filter(visible).at(-1);
      const options = [...(root || document).querySelectorAll("[role='option'],li")].filter(
        visible
      );
      const exact = options.filter(
        (element) => normalize(element.textContent) === normalize(choice)
      );
      if (exact.length === 1) return exact[0];
      await delay(50);
    }
    return null;
  };

  const selectMui = async (field, triggerSelector, hiddenSelector, choice, optionAttempts = 60) => {
    if (!clean(choice)) {
      return result(field, "Needs manual check", "No reviewed option is available.");
    }
    const trigger = document.querySelector(triggerSelector);
    const hidden = document.querySelector(hiddenSelector);
    if (!trigger || !visible(trigger) || trigger.getAttribute("aria-disabled") === "true") {
      return result(field, "Needs manual check", "Required dropdown was unavailable.");
    }
    const current = [clean(trigger.textContent), clean(hidden?.value)];
    if (current.some((value) => normalize(value) === normalize(choice))) {
      return result(field, "Unchanged", "Already matched the reviewed option.");
    }
    openSelect(trigger);
    const option = await waitForOption(trigger, choice, optionAttempts);
    if (!option) {
      return result(field, "Needs manual check", `Option “${choice}” was not uniquely available.`);
    }
    option.click();
    const retained = await waitForReadback(
      () => [clean(trigger.textContent), clean(hidden?.value)],
      choice,
      60
    );
    return retained
      ? result(field, "Filled", "Read-back matched the selected option.")
      : result(field, "Failed", "Ayshei did not retain the selected option.");
  };

  const openAutocomplete = (input) => {
    input.focus();
    input.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        view: window
      })
    );
    input.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        view: window
      })
    );
    input.click();
  };

  const writeAutocompleteText = async (input, choice) => {
    openAutocomplete(input);
    input.select();
    const inserted = document.execCommand("insertText", false, choice);
    if (!inserted || normalize(input.value) !== normalize(choice)) {
      nativeSetText(input, choice);
    }
    input.dispatchEvent(
      new KeyboardEvent("keyup", {
        bubbles: true,
        composed: true,
        key: choice.slice(-1)
      })
    );
    await delay(40);
    openAutocomplete(input);
    return waitForReadback(() => input.value, choice, 20);
  };

  const selectAutocomplete = async (field, choice) => {
    if (!clean(choice)) {
      return result(field, "Needs manual check", "No reviewed model is available.");
    }
    const input = document.querySelector("input[name='makeAndModel'][role='combobox']");
    if (!input || !visible(input)) {
      return result(field, "Needs manual check", "Make & Model search was not found.");
    }
    if (normalize(input.value) === normalize(choice)) {
      return result(field, "Unchanged", "Already matched the reviewed model.");
    }
    const textRetained = await writeAutocompleteText(input, choice);
    if (!textRetained) {
      return result(field, "Failed", "Ayshei did not accept the reviewed model text.");
    }
    const option = await waitForOption(input, choice, 160);
    if (!option) {
      return result(
        field,
        "Needs manual check",
        `Exact Ayshei option “${choice}” was not available.`
      );
    }
    option.click();
    const retained = await waitForReadback(() => input.value, choice, 100);
    return retained
      ? result(field, "Filled", "Read-back matched the reviewed model.")
      : result(field, "Failed", "Ayshei did not retain the Make & Model selection.");
  };

  const waitForEnabled = async (selector, attempts = 160) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const element = document.querySelector(selector);
      if (
        element &&
        visible(element) &&
        !element.hasAttribute("disabled") &&
        element.getAttribute("aria-disabled") !== "true" &&
        !element.classList.contains("Mui-disabled")
      ) {
        return element;
      }
      await delay(50);
    }
    return null;
  };

  const clickRadio = async (field, idPrefix, choice) => {
    if (!clean(choice)) {
      return result(field, "Needs manual check", "No reviewed option is available.");
    }
    const input = document.getElementById(`${idPrefix}${choice}`);
    if (!input || input.type !== "radio") {
      return result(field, "Needs manual check", `Option “${choice}” was not found.`);
    }
    if (input.checked) {
      return result(field, "Unchanged", "Already matched the reviewed option.");
    }
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    (label || input).click();
    await delay(50);
    return input.checked
      ? result(field, "Filled", "Read-back confirmed the selected option.")
      : result(field, "Failed", "Ayshei did not retain the selected option.");
  };

  const setDescription = async (description) => {
    const field = "Description";
    if (!clean(description)) {
      return result(field, "Needs manual check", "No reviewed description is available.");
    }
    const editor = [
      ...document.querySelectorAll(
        "[data-lexical-editor='true'][contenteditable='true'],[contenteditable='true'][role='textbox']"
      )
    ].find(visible);
    if (!editor) {
      return result(field, "Needs manual check", "Ayshei’s description editor was not found.");
    }
    const blocks = (value) =>
      String(value || "")
        .replace(/\r/g, "")
        .split(/\n+/)
        .map(clean)
        .filter(Boolean);
    const matchesDescription = () => {
      const actual = blocks(editor.innerText || editor.textContent);
      const expected = blocks(description);
      return (
        actual.length === expected.length &&
        actual.every((value, index) => normalize(value) === normalize(expected[index]))
      );
    };
    if (matchesDescription()) {
      return result(field, "Unchanged", "Already matched the reviewed description.");
    }
    editor.focus();
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);
    try {
      const transfer = new DataTransfer();
      transfer.setData("text/plain", String(description));
      editor.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer
        })
      );
    } catch (error) {
      // The paragraph-aware command fallback below handles older browsers.
    }
    await delay(40);
    if (!matchesDescription()) {
      document.execCommand("selectAll", false);
      document.execCommand("delete", false);
      const paragraphs = String(description)
        .replace(/\r/g, "")
        .split(/\n{2,}/);
      paragraphs.forEach((paragraph, paragraphIndex) => {
        if (paragraphIndex) document.execCommand("insertParagraph", false);
        paragraph.split("\n").forEach((line, lineIndex) => {
          if (lineIndex) document.execCommand("insertLineBreak", false);
          document.execCommand("insertText", false, line);
        });
      });
    }
    await delay(80);
    return matchesDescription()
      ? result(field, "Filled", "Read-back matched with paragraph breaks.")
      : result(field, "Failed", "Ayshei did not retain the reviewed paragraph formatting.");
  };

  const fill = async (draft, options = {}) => {
    const url = new URL(location.href);
    if (
      location.hostname !== "marketplace.example.invalid" ||
      !location.pathname.startsWith("/place-ad/") ||
      url.searchParams.get("step") !== "2"
    ) {
      throw new Error("Open one Ayshei place-ad vehicle-details page at step 2 first.");
    }

    const results = [];
    const usedDraft = draft?.category === "USED";
    const hasUsedFields = Boolean(
      document.querySelector("#kilometers") || document.querySelector("#body_condition")
    );
    if (usedDraft !== hasUsedFields) {
      results.push(
        result(
          "Category",
          "Needs manual check",
          usedDraft
            ? "Step 1 is not showing the Used-only Kilometers and Car Condition fields."
            : "Step 1 is showing Used-only fields for a New or Export draft."
        )
      );
      return { blocked: true, filled: false, results };
    }
    results.push(
      result(
        "Category",
        "Unchanged",
        usedDraft
          ? "Step 1 matches the Used-only field layout."
          : "Step 1 matches the New/Export field layout."
      )
    );

    const yearResult = await selectMui("Year", "#year", "input[name='year']", draft.year, 100);
    results.push(yearResult);

    results.push(await clickRadio("Regional Spec", "region_", draft.regionalSpec));
    if (usedDraft) {
      results.push(await setTextField("Kilometers", "#kilometers", draft.kilometers));
    }
    results.push(await clickRadio("Body Type", "car_", draft.bodyType));
    results.push(await clickRadio("Fuel Type", "fuel_type_", draft.fuelType));
    results.push(await clickRadio("Transmission Type", "transmission_type_", draft.transmission));
    results.push(await clickRadio("Insured", "insured_", "No"));
    results.push(
      await selectMui("Exterior Color", "#color", "input[name='color']", draft.exteriorColor)
    );
    if (usedDraft) {
      results.push(
        await selectMui(
          "Car Condition",
          "#body_condition",
          "input[name='body_condition']",
          "Very Good - No accidents, very few faults"
        )
      );
    }
    results.push(await setTextField("Item Price", "#price", draft.price));
    results.push(await setDescription(draft.description));

    if (!options.skipVehicleDependencies) {
      let modelResult;
      if (!isSuccessful(yearResult)) {
        modelResult = result(
          "Make & Model",
          "Needs manual check",
          "Skipped because Year was not confirmed first."
        );
      } else if (!Number.isInteger(draft.makeCode) || !Number.isInteger(draft.modelCode)) {
        modelResult = result(
          "Make & Model",
          "Needs manual check",
          "Choose a reviewed Mirror model in Luna first."
        );
      } else if (!(await waitForEnabled("input[name='makeAndModel'][role='combobox']"))) {
        modelResult = result(
          "Make & Model",
          "Failed",
          "Model search did not become ready after Year."
        );
      } else {
        modelResult = await selectAutocomplete("Make & Model", draft.makeModel);
      }
      results.push(modelResult);

      let trimResult;
      if (!isSuccessful(modelResult)) {
        trimResult = result(
          "Trim",
          "Needs manual check",
          "Skipped because Make & Model was not confirmed."
        );
      } else if (!Number.isInteger(draft.trimCode)) {
        trimResult = result(
          "Trim",
          "Needs manual check",
          "Choose a reviewed Mirror trim in Luna first."
        );
      } else if (!(await waitForEnabled("#mui-component-select-trim"))) {
        trimResult = result("Trim", "Failed", "Trim did not become available after Make & Model.");
      } else {
        trimResult = await selectMui(
          "Trim",
          "#mui-component-select-trim",
          "input[name='trim']",
          draft.trim,
          160
        );
      }
      results.push(trimResult);
    }

    return {
      blocked: false,
      filled: results.every(isSuccessful),
      results
    };
  };

  const inspect = () => {
    const url = new URL(location.href);
    if (
      location.hostname !== "marketplace.example.invalid" ||
      !location.pathname.startsWith("/place-ad/") ||
      url.searchParams.get("step") !== "2"
    ) {
      throw new Error("Open an Ayshei place-ad tab at step 2 first.");
    }
    const required = [...document.querySelectorAll("label,fieldset")]
      .filter(visible)
      .map((element) => clean(element.textContent))
      .filter((text) => text.includes("*"))
      .slice(0, 30);
    return {
      required,
      used: Boolean(
        document.querySelector("#kilometers") || document.querySelector("#body_condition")
      )
    };
  };

  const messageListener = (message, sender, sendResponse) => {
    if (sender?.id !== chrome.runtime.id) {
      return undefined;
    }
    if (message?.type === "luna.manualAd.inspect.v4") {
      try {
        sendResponse({ ok: true, result: inspect() });
      } catch (error) {
        sendResponse({ detail: error.message, ok: false });
      }
      return undefined;
    }
    if (message?.type !== "luna.manualAd.fill.v4") return undefined;
    fill(message.draft, message.options)
      .then((fillResult) => sendResponse({ ok: true, result: fillResult }))
      .catch((error) => sendResponse({ detail: error.message, ok: false }));
    return true;
  };

  const previousListener = globalThis.__lunaManualAdFillListener;
  if (typeof previousListener === "function") {
    chrome.runtime.onMessage.removeListener(previousListener);
  }
  globalThis.__lunaManualAdFillListener = messageListener;
  chrome.runtime.onMessage.addListener(messageListener);
})();
