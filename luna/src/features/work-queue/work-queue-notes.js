globalThis.LunaWorkQueueNotes = (() => {
  const storageKey =
    globalThis.LunaFoundation?.storageKeys.workQueueNotes || "luna.workQueueNotes.v1";
  const storageArea = globalThis.chrome?.storage?.local;
  const list = document.querySelector("#home-notes-list");
  const empty = document.querySelector("#home-notes-empty");
  const count = document.querySelector("#home-notes-count");
  const core = globalThis.LunaWorkQueueNotesCore;
  let notes = [];
  const openVendors = new Set();

  const makeId = () =>
    globalThis.crypto?.randomUUID?.() ||
    `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const persist = async () => {
    if (storageArea?.set) await storageArea.set({ [storageKey]: { notes, version: 1 } });
  };
  const copy = async (value) => {
    if (globalThis.navigator?.clipboard?.writeText)
      await globalThis.navigator.clipboard.writeText(value);
    else throw new Error("Clipboard is unavailable.");
  };

  const render = () => {
    if (!list || !empty || !count) return;
    const groups = core.groupByVendor(notes);
    count.textContent = String(notes.length);
    empty.hidden = notes.length > 0;
    list.replaceChildren();
    groups.forEach((vendorNotes, vendor) => {
      const card = document.createElement("details");
      card.className = "home-note-vendor";
      card.dataset.vendor = vendor;
      card.open = openVendors.has(vendor);
      card.addEventListener("toggle", () => {
        if (card.open) openVendors.add(vendor);
        else openVendors.delete(vendor);
      });
      const summary = document.createElement("summary");
      const label = document.createElement("span");
      label.textContent = vendor;
      const total = document.createElement("small");
      total.textContent = `${vendorNotes.length} note${vendorNotes.length === 1 ? "" : "s"}`;
      summary.append(label, total);
      const content = document.createElement("div");
      content.className = "home-note-vendor-content";
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "home-note-clear-vendor";
      clear.textContent = "Clear vendor notes";
      clear.addEventListener("click", async () => {
        openVendors.delete(vendor);
        notes = notes.filter((note) => note.vendor !== vendor);
        await persist();
        render();
      });
      content.append(clear);
      vendorNotes.forEach((note) => {
        const item = document.createElement("article");
        item.className = "home-note-item";
        const name = document.createElement("strong");
        name.textContent = note.adName;
        const text = document.createElement("p");
        text.textContent = note.note;
        const actions = document.createElement("div");
        actions.className = "home-note-actions";
        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.textContent = "Copy car name";
        copyButton.addEventListener("click", async () => {
          try {
            await copy(note.adName);
            copyButton.textContent = "Car name copied";
          } catch (error) {
            copyButton.textContent = "Copy failed";
          }
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "home-note-remove";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Delete note for ${note.adName}`);
        remove.addEventListener("click", async () => {
          notes = notes.filter((candidate) => candidate.id !== note.id);
          await persist();
          render();
        });
        actions.append(copyButton, remove);
        item.append(name, text, actions);
        content.append(item);
      });
      card.append(summary, content);
      list.append(card);
    });
  };

  const load = async () => {
    if (storageArea?.get) {
      const saved = await storageArea.get({ [storageKey]: { notes: [] } });
      notes = core.read(saved[storageKey]);
    }
    render();
  };

  document.addEventListener("luna:work-queue-note", async (event) => {
    const normalized = core.normalize({
      ...event.detail,
      createdAt: new Date().toISOString(),
      id: makeId()
    });
    if (!normalized) return;
    openVendors.add(normalized.vendor);
    notes = [...notes, normalized].slice(-core.MAX_NOTES);
    await persist();
    render();
  });
  globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes[storageKey]) {
      notes = core.read(changes[storageKey].newValue);
      render();
    }
  });
  const ready = load().catch(() => render());
  return Object.freeze({
    onSectionShown(section) {
      if (section === "home") render();
    },
    ready
  });
})();
