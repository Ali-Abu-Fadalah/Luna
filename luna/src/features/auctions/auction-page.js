(() => {
  if (globalThis.__lunaAuctionPageInstalledV3) return;
  globalThis.__lunaAuctionPageInstalledV3 = true;
  let operationDraft = "";
  let operationRunning = false;
  const clean = (value) =>
    String(value ?? "")
      .replace(/[\t\r\n\u200b]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  const delay = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (element) =>
    !!element &&
    getComputedStyle(element).display !== "none" &&
    getComputedStyle(element).visibility !== "hidden";
  const buttons = (root = document) =>
    [...root.querySelectorAll("button,[role='button'],a[href]")].filter(visible);
  const exact = (label, root = document) => {
    const matches = buttons(root).filter(
      (element) => clean(element.textContent).toLowerCase() === label.toLowerCase()
    );
    // The responsive header renders two identical sell buttons at once.
    // Only this verified header action may have equivalent duplicate controls.
    const equivalentSell =
      label === "Place an ad" &&
      matches.length > 1 &&
      matches.every((element) => element.getAttribute("data-testid") === "header-v2-sell");
    if ((!equivalentSell && matches.length !== 1) || matches[0]?.disabled)
      throw new Error(`“${label}” was not uniquely available. Check the page before retrying.`);
    return matches[0];
  };
  const wait = async (read, label, attempts = 60) => {
    for (let index = 0; index < attempts; index++) {
      checkBound();
      const value = read();
      if (value) return value;
      await delay();
    }
    throw new Error(`${label} was not confirmed by Ayshei.`);
  };
  const assertOrigin = () => {
    if (location.origin !== "https://marketplace.example.invalid")
      throw new Error("Use the signed-in Ayshei website.");
  };
  const assertAuction = () => {
    assertOrigin();
    const auction = document.querySelector("#ad_type_Auction");
    const scheduling = [...document.querySelectorAll("h2")].some(
      (heading) => clean(heading.textContent) === "Auction Scheduling"
    );
    if (!(auction?.checked || scheduling))
      throw new Error(
        "This is not a confirmed Auction form. Start from Ayshei’s Auctions section."
      );
  };
  const assertDraft = (expected) => {
    assertAuction();
    if (
      location.pathname !== `/place-ad/${expected}` ||
      new URL(location.href).searchParams.get("step") !== "2"
    )
      throw new Error(
        "The bound auction draft or step changed. Filling stopped; check the original draft."
      );
  };
  const setText = async (selector, value) => {
    checkBound();
    const element = document.querySelector(selector);
    if (!element || !visible(element) || element.disabled)
      throw new Error(`${selector} is unavailable.`);
    const setter = Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value"
    )?.set;
    setter.call(element, String(value));
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: String(value),
        inputType: "insertText"
      })
    );
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.blur();
    await wait(() => document.querySelector(selector)?.value === String(value), selector);
  };
  const select = async (selector, value) => {
    checkBound();
    let trigger = document.querySelector(selector);
    if (!trigger || !visible(trigger)) throw new Error(`${selector} dropdown is missing.`);
    if (clean(trigger.textContent) === value) return;
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
    const option = await wait(() => {
      const roots = [...document.querySelectorAll("[role='listbox']")].filter(visible);
      const choices = roots
        .flatMap((root) => [...root.querySelectorAll("[role='option']")])
        .filter((item) => clean(item.textContent) === value);
      return choices.length === 1 ? choices[0] : null;
    }, `Exact option ${value}`);
    checkBound();
    option.click();
    await wait(() => clean(document.querySelector(selector)?.textContent) === value, selector);
  };
  const toggle = async (id, checked) => {
    checkBound();
    const element = document.getElementById(id);
    if (!element || element.type !== "checkbox" || element.disabled)
      throw new Error(`${id} switch is missing or disabled.`);
    if (element.checked !== checked) element.click();
    await wait(() => document.getElementById(id)?.checked === checked, id);
  };
  const calendarMonth = () => {
    const first = document.querySelector("button[id^='calendar-day-']");
    return first?.id.slice("calendar-day-".length, "calendar-day-".length + 7) || "";
  };
  const showMonth = async (date) => {
    const target = date.slice(0, 7);
    for (let index = 0; index < 36; index++) {
      checkBound();
      const current = calendarMonth();
      if (current === target) return;
      if (!current) throw new Error("The auction calendar could not be read.");
      const button = document.getElementById(
        current < target ? "calendar-next-month" : "calendar-prev-month"
      );
      if (!button || button.disabled)
        throw new Error("The required calendar month is unavailable.");
      button.click();
      await wait(() => calendarMonth() !== current, "Calendar month");
    }
    throw new Error("Auction dates are too far from the visible calendar. Check the year.");
  };
  const dateBoundary = (date, side) => {
    const button = document.getElementById(`calendar-day-${date}`);
    return (
      !!button &&
      button.classList.contains("bg-primary-1") &&
      button.classList.contains(`rounded-${side}-full`)
    );
  };
  const clickDate = async (date) => {
    await showMonth(date);
    checkBound();
    const button = document.getElementById(`calendar-day-${date}`);
    if (!button || button.disabled) throw new Error(`Date ${date} is unavailable or in the past.`);
    button.click();
    await delay(140);
  };
  const setDates = async (start, end) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end <= start)
      throw new Error("Explicit valid start and end dates are required.");
    // A completed range resets on the next click; an unfinished range may need
    // another click. Require the visible start boundary before choosing the end.
    await clickDate(start);
    if (
      !dateBoundary(start, "l") ||
      [...document.querySelectorAll("button[id^='calendar-day-']")].some(
        (button) =>
          button.classList.contains("rounded-r-full") && button.classList.contains("bg-primary-1")
      )
    )
      await clickDate(start);
    if (!dateBoundary(start, "l"))
      throw new Error(
        "The start date was not selected reliably. Set the calendar manually and verify."
      );
    await clickDate(end);
    if (!dateBoundary(end, "r")) throw new Error("The selected end date does not match the row.");
    await showMonth(start);
    if (!dateBoundary(start, "l"))
      throw new Error("The selected start date does not match the row.");
  };
  const readDates = async (plan) => {
    await showMonth(plan.startDate);
    const start = dateBoundary(plan.startDate, "l");
    await showMonth(plan.endDate);
    const end = dateBoundary(plan.endDate, "r");
    return { start, end };
  };
  const selectedCategory = () => {
    // Ayshei styles the selection without updating the hidden radio property.
    const selected = [...document.querySelectorAll("input[name='third-level-categories']")]
      .map((input) => ({ input, card: input.closest("[role='button']") }))
      .filter(
        ({ input, card }) =>
          input.checked ||
          (card?.classList.contains("bg-primary-4") && card.classList.contains("border-primary-1"))
      );
    return selected.length === 1 ? clean(selected[0].card?.textContent) : "";
  };
  const audit = async ({ draftId, plan, categoryPath }) => {
    assertDraft(draftId);
    const dates = await readDates(plan);
    const entries = [];
    const compare = (field, expected, actual) =>
      entries.push({
        field,
        expected: String(expected),
        actual: String(actual ?? ""),
        ok: String(expected) === String(actual ?? "")
      });
    for (const [field, selector, expected] of [
      ["Title", "#edit_ad_title", plan.title],
      ["Brand", "#brand", plan.brand],
      ["Initial price", "#initial_price", plan.initialPrice],
      ["Reserve price", "#reserve_price", plan.reservePrice]
    ])
      compare(field, expected, document.querySelector(selector)?.value);
    for (const [field, selector, expected] of [
      ["Condition", "#condition", plan.condition],
      ["Start time", "#start-time-select", plan.startTime],
      ["Period", "#day-period-select", "PM"]
    ])
      compare(field, expected, clean(document.querySelector(selector)?.textContent));
    compare("Start date", plan.startDate, dates.start ? plan.startDate : "Unconfirmed");
    compare("End date", plan.endDate, dates.end ? plan.endDate : "Unconfirmed");
    compare("Meet-up", false, document.getElementById("meet-up")?.checked);
    compare("Delivery", true, document.getElementById("delivery-service")?.checked);
    if (plan.tamara) compare("Tamara", true, document.getElementById("enable-tamara")?.checked);
    compare(
      "Description",
      clean(plan.description).replace(/[•*-]\s*/g, ""),
      clean(document.querySelector("[data-lexical-editor='true']")?.innerText).replace(
        /[•*-]\s*/g,
        ""
      )
    );
    // The controller reads the user's selected category from the saved draft;
    // step 2 exposes no editable category control.
    entries.push({
      field: "Category",
      expected: categoryPath.join(" › "),
      actual: "Read from the selected saved draft",
      ok: categoryPath.length === 3
    });
    return { entries, ok: entries.every((entry) => entry.ok), draftId };
  };
  const fill = async (request) => {
    const { draftId, plan } = request;
    assertDraft(draftId);
    if (clean(document.querySelector("#edit_ad_title")?.value) !== plan.title)
      throw new Error(
        "This draft’s listing name does not exactly match the active sheet row. No details were filled."
      );
    for (const [selector, value] of [
      ["#brand", plan.brand],
      ["#initial_price", plan.initialPrice],
      ["#reserve_price", plan.reservePrice]
    ]) {
      assertDraft(draftId);
      await setText(selector, value);
    }
    await select("#condition", plan.condition);
    await setDates(plan.startDate, plan.endDate);
    await select("#start-time-select", plan.startTime);
    await select("#day-period-select", "PM");
    assertDraft(draftId);
    const editor = document.querySelector("[data-lexical-editor='true'][contenteditable='true']");
    if (!editor) throw new Error("Ayshei’s description editor was not found.");
    editor.focus();
    const selection = window.getSelection(),
      range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!document.execCommand("insertText", false, plan.description))
      throw new Error("The description editor did not accept the reviewed text.");
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: plan.description
      })
    );
    editor.blur();
    await toggle("meet-up", false);
    await toggle("delivery-service", true);
    if (plan.tamara) {
      await wait(() => document.getElementById("enable-tamara"), "Tamara switch");
      await toggle("enable-tamara", true);
    }
    await delay(250);
    return audit(request);
  };
  const run = async (message) => {
    assertOrigin();
    if (message.operation === "ready") {
      await wait(
        () =>
          document.getElementById("calendar-header") &&
          document.getElementById("edit_ad_title")?.value === message.title,
        "Reloaded auction draft",
        150
      );
      assertDraft(message.draftId);
      return { ready: true };
    }
    if (message.operation === "delivery") {
      assertDraft(message.draftId);
      if (document.getElementById("edit_ad_title")?.value !== message.title)
        throw new Error("This draft’s title differs from the active row.");
      await toggle("meet-up", false);
      await toggle("delivery-service", true);
      await wait(() => document.getElementById("enable-tamara"), "Tamara availability");
      if (document.getElementById("enable-tamara").disabled)
        throw new Error("Tamara is unavailable for the signed-in account.");
      return { deliveryReady: true };
    }
    if (message.operation === "inspect")
      return {
        url: location.href,
        title: document.querySelector("#ad_title,#edit_ad_title")?.value || "",
        auction:
          !!document.querySelector("#ad_type_Auction:checked") ||
          !!document.getElementById("calendar-header"),
        category: selectedCategory()
      };
    if (message.operation === "start") {
      if (location.pathname !== "/uae/auctions")
        throw new Error("Start on Ayshei’s Auctions section.");
      const place = await wait(() => {
        try {
          return exact("Place an ad");
        } catch {
          return null;
        }
      }, "Place an ad");
      place.click();
      return { navigating: true };
    }
    if (message.operation === "new") {
      if (location.pathname !== "/place-ad/list-draft")
        throw new Error("The draft-list page is required.");
      const add = await wait(() => {
        try {
          return exact("Add New");
        } catch {
          return null;
        }
      }, "Add New");
      add.click();
      return { navigating: true };
    }
    if (message.operation === "title") {
      await wait(() => {
        try {
          assertAuction();
          return true;
        } catch {
          return false;
        }
      }, "Auction form");
      if (location.pathname !== "/place-ad/new")
        throw new Error("Use a new auction, not an existing draft.");
      if (document.querySelector("#ad_title")?.value !== message.title)
        await setText("#ad_title", message.title);
      await delay(400);
      if (document.querySelector("#ad_title")?.value !== message.title)
        throw new Error(
          "The listing title changed while the form loaded. Review the row before continuing."
        );
      return { title: document.querySelector("#ad_title").value };
    }
    if (message.operation === "fill") return fill(message);
    if (message.operation === "audit") return audit(message);
    throw new Error("Unsupported auction operation.");
  };
  const checkBound = () => {
    assertOrigin();
    if (operationDraft) assertDraft(operationDraft);
  };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== "luna.auction.v3" || sender?.id !== chrome.runtime.id) return;
    if (operationRunning) {
      respond({ ok: false, detail: "An auction operation is still running in this tab." });
      return;
    }
    operationRunning = true;
    operationDraft = ["fill", "audit", "delivery"].includes(message.operation)
      ? message.draftId
      : "";
    run(message)
      .then((data) => respond({ ok: true, data }))
      .catch((error) => respond({ ok: false, detail: error.message }))
      .finally(() => {
        operationRunning = false;
        operationDraft = "";
      });
    return true;
  });
})();
