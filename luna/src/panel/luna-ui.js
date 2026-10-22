/* UI state is separate from persisted module state and live service controllers. */
globalThis.LunaUI = (() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const groups = {
    home: "home",
    "sheet-statistics": "insights",
    "work-queue": "work",
    "manual-ad-assistant": "work",
    auctions: "work",
    "scraper-images": "tools",
    "inventory-checker": "tools",
    "jenkins-assistant": "tools",
    settings: "settings"
  };
  const last = { work: "work-queue", tools: "scraper-images" };
  let syncFrame = 0;
  const reasonDialog = $("#luna-unlisted-dialog");
  const menu = $("#luna-module-dialog");
  const controls = globalThis.LunaControls;

  function chooseTab(prefix, key, focus = false) {
    const selectedValue = `${prefix}-${key}`;
    const select = $(`[data-luna-select-tabs="${prefix}"]`);
    if (select) {
      select.value = selectedValue;
      $$(`[data-luna-panel^="${prefix}-"]`).forEach((pane) => {
        const active = pane.dataset.lunaPanel === selectedValue;
        pane.hidden = !active;
        if (active) globalThis.LunaMotion?.enter(pane);
      });
      controls?.sync?.(select);
      select
        .closest("[data-connected-switcher]")
        ?.querySelectorAll("[data-luna-select-step]")
        .forEach((button) => {
          const next = select.selectedIndex + Number(button.dataset.lunaSelectStep);
          button.disabled = next < 0 || next >= select.options.length;
        });
      if (focus) select.focus();
    }
    const tabs = $$(`[data-luna-tabs="${prefix}"] [data-luna-tab]`);
    tabs.forEach((tab) => {
      const active = tab.dataset.lunaTab === selectedValue;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      const pane = $(`#${tab.getAttribute("aria-controls")}`);
      pane.hidden = !active;
      if (active) {
        globalThis.LunaMotion?.enter(pane);
        if (focus) tab.focus();
      }
    });
    controls?.closeAll();
  }
  function bindTabs() {
    $$("[data-luna-tabs]").forEach((nav) => {
      const buttons = [...nav.querySelectorAll("[data-luna-tab]")];
      buttons.forEach((button, index) => {
        const choose = (focus) =>
          chooseTab(
            nav.dataset.lunaTabs,
            button.dataset.lunaTab.slice(nav.dataset.lunaTabs.length + 1),
            focus
          );
        button.addEventListener("click", () => choose(false));
        button.addEventListener("keydown", (event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next].click();
          buttons[next].focus();
        });
      });
    });
    $$("[data-luna-select-tabs]").forEach((select) => {
      const prefix = select.dataset.lunaSelectTabs;
      const switcher = select.closest("[data-connected-switcher]");
      const stepButtons = [...(switcher?.querySelectorAll("[data-luna-select-step]") || [])];
      const syncSteps = () => {
        stepButtons.forEach((button) => {
          const next = select.selectedIndex + Number(button.dataset.lunaSelectStep);
          button.disabled = next < 0 || next >= select.options.length;
        });
      };
      const choose = (focus = false) => {
        chooseTab(prefix, select.value.slice(prefix.length + 1), focus);
        syncSteps();
      };
      select.addEventListener("change", () => choose(false));
      stepButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const next = select.selectedIndex + Number(button.dataset.lunaSelectStep);
          if (next < 0 || next >= select.options.length) return;
          select.selectedIndex = next;
          choose(false);
        });
      });
      syncSteps();
    });
  }
  function sectionChanged(section) {
    controls?.closeAll();
    reasonDialog.close();
    menu.close();
    const group = groups[section];
    if (group === "work" || group === "tools") last[group] = section;
    document.body.dataset.lunaSection = section;
    $$("[data-group]").forEach((button) => {
      if (button.dataset.group === group) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    $$("[data-luna-group-nav]").forEach((nav) => {
      nav.hidden = nav.dataset.lunaGroupNav !== group;
    });
    const pane = $(
      Object.entries({
        home: ".home-dashboard",
        "sheet-statistics": ".sheet-connection-view",
        "work-queue": ".work-queue-view",
        "manual-ad-assistant": ".manual-ad-view",
        auctions: ".auctions-view",
        "scraper-images": ".listings-scraper-view",
        "inventory-checker": ".inventory-checker-view",
        "jenkins-assistant": ".jenkins-assistant-view",
        settings: ".settings-view"
      }).find(([key]) => key === section)?.[1]
    );
    globalThis.LunaMotion?.enter(pane);
    $("#section-title").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function navigate(section) {
    try {
      await globalThis.LunaNavigation?.show(section);
    } catch {
      /* The existing navigation controller reports storage failures. */
    }
  }
  $$(".luna-group-button:not(.nav-item)").forEach((button) =>
    button.addEventListener("click", () => navigate(last[button.dataset.group]))
  );
  $$("[data-luna-section]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.lunaSection));
    if (button.tagName !== "BUTTON")
      button.addEventListener("keydown", (event) => {
        if (["Enter", " "].includes(event.key)) {
          event.preventDefault();
          navigate(button.dataset.lunaSection);
        }
      });
  });
  $("#luna-menu-open").addEventListener("click", () => {
    controls.closeAll();
    menu.showModal();
  });
  $$("[data-luna-dialog-close]").forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close())
  );
  $("#luna-unlisted-open").addEventListener("click", () => {
    controls.closeAll();
    reasonDialog.showModal();
    $("#queue-unlisted-reason").focus();
  });
  function queuePanel() {
    controls.closeAll();
  }
  bindTabs();
  function revealWhenReady(selector, prefix, key, emptySelector) {
    const node = $(selector);
    let wasHidden = node.hidden;
    new MutationObserver(() => {
      if (emptySelector) $(emptySelector).hidden = !node.hidden;
      if (wasHidden && !node.hidden) chooseTab(prefix, key);
      wasHidden = node.hidden;
    }).observe(node, { attributes: true, attributeFilter: ["hidden"] });
  }
  revealWhenReady("#inventory-results", "inventory", "results");
  revealWhenReady("#jenkins-preview", "jenkins", "fields", "#luna-jenkins-empty");
  revealWhenReady("#manual-ad-preview", "manual", "data");
  function providerView() {
    $$(".settings-local-ai-provider").forEach((panel) => {
      panel.hidden = panel.dataset.provider !== $("#luna-ai-provider").value;
      panel.open = !panel.hidden;
    });
  }
  $("#luna-ai-provider").addEventListener("change", providerView);
  providerView();
  // Native option/value/disabled state remains authoritative, including async catalog updates.
  $$("select").forEach((select) => {
    if (select.options.length > 12 || /model|trim|vendor|agent/.test(select.id))
      select.dataset.searchable = "true";
  });
  controls.enhanceAll();
  const insightsSelect = $("#insights-view-select");
  const insightsTabs = $$("[data-sheet-subview-button]");
  insightsSelect?.addEventListener("change", () => {
    insightsTabs
      .find((button) => button.dataset.sheetSubviewButton === insightsSelect.value)
      ?.click();
    controls.closeAll();
  });
  if (insightsSelect) {
    new MutationObserver(() => {
      const active = insightsTabs.find((button) => button.getAttribute("aria-pressed") === "true");
      if (active) insightsSelect.value = active.dataset.sheetSubviewButton;
      controls.sync(insightsSelect);
    }).observe($(".sheet-statistics-tabs"), {
      attributes: true,
      subtree: true,
      attributeFilter: ["aria-pressed"]
    });
  }
  new MutationObserver((records) => {
    if (
      syncFrame ||
      !records.some((record) => !record.target.closest?.(".luna-select,.select-popover"))
    )
      return;
    syncFrame = requestAnimationFrame(() => {
      syncFrame = 0;
      $$("select[data-luna-select]").forEach((select) => controls.sync(select));
    });
  }).observe(document.querySelector(".app-shell"), { childList: true, subtree: true });
  $$(".sheet-statistics-tab").forEach((button) =>
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = $$(".sheet-statistics-tab");
      const index = buttons.indexOf(button);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].click();
      buttons[next].focus();
    })
  );
  return Object.freeze({
    sectionChanged,
    chooseTab,
    queuePanelSelected: queuePanel,
    queueSaved(status) {
      if (status === "unlisted") reasonDialog.close();
    }
  });
})();
