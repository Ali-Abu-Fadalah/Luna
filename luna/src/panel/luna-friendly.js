/* Friendly Workspace presentation. Module data and service controllers stay authoritative. */
(function () {
  "use strict";

  const body = document.body;
  if (!body.classList.contains("friendly-workspace")) return;

  const $ = (selector) => document.querySelector(selector);
  const preferenceKey = "luna.appearance.v1";
  const defaults = { appearance: "moonlight", surface: "glass", depth: "sculpted" };
  const allowed = {
    appearance: ["moonlight", "daylight"],
    surface: ["glass", "mineral"],
    depth: ["sculpted", "quiet"]
  };
  const sections = {
    home: [
      "Make room for your work.",
      "A little space to bring your work together.",
      ".home-dashboard"
    ],
    "sheet-statistics": [
      "Your insights",
      "A clearer view of the work taking shape.",
      ".sheet-connection-view"
    ],
    "work-queue": ["Your work queue", "One task at a time, all in its place.", ".work-queue-view"],
    "manual-ad-assistant": [
      "Your next listing",
      "Gather the details and give your listing a little space.",
      ".manual-ad-view"
    ],
    auctions: [
      "Your auctions",
      "Prepare, review, and keep every auction in order.",
      ".auctions-view"
    ],
    "scraper-images": [
      "Your listings",
      "Bring listing details and images into one place.",
      ".listings-scraper-view"
    ],
    "inventory-checker": [
      "Your inventory",
      "Find what you need and see what is available.",
      ".inventory-checker-view"
    ],
    "jenkins-assistant": [
      "Your Jenkins workspace",
      "Prepare the details, then review your next step.",
      ".jenkins-assistant-view"
    ],
    settings: [
      "Make it yours",
      "Your connections and preferences, close at hand.",
      ".settings-view"
    ]
  };
  const jump = $("#luna-jump-open");
  const appearanceButton = $("#luna-appearance-toggle");
  const quickTrigger = $("#luna-quick-open");
  const quickMenu = $("#luna-quick-menu");
  const commandDialog = $("#luna-command-dialog");
  const commandInput = $("#luna-command-input");
  const commandResults = $("#luna-command-results");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let preferences = { ...defaults };
  let preferencesTouched = false;
  let commandOrigin = null;
  let restoreCommandFocus = true;
  let lastWorkspace = "work-queue";
  let dockFrame = 0;
  let pendingWrites = 0;
  let writes = Promise.resolve();

  const capitalized = (value) => value.charAt(0).toUpperCase() + value.slice(1);
  const visible = (element) =>
    Boolean(
      element?.isConnected &&
        !element.closest("[hidden],[inert]") &&
        element.getClientRects().length
    );
  const focus = (element) => {
    if (!visible(element) || element.disabled) return;
    element.focus({ preventScroll: true });
    const scroller = commandResults?.contains(element)
      ? commandResults
      : quickMenu?.contains(element)
        ? quickMenu
        : null;
    if (scroller) {
      const item = element.getBoundingClientRect();
      const viewport = scroller.getBoundingClientRect();
      if (item.top < viewport.top) scroller.scrollTop -= viewport.top - item.top;
      else if (item.bottom > viewport.bottom) scroller.scrollTop += item.bottom - viewport.bottom;
    }
  };
  const commandIsOpen = () => Boolean(commandDialog?.open);
  const quickButtons = () => Array.from(quickMenu?.querySelectorAll("button:not(:disabled)") || []);
  const commandButtons = () =>
    Array.from(commandResults?.querySelectorAll("button:not(:disabled)") || []);

  function setText(selector, value) {
    const element = $(selector);
    if (element && element.textContent !== value) element.textContent = value;
  }

  function normalizedPreferences(value) {
    return Object.fromEntries(
      Object.entries(defaults).map(([key, fallback]) => [
        key,
        allowed[key].includes(value?.[key]) ? value[key] : fallback
      ])
    );
  }

  function updateMotion() {
    body.dataset.motion = reduced.matches || preferences.depth === "quiet" ? "reduced" : "normal";
    if (body.dataset.motion === "reduced") globalThis.LunaMotion?.settle();
    const motionButton = $("#luna-motion-toggle");
    motionButton?.setAttribute(
      "aria-pressed",
      String(preferences.depth === "quiet" || reduced.matches)
    );
    motionButton?.setAttribute(
      "aria-label",
      reduced.matches
        ? "Reduced motion is enabled on your device"
        : preferences.depth === "quiet"
          ? "Use Sculpted depth"
          : "Use Quiet depth"
    );
    if (motionButton) {
      motionButton.disabled = reduced.matches;
      motionButton.title = motionButton.getAttribute("aria-label");
    }
  }

  function applyPreferences(next, persist = false) {
    preferences = normalizedPreferences(next);
    Object.assign(body.dataset, preferences);
    updateMotion();
    const destination = preferences.appearance === "moonlight" ? "Daylight" : "Moonlight";
    setText("#luna-appearance-label", destination);
    setText("#luna-surface-label", capitalized(preferences.surface));
    setText("#luna-depth-label", capitalized(preferences.depth));
    setText(
      "#luna-appearance-caption",
      `${capitalized(preferences.appearance)} · ${capitalized(preferences.surface)} · ${capitalized(preferences.depth)}`
    );
    appearanceButton?.setAttribute("aria-label", `Switch to ${destination} appearance`);
    appearanceButton?.setAttribute("title", `Switch to ${destination}`);
    $("[data-friendly-action='surface']")?.setAttribute(
      "aria-pressed",
      String(preferences.surface === "glass")
    );
    $("[data-friendly-action='depth']")?.setAttribute(
      "aria-pressed",
      String(preferences.depth === "sculpted")
    );
    if (persist) {
      preferencesTouched = true;
      const snapshot = { ...preferences };
      pendingWrites += 1;
      writes = writes
        .catch(() => {})
        .then(() => globalThis.chrome?.storage?.local?.set({ [preferenceKey]: snapshot }))
        .catch(() => {
          /* A storage failure does not change the current workspace or its drafts. */
        })
        .finally(() => {
          pendingWrites -= 1;
        });
    }
    if (commandIsOpen()) renderCommands();
  }

  function changePreference(key, value) {
    if (allowed[key]?.includes(value)) applyPreferences({ ...preferences, [key]: value }, true);
  }

  function closeQuick(restore = false) {
    if (!quickMenu) return;
    quickMenu.hidden = true;
    quickTrigger?.setAttribute("aria-expanded", "false");
    if (restore) focus(quickTrigger);
  }

  function closeTransientControls() {
    closeQuick();
    globalThis.LunaControls?.closeAll();
    document.querySelectorAll("dialog[open]").forEach((dialog) => {
      if (dialog !== commandDialog) dialog.close();
    });
  }

  function openQuick(keyboardDirection = 0) {
    if (!quickMenu || !quickTrigger) return;
    if (commandIsOpen()) closeCommand(false);
    globalThis.LunaControls?.closeAll();
    quickMenu.hidden = false;
    positionQuick();
    quickTrigger.setAttribute("aria-expanded", "true");
    if (keyboardDirection) {
      const buttons = quickButtons();
      focus(keyboardDirection > 0 ? buttons[0] : buttons.at(-1));
    }
  }

  function positionQuick() {
    if (!quickMenu || quickMenu.hidden || !quickTrigger) return;
    const viewport = window.visualViewport;
    const viewLeft = viewport?.offsetLeft || 0;
    const viewTop = viewport?.offsetTop || 0;
    const viewWidth = viewport?.width || window.innerWidth;
    const viewHeight = viewport?.height || window.innerHeight;
    const margin = 8;
    const gap = 10;
    const anchor = quickTrigger.getBoundingClientRect();
    const width = Math.min(222, Math.max(0, viewWidth - margin * 2));
    quickMenu.style.width = `${width}px`;
    quickMenu.style.maxHeight = `${Math.max(0, viewHeight - margin * 2)}px`;
    const height = quickMenu.getBoundingClientRect().height;
    const below = viewTop + viewHeight - margin - anchor.bottom - gap;
    const above = anchor.top - viewTop - margin - gap;
    const top = below < height && above > below ? anchor.top - gap - height : anchor.bottom + gap;
    quickMenu.style.left = `${Math.max(viewLeft + margin, Math.min(anchor.right - width, viewLeft + viewWidth - width - margin))}px`;
    quickMenu.style.top = `${Math.max(viewTop + margin, Math.min(top, viewTop + viewHeight - margin - height))}px`;
  }

  function currentSection() {
    return Object.hasOwn(sections, body.dataset.lunaSection) ? body.dataset.lunaSection : "home";
  }

  function currentPane() {
    return $(sections[currentSection()][2]);
  }

  function focusWorkspace() {
    const fields = currentPane()?.querySelectorAll(
      "textarea:not(:disabled),input:not(:disabled):not([type='hidden']):not([type='file']),.select-trigger:not(:disabled),button:not(:disabled)"
    );
    focus(Array.from(fields || []).find(visible) || $("#section-title"));
  }

  async function navigate(section) {
    closeTransientControls();
    try {
      const saving = globalThis.LunaNavigation?.show
        ? globalThis.LunaNavigation.show(section)
        : $("[data-luna-section='" + section + "']")?.click();
      // The existing navigator renders synchronously, then saves the active section.
      // Move focus with that render, never after a slow profile write completes.
      syncSection();
      focusWorkspace();
      await saving;
    } catch {
      /* Navigation renders before storage; existing controllers report any persistence failure. */
    }
  }

  function openSections() {
    closeQuick();
    const trigger = $("#luna-menu-open");
    trigger?.click();
    focus($("#luna-module-dialog button:not(:disabled)"));
  }

  function toggleFocus() {
    const active = body.dataset.focus !== "true";
    body.dataset.focus = String(active);
    document.querySelectorAll("[data-friendly-action='focus']").forEach((button) => {
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute(
        "aria-label",
        active ? "Exit eclipse focus mode" : "Focus on this workspace"
      );
    });
    focusWorkspace();
  }

  function syncDock() {
    const dock = $(".luna-primary-nav");
    if (!dock) return;
    const buttons = Array.from(dock.querySelectorAll("[data-group]"));
    const selected = buttons.find((button) => button.getAttribute("aria-current") === "page");
    if (!selected) return;
    dock.style.setProperty("--dock-index", String(buttons.indexOf(selected)));
    dock.style.setProperty("--dock-x", `${selected.offsetLeft}px`);
    dock.style.setProperty("--dock-width", `${selected.offsetWidth}px`);
  }

  function syncSection() {
    const section = currentSection();
    if (["work-queue", "manual-ad-assistant", "auctions"].includes(section))
      lastWorkspace = section;
    setText("#section-title", sections[section][0]);
    setText("#luna-friendly-description", sections[section][1]);
    closeQuick();
    syncDock();
  }

  function commandItems() {
    const appearanceItem = (appearance) => ({
      label: `Use ${capitalized(appearance)} appearance`,
      hint:
        preferences.appearance === appearance
          ? "Current appearance"
          : appearance === "daylight"
            ? "Light pearl and lilac"
            : "Midnight blue and lunar silver",
      keywords: `theme atmosphere ${appearance === "daylight" ? "light white day" : "dark night moon"}`,
      run: () => {
        changePreference("appearance", appearance);
        focus(appearanceButton);
      }
    });
    const surfaceItem = (surface) => ({
      label: `Use ${capitalized(surface)} surface`,
      hint:
        preferences.surface === surface ? "Current surface" : "Change the finish, keep your work",
      keywords: `material finish ${surface} ${surface === "mineral" ? "matte" : "glass"}`,
      run: () => {
        changePreference("surface", surface);
        focus(jump);
      }
    });
    const depthItem = (depth) => ({
      label: `Use ${capitalized(depth)} depth`,
      hint: reduced.matches
        ? "Your device’s reduced motion setting is respected"
        : preferences.depth === depth
          ? "Current depth"
          : depth === "quiet"
            ? "The same workspace with less movement"
            : "Bring back the small dimensional interactions",
      keywords: `motion animation depth ${depth} ${depth === "quiet" ? "reduce" : "3d"}`,
      run: () => {
        changePreference("depth", depth);
        focus(jump);
      }
    });
    const otherAppearance = preferences.appearance === "moonlight" ? "daylight" : "moonlight";
    const otherSurface = preferences.surface === "glass" ? "mineral" : "glass";
    const otherDepth = preferences.depth === "sculpted" ? "quiet" : "sculpted";
    const items = [
      {
        label: "Go to workspace",
        hint: "Continue your current work",
        keywords: "home draft form space",
        run: () => navigate(lastWorkspace)
      },
      {
        label: "Open all sections",
        hint: "Find your tools and workspaces",
        keywords: "collection menu modules library navigation",
        run: openSections
      },
      {
        label: "Open auctions",
        hint: "Prepare auctions or continue republishing",
        keywords: "auction ads republish listing",
        run: () => navigate("auctions")
      },
      appearanceItem(otherAppearance),
      depthItem(otherDepth),
      surfaceItem(otherSurface)
    ];
    const sectionLabels = {
      home: "Home",
      "sheet-statistics": "Sheet Statistics",
      "work-queue": "Work Queue",
      "manual-ad-assistant": "Manual Ad Assistant",
      "scraper-images": "Listings Scraper",
      "inventory-checker": "Inventory Checker",
      "jenkins-assistant": "Jenkins Assistant",
      settings: "Settings"
    };
    Object.entries(sectionLabels).forEach(([section, label]) =>
      items.push({
        label: `Open ${label}`,
        hint: sections[section][1],
        keywords: `section workspace ${section.replaceAll("-", " ")}`,
        kind: "section",
        run: () => navigate(section)
      })
    );
    items.push(
      appearanceItem(preferences.appearance),
      surfaceItem(preferences.surface),
      depthItem(preferences.depth),
      {
        label: body.dataset.focus === "true" ? "Exit eclipse focus" : "Focus on this workspace",
        hint: "Quiet the surroundings and keep every control available",
        keywords: "focus eclipse concentrate",
        run: toggleFocus
      }
    );
    return items;
  }

  function renderCommands() {
    if (!commandResults || !commandInput) return;
    const focusedCommand = commandResults.contains(document.activeElement)
      ? document.activeElement.closest("button")?.dataset.friendlyCommand
      : null;
    const query = commandInput.value.trim().toLocaleLowerCase();
    const all = commandItems();
    const matches = query
      ? all.filter((item) =>
          `${item.label} ${item.hint} ${item.keywords}`.toLocaleLowerCase().includes(query)
        )
      : all.slice(0, 6);
    const shown = matches.slice(0, 6);
    const fragment = document.createDocumentFragment();
    shown.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.friendlyCommand = item.label;
      button.className = "luna-command-result u-command-result";
      const symbol = document.createElement("span");
      symbol.className = `luna-command-symbol r-phase r-phase-${item.kind === "section" ? "full" : "crescent"}`;
      symbol.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.className = "luna-command-text u-command-text";
      text.append(document.createTextNode(item.label));
      const hint = document.createElement("small");
      hint.textContent = item.hint;
      text.append(hint);
      const enter = document.createElement("span");
      enter.className = "luna-command-go u-command-go";
      enter.textContent = "↵";
      enter.setAttribute("aria-hidden", "true");
      button.append(symbol, text, enter);
      button.addEventListener("click", () => {
        closeCommand(false);
        item.run();
      });
      fragment.append(button);
    });
    if (!shown.length) {
      const empty = document.createElement("p");
      empty.className = "luna-command-empty u-command-empty";
      empty.textContent = "No matches. Try “theme”, “auctions”, or a section name.";
      fragment.append(empty);
    }
    commandResults.replaceChildren(fragment);
    if (focusedCommand && commandIsOpen())
      focus(
        commandButtons().find((button) => button.dataset.friendlyCommand === focusedCommand) ||
          commandInput
      );
    setText(
      "#luna-command-count",
      query
        ? matches.length
          ? `${shown.length} of ${matches.length} matches`
          : "No matches"
        : "Quick actions"
    );
  }

  function restoreFocusAfterCommand() {
    jump?.setAttribute("aria-expanded", "false");
    if (restoreCommandFocus) focus(visible(commandOrigin) ? commandOrigin : jump);
    commandOrigin = null;
  }

  function closeCommand(restore = true) {
    if (!commandIsOpen()) return;
    restoreCommandFocus = restore;
    commandDialog.close();
    // Native close events are queued. Restore now so the next action can deliberately move focus.
    restoreFocusAfterCommand();
  }

  function openCommand() {
    if (!commandDialog || !commandInput) return;
    if (commandIsOpen()) {
      closeCommand();
      return;
    }
    commandOrigin = document.activeElement;
    restoreCommandFocus = true;
    closeTransientControls();
    commandInput.value = "";
    renderCommands();
    commandDialog.showModal();
    jump?.setAttribute("aria-expanded", "true");
    commandInput.focus();
  }

  quickTrigger?.addEventListener("click", () => (quickMenu?.hidden ? openQuick() : closeQuick()));
  quickTrigger?.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    openQuick(event.key === "ArrowDown" ? 1 : -1);
  });
  quickMenu?.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = quickButtons();
    if (!buttons.length) return;
    event.preventDefault();
    let index = buttons.indexOf(document.activeElement);
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = buttons.length - 1;
    else index = (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    focus(buttons[index]);
  });
  quickMenu?.addEventListener("focusout", (event) => {
    // During a pointer focus transfer Chromium temporarily exposes body as activeElement.
    // The intended next control is already available on focusout's relatedTarget.
    const next = event.relatedTarget;
    if (next && !quickMenu.contains(next) && next !== quickTrigger) closeQuick();
  });
  document.querySelectorAll("[data-friendly-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.friendlyAction;
      if (action === "surface") {
        changePreference("surface", preferences.surface === "glass" ? "mineral" : "glass");
        return;
      }
      if (action === "depth") {
        changePreference("depth", preferences.depth === "sculpted" ? "quiet" : "sculpted");
        return;
      }
      closeQuick();
      if (action === "workspace") navigate(lastWorkspace);
      else if (action === "collection") openSections();
      else if (action === "focus") toggleFocus();
      else if (action === "atmosphere") {
        changePreference(
          "appearance",
          preferences.appearance === "moonlight" ? "daylight" : "moonlight"
        );
        focus(quickTrigger);
      }
    });
  });
  appearanceButton?.addEventListener("click", () => {
    closeQuick();
    changePreference(
      "appearance",
      preferences.appearance === "moonlight" ? "daylight" : "moonlight"
    );
  });
  $("#luna-motion-toggle")?.addEventListener("click", () => {
    changePreference("depth", preferences.depth === "sculpted" ? "quiet" : "sculpted");
  });
  jump?.addEventListener("click", openCommand);
  $("#luna-command-close")?.addEventListener("click", () => closeCommand());
  commandDialog?.addEventListener("close", () => {
    if (!commandIsOpen() && commandOrigin) restoreFocusAfterCommand();
  });
  commandDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeCommand();
  });
  commandDialog?.addEventListener("click", (event) => {
    if (event.target !== commandDialog) return;
    const bounds = commandDialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      closeCommand();
  });
  commandInput?.addEventListener("input", renderCommands);
  commandInput?.addEventListener("keydown", (event) => {
    const buttons = commandButtons();
    if (!buttons.length) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      focus(event.key === "ArrowDown" ? buttons[0] : buttons.at(-1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      buttons[0].click();
    }
  });
  commandResults?.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = commandButtons();
    if (!buttons.length) return;
    event.preventDefault();
    let index = buttons.indexOf(document.activeElement);
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = buttons.length - 1;
    else index = (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    focus(buttons[index]);
  });
  document.addEventListener("click", (event) => {
    if (!quickMenu?.contains(event.target) && !quickTrigger?.contains(event.target)) closeQuick();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        openCommand();
        return;
      }
      if (commandIsOpen()) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeCommand();
        } else if (event.key === "Tab") {
          const controls = Array.from(
            commandDialog.querySelectorAll(
              "button:not(:disabled),input:not(:disabled),[tabindex='0']"
            )
          ).filter(visible);
          if (!controls.length) return;
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }
      if (event.key === "Escape" && quickMenu && !quickMenu.hidden) {
        event.preventDefault();
        closeQuick(true);
      }
    },
    true
  );
  const observer = new MutationObserver(syncSection);
  observer.observe(body, { attributes: true, attributeFilter: ["data-luna-section"] });
  function scheduleLayout() {
    if (dockFrame) return;
    dockFrame = requestAnimationFrame(() => {
      dockFrame = 0;
      syncDock();
      positionQuick();
    });
  }
  window.addEventListener("resize", scheduleLayout);
  document.addEventListener(
    "scroll",
    (event) => {
      if (quickMenu && !quickMenu.hidden && !quickMenu.contains(event.target)) scheduleLayout();
    },
    true
  );
  window.visualViewport?.addEventListener("resize", scheduleLayout);
  window.visualViewport?.addEventListener("scroll", () => {
    if (quickMenu && !quickMenu.hidden) scheduleLayout();
  });
  reduced.addEventListener("change", updateMotion);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) closeQuick();
  });
  window.addEventListener(
    "pagehide",
    () => {
      observer.disconnect();
      if (dockFrame) cancelAnimationFrame(dockFrame);
    },
    { once: true }
  );
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || "");
  // This popup follows the reference's native button and Tab behavior, with pressed states.
  // A menu/menuitem role would hide those button semantics from assistive technology.
  quickMenu?.setAttribute("role", "group");
  quickTrigger?.removeAttribute("aria-haspopup");
  quickButtons().forEach((button) => button.removeAttribute("role"));
  setText("#luna-command-shortcut", mac ? "⌘ K" : "Ctrl K");
  jump?.setAttribute("aria-label", "Find an action or a section");
  jump?.setAttribute("title", "Jump to…");
  jump?.setAttribute("aria-keyshortcuts", mac ? "Meta+K" : "Control+K");
  applyPreferences(defaults);
  syncSection();
  Promise.resolve(globalThis.chrome?.storage?.local?.get({ [preferenceKey]: defaults }))
    .then((saved) => {
      if (!preferencesTouched) applyPreferences(normalizedPreferences(saved?.[preferenceKey]));
    })
    .catch(() => {
      /* Defaults are usable even when profile storage is unavailable. */
    });
  globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes[preferenceKey]) {
      // An older queued write must not replace the user's newer visible selection.
      const changed = normalizedPreferences(changes[preferenceKey].newValue);
      if (!pendingWrites && JSON.stringify(changed) !== JSON.stringify(preferences))
        applyPreferences(changed);
    }
  });
  globalThis.LunaFriendly = Object.freeze({ openCommand, closeCommand, closeQuick, syncSection });
})();
