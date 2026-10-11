globalThis.LunaWorkQueueNotesCore = (() => {
  const MAX_NOTES = 2000;
  const clean = (value, limit) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);

  const normalize = (value) => {
    const vendor = clean(value?.vendor, 180);
    const adName = clean(value?.adName, 300);
    const note = clean(value?.note, 1000);
    const id = clean(value?.id, 120);
    const createdAt = clean(value?.createdAt, 40);
    if (!vendor || !adName || !note || !id) return null;
    return Object.freeze({ adName, createdAt, id, note, vendor });
  };

  const read = (value) => {
    const rawNotes = Array.isArray(value) ? value : value?.notes;
    return (Array.isArray(rawNotes) ? rawNotes : [])
      .map(normalize)
      .filter(Boolean)
      .slice(-MAX_NOTES);
  };

  const groupByVendor = (notes) => {
    const groups = new Map();
    read(notes).forEach((note) => {
      if (!groups.has(note.vendor)) groups.set(note.vendor, []);
      groups.get(note.vendor).push(note);
    });
    return groups;
  };

  return Object.freeze({ MAX_NOTES, groupByVendor, normalize, read });
})();
