globalThis.LunaAuctionRepublishCore = (() => {
  const clean = (value) =>
    String(value ?? "")
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .trim();
  const titleKey = (value) => clean(value).toLocaleLowerCase("en");
  const amount = (value) => {
    const raw = clean(value)
      .replace(/^AED\s*/i, "")
      .replace(/\s*AED$/i, "");
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw))
      throw new Error("Use a positive AED price with at most two decimal places.");
    const text = raw.replace(/,/g, "");
    if (!/^\d+(?:\.\d{1,2})?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) <= 0)
      throw new Error("Use a positive AED price with at most two decimal places.");
    return String(Number(text));
  };
  const day = (value) => {
    const text = clean(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("Choose a complete start and end date.");
    const date = new Date(`${text}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text)
      throw new Error("Choose valid calendar dates.");
    return date;
  };
  // The admin's datetime-local controls interpret calendar fields in Dubai.
  // This is the portal's own wire conversion, independent of the computer zone.
  const wire = (local) =>
    new Date(`${local}:00+04:00`).toISOString().slice(0, 16).replace("T", " ");
  const validate = (row, now = Date.now()) => {
    const issues = [],
      plan = { title: clean(row.title) };
    if (!plan.title) issues.push("Listing title is missing.");
    try {
      plan.initialPrice = amount(row.startPrice);
    } catch (e) {
      issues.push(
        clean(row.startPrice)
          ? `Initial price: ${e.message}`
          : "Initial price was not identified. Click Edit to choose its source cell or enter it."
      );
    }
    plan.noReserve = /^no\s+reserve$/i.test(clean(row.reservePrice));
    try {
      plan.reservePrice = plan.noReserve ? plan.initialPrice : amount(row.reservePrice);
    } catch (e) {
      issues.push(
        clean(row.reservePrice)
          ? `Reserve price: ${e.message}`
          : "Reserve price was not identified. Click Edit to choose its source cell or enter it."
      );
    }
    if (Number(plan.reservePrice) < Number(plan.initialPrice))
      issues.push("Reserve price is below the initial price.");
    const tamara = titleKey(row.tamara);
    if (tamara && !["yes", "no"].includes(tamara)) issues.push("Tamara must be Yes, No, or blank.");
    plan.includeTamara = tamara === "yes";
    try {
      const startDay = day(row.startDate);
      day(row.endDate);
      plan.startLocal = `${row.startDate}T${startDay.getUTCDay() === 6 ? "22" : "21"}:00`;
      plan.endLocal = `${row.endDate}T21:00`;
      plan.startDate = wire(plan.startLocal);
      plan.endDate = wire(plan.endLocal);
      const start = Date.parse(`${plan.startDate.replace(" ", "T")}:00Z`);
      const end = Date.parse(`${plan.endDate.replace(" ", "T")}:00Z`);
      plan.duration = (end - start) / 1000;
      if (start < Number(now) + 3600000)
        issues.push("The admin requires a start at least one hour from now.");
      if (plan.duration <= 0) issues.push("End date and time must be after the start.");
      if (plan.duration > 1036800) issues.push("The admin allows auctions up to 12 days long.");
    } catch (e) {
      issues.push(e.message);
    }
    return { valid: !issues.length, issues: [...new Set(issues)], plan };
  };
  const signature = (plan) =>
    JSON.stringify([
      titleKey(plan.title),
      plan.startDate,
      plan.endDate,
      plan.initialPrice,
      plan.reservePrice,
      plan.includeTamara
    ]);
  const canSend = (entry) => entry?.status === "prepared" && !!entry.prepared?.ticket;
  const recover = (entries) =>
    entries.map((entry) => ({
      ...entry,
      status: entry.status === "sending" ? "uncertain" : entry.status,
      issue:
        entry.status === "sending"
          ? "Luna closed during the request. Check the result; this row will not be resent."
          : entry.issue
    }));
  const tsv = (entries) => {
    const cell = (value) => {
      let text = String(value ?? "").replace(/[\t\r\n]+/g, " ");
      if (/^[=+@-]/.test(text)) text = `'${text}`;
      return text;
    };
    return [
      "Row\tModel - Title\tAuction link\tStatus",
      ...entries.map((e) => [e.order, e.plan.title, e.link || "", e.status].map(cell).join("\t"))
    ].join("\n");
  };
  return Object.freeze({
    clean,
    titleKey,
    amount,
    validate,
    signature,
    canSend,
    recover,
    tsv
  });
})();
