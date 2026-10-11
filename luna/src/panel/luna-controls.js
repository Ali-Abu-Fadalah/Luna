/* Lunar selectors. Native select values remain the source of truth. */
(function () {
  "use strict";

  const instances = new WeakMap();
  const openControls = new Set();
  let nextId = 0;

  function element(tag, className) {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  }

  function closeAll() {
    for (const control of openControls) control.close();
  }

  function enhanceSelect(select) {
    if (instances.has(select)) return instances.get(select);
    if (!(select instanceof HTMLSelectElement) || select.multiple) return null;

    const id = `luna-select-${++nextId}`;
    const wrapper = element("div", "luna-select");
    const trigger = element("button", "select-trigger");
    const value = element("span", "select-value");
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrow.classList.add("select-chevron");
    arrow.setAttribute("viewBox", "0 0 24 24");
    arrow.setAttribute("fill", "none");
    arrow.setAttribute("stroke", "currentColor");
    arrow.setAttribute("stroke-width", "1.6");
    arrow.setAttribute("stroke-linecap", "round");
    arrow.setAttribute("stroke-linejoin", "round");
    arrow.setAttribute("focusable", "false");
    const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrowPath.setAttribute("d", "m7 10 5 5 5-5");
    arrow.append(arrowPath);
    const popup = element("div", "select-popover");
    const list = element("div", "select-options");
    const search = select.dataset.searchable === "true" ? element("input", "select-search") : null;
    let activeIndex = -1;
    let shownOptions = [];

    trigger.type = "button";
    trigger.id = id;
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", `${id}-options`);
    if (!search) trigger.setAttribute("role", "combobox");
    arrow.setAttribute("aria-hidden", "true");
    trigger.append(value, arrow);
    popup.id = `${id}-popup`;
    popup.hidden = true;
    popup.style.position = "fixed";
    list.id = `${id}-options`;
    list.setAttribute("role", "listbox");

    const labels = Array.from(select.labels || []);
    const labelNames = [];
    const labelIds = labels
      .map((label, index) => {
        const labelCopy = label.cloneNode(true);
        labelCopy
          .querySelectorAll("select, input, textarea, button, .field-meta")
          .forEach((node) => node.remove());
        const name = labelCopy.textContent.trim();
        labelNames.push(name);
        const nameNode = element("span", "select-accessible-label");
        nameNode.id = `${id}-label-${index}`;
        nameNode.hidden = true;
        nameNode.textContent = name;
        wrapper.append(nameNode);
        label.addEventListener("click", (event) => {
          if (wrapper.contains(event.target) || popup.contains(event.target)) return;
          event.preventDefault();
          trigger.focus();
        });
        return nameNode.id;
      })
      .join(" ");
    const accessibleName = select.getAttribute("aria-label") || select.name || "Choose an option";
    if (labelIds) trigger.setAttribute("aria-labelledby", labelIds);
    else trigger.setAttribute("aria-label", accessibleName);
    if (search) {
      search.type = "search";
      search.placeholder = "Search options";
      search.autocomplete = "off";
      search.setAttribute("role", "combobox");
      search.setAttribute("aria-autocomplete", "list");
      search.setAttribute("aria-expanded", "false");
      search.setAttribute("aria-controls", list.id);
      search.setAttribute("aria-label", `Search ${labelNames.join(" ") || accessibleName}`);
      popup.append(search);
    }
    if (labelIds) list.setAttribute("aria-labelledby", labelIds);
    else list.setAttribute("aria-label", accessibleName);
    popup.append(list);
    select.before(wrapper);
    wrapper.append(select, trigger);
    select.classList.add("native-select");
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    const dialog = select.closest("dialog");
    (dialog || document.body).append(popup);
    if (dialog) dialog.addEventListener("close", () => close());

    function isDisabled(option) {
      return (
        option.disabled ||
        (option.parentElement.tagName === "OPTGROUP" && option.parentElement.disabled)
      );
    }

    function highlight(index) {
      activeIndex = index;
      for (const item of shownOptions)
        item.node.classList.toggle("is-active", item.index === index);
      const current = shownOptions.find((item) => item.index === index);
      const focusOwner = search || trigger;
      if (current) {
        focusOwner.setAttribute("aria-activedescendant", current.node.id);
        current.node.scrollIntoView({ block: "nearest" });
      } else focusOwner.removeAttribute("aria-activedescendant");
    }

    function renderOptions() {
      const query = search ? search.value.trim().toLocaleLowerCase() : "";
      shownOptions = [];
      list.replaceChildren();
      Array.from(select.options).forEach((option, index) => {
        if (option.hidden || !option.label.toLocaleLowerCase().includes(query)) return;
        const node = element("button", "select-option");
        node.type = "button";
        node.tabIndex = -1;
        node.id = `${id}-option-${index}`;
        node.textContent = option.label;
        node.disabled = isDisabled(option);
        node.setAttribute("role", "option");
        node.setAttribute("aria-selected", String(index === select.selectedIndex));
        node.setAttribute("aria-disabled", String(node.disabled));
        node.classList.toggle("is-selected", index === select.selectedIndex);
        node.addEventListener("pointerdown", (event) => event.preventDefault());
        node.addEventListener("click", () => commit(index));
        list.append(node);
        shownOptions.push({ index, node });
      });
      if (!shownOptions.length) {
        const empty = element("div", "select-empty");
        empty.textContent = "No matching options";
        empty.setAttribute("role", "status");
        list.append(empty);
      }
      const enabled = shownOptions.filter((item) => !item.node.disabled);
      const selected = enabled.find((item) => item.index === select.selectedIndex);
      highlight(selected ? selected.index : (enabled[0]?.index ?? -1));
    }

    function position() {
      const bounds = trigger.getBoundingClientRect();
      const gap = 8;
      const roomBelow = window.innerHeight - bounds.bottom - 12 - gap;
      const roomAbove = bounds.top - 12 - gap;
      const above = roomBelow < 180 && roomAbove > roomBelow;
      const height = Math.max(0, Math.min(320, above ? roomAbove : roomBelow));
      popup.classList.toggle("open-on-top", above);
      popup.style.position = "fixed";
      popup.style.width = `${Math.min(bounds.width, window.innerWidth - 24)}px`;
      popup.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - popup.offsetWidth - 12))}px`;
      popup.style.maxHeight = `${height}px`;
      list.style.maxHeight = `${Math.max(0, height - (search ? search.offsetHeight + 24 : 16))}px`;
      const renderedHeight = Math.min(popup.offsetHeight, height);
      popup.style.top = `${above ? bounds.top - gap - renderedHeight : bounds.bottom + gap}px`;
    }

    function close(restoreFocus = false) {
      popup.hidden = true;
      wrapper.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-activedescendant");
      if (search) {
        search.setAttribute("aria-expanded", "false");
        search.removeAttribute("aria-activedescendant");
      }
      openControls.delete(control);
      if (restoreFocus) trigger.focus();
    }

    function open() {
      if (select.disabled) return;
      window.LunaMotion?.settle();
      closeAll();
      if (search) search.value = "";
      popup.hidden = false;
      wrapper.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      if (search) search.setAttribute("aria-expanded", "true");
      openControls.add(control);
      renderOptions();
      position();
      (search || trigger).focus();
    }

    function commit(index) {
      const option = select.options[index];
      if (!option || select.disabled || isDisabled(option)) return;
      const changed = select.selectedIndex !== index;
      select.selectedIndex = index;
      close(true);
      syncState();
      if (changed) {
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    function syncState() {
      const label = select.selectedOptions[0]?.label || "Choose an option";
      if (value.textContent !== label) value.textContent = label;
      if (trigger.disabled !== select.disabled) trigger.disabled = select.disabled;
      if (select.disabled) close();
      if (!popup.hidden) {
        renderOptions();
        position();
      }
    }

    function onKeyDown(event) {
      if (event.target === search && ["Home", "End"].includes(event.key)) return;
      const selectOnlySpace = event.key === " " && !search && event.target === trigger;
      if (event.key === "Tab") {
        if (event.target === search) trigger.focus();
        close();
        return;
      }
      if (event.key === "Escape" && !popup.hidden) {
        event.preventDefault();
        close(true);
        return;
      }
      if (!selectOnlySpace && !["ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(event.key))
        return;
      if (popup.hidden) {
        if (!selectOnlySpace && !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
        event.preventDefault();
        open();
        return;
      }
      event.preventDefault();
      if (event.key === "Enter" || selectOnlySpace) return commit(activeIndex);
      const enabled = shownOptions.filter((item) => !item.node.disabled);
      if (!enabled.length) return;
      let next = enabled.findIndex((item) => item.index === activeIndex);
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = enabled.length - 1;
      else next = (next + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
      highlight(enabled[next].index);
    }

    const control = { select, wrapper, trigger, popup, close, sync: syncState };
    instances.set(select, control);
    trigger.addEventListener("click", () => (popup.hidden ? open() : close()));
    trigger.addEventListener("keydown", onKeyDown);
    select.addEventListener("change", syncState);
    if (search) {
      search.addEventListener("keydown", onKeyDown);
      search.addEventListener("input", () => {
        renderOptions();
        position();
      });
    }
    new MutationObserver(syncState).observe(select, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled", "selected", "label", "value", "hidden"]
    });
    syncState();
    return control;
  }

  document.addEventListener("pointerdown", (event) => {
    for (const control of openControls) {
      if (!control.wrapper.contains(event.target) && !control.popup.contains(event.target))
        control.close();
    }
  });
  document.addEventListener(
    "scroll",
    (event) => {
      for (const control of openControls)
        if (!control.popup.contains(event.target)) control.close();
    },
    true
  );
  window.addEventListener("resize", closeAll);

  window.LunaControls = {
    enhanceSelect,
    enhanceAll(root = document) {
      if (root.matches?.("select[data-luna-select]")) enhanceSelect(root);
      root.querySelectorAll("select[data-luna-select]").forEach(enhanceSelect);
    },
    sync(select) {
      instances.get(select)?.sync();
    },
    closeAll
  };
})();
