globalThis.LunaJenkinsCore = (() => {
  const TYPE_CONFIG = Object.freeze({
    dubicars: Object.freeze({
      columnCount: 6,
      displayName: "DubiCars",
      fields: Object.freeze([
        Object.freeze({ key: "SCRAPED_URLS", label: "URLs", sheetColumn: "P" }),
        Object.freeze({ key: "CATEGORIES", label: "Categories", sheetColumn: "Q" }),
        Object.freeze({ key: "MAKES_MODELS", label: "Makes & Models", sheetColumn: "R" }),
        Object.freeze({ key: "TRIMS", label: "Trims", sheetColumn: "S" }),
        Object.freeze({ key: "COLORS", label: "Colors", sheetColumn: "T" }),
        Object.freeze({ key: "CONDITIONS", label: "Conditions", sheetColumn: "U" })
      ]),
      hostname: "dubicars.com"
    }),
    dubizzle: Object.freeze({
      columnCount: 8,
      displayName: "Dubizzle",
      fields: Object.freeze([
        Object.freeze({ key: "SCRAPED_URLS", label: "URLs", sheetColumn: "P" }),
        Object.freeze({ key: "CATEGORIES", label: "Categories", sheetColumn: "Q" }),
        Object.freeze({ key: "MAKES_MODELS", label: "Makes & Models", sheetColumn: "R" }),
        Object.freeze({ key: "TRIMS", label: "Trims", sheetColumn: "S" }),
        Object.freeze({ key: "COLORS", label: "Colors", sheetColumn: "T" }),
        Object.freeze({ key: "CONDITIONS", label: "Conditions", sheetColumn: "U" }),
        Object.freeze({ key: "SPECS", label: "Specs", sheetColumn: "V" }),
        Object.freeze({
          key: "TRANSMISSION_TYPES",
          label: "Transmission Types",
          sheetColumn: "W"
        })
      ]),
      hostname: "dubizzle.com"
    }),
    noon: Object.freeze({
      columnCount: 5,
      displayName: "Noon",
      fields: Object.freeze([
        Object.freeze({ key: "SCRAPED_URLS", label: "URLs", sheetColumn: "P" }),
        Object.freeze({ key: "CATEGORIES", label: "Categories", sheetColumn: "Q" }),
        Object.freeze({
          key: "SUB_CATEGORIES",
          label: "Sub Categories",
          sheetColumn: "R"
        }),
        Object.freeze({
          key: "SUB_SUB_CATEGORIES",
          label: "Sub Sub Categories",
          sheetColumn: "S"
        }),
        Object.freeze({ key: "CONDITIONS", label: "Conditions", sheetColumn: "T" })
      ]),
      fixedValues: Object.freeze({ CONDITIONS: "NEW_WITH_TAGS" }),
      hostname: "noon.com"
    })
  });

  const cleanCell = (value) =>
    String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/[\r\n]+/g, " ")
      .trim();

  const getConfig = (type) => {
    const config = TYPE_CONFIG[String(type || "").toLowerCase()];
    if (!config) {
      throw new Error(
        "Choose DubiCars P:U, Dubizzle P:W, or Noon 5 fields before preparing the batch."
      );
    }
    return config;
  };

  const isExpectedVendorUrl = (value, config) => {
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      return (
        ["http:", "https:"].includes(url.protocol) &&
        (hostname === config.hostname || hostname.endsWith(`.${config.hostname}`))
      );
    } catch (error) {
      return false;
    }
  };

  const splitClipboardLines = (value) => {
    const lines = String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .split("\n");
    while (lines.length && lines[0] === "") lines.shift();
    while (lines.length && lines.at(-1) === "") lines.pop();
    return lines;
  };

  const parseBatch = (value, type) => {
    const config = getConfig(type);
    const lines = splitClipboardLines(value);
    if (!lines.length) {
      throw new Error(`Paste complete ${config.displayName} rows before preparing Jenkins.`);
    }

    const rows = [];
    const issues = [];
    lines.forEach((line, index) => {
      const rowNumber = index + 1;
      const cells = line.split("\t").map(cleanCell);
      if (cells.length !== config.columnCount) {
        issues.push(
          `Row ${rowNumber} has ${cells.length} columns; ${config.displayName} requires exactly ${config.columnCount}.`
        );
        return;
      }

      const missing = config.fields
        .filter((_field, fieldIndex) => !cells[fieldIndex])
        .map((field) => `${field.sheetColumn} ${field.label}`);
      if (missing.length) {
        issues.push(
          `Row ${rowNumber} is incomplete: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} blank.`
        );
        return;
      }

      if (!isExpectedVendorUrl(cells[0], config)) {
        issues.push(`Row ${rowNumber} URL is not a ${config.displayName} advertisement URL.`);
        return;
      }

      const fixedValueIssues = config.fields
        .map((field, fieldIndex) => ({
          actual: cells[fieldIndex],
          expected: config.fixedValues?.[field.key],
          field
        }))
        .filter(({ actual, expected }) => expected && actual !== expected);
      if (fixedValueIssues.length) {
        const { actual, expected, field } = fixedValueIssues[0];
        issues.push(
          `Row ${rowNumber} ${field.key} must be exactly ${expected}; received ${actual}.`
        );
        return;
      }
      rows.push(cells);
    });

    if (issues.length) {
      const shown = issues.slice(0, 5).join(" ");
      const remaining =
        issues.length > 5 ? ` ${issues.length - 5} more row issues were found.` : "";
      throw new Error(
        `${shown}${remaining} Jenkins was not prepared because every field must contain the same number of complete lines.`
      );
    }

    const fields = {};
    const columns = config.fields.map((field, fieldIndex) => {
      const values = rows.map((row) => row[fieldIndex]);
      const valueText = values.join("\n");
      fields[field.key] = valueText;
      return Object.freeze({
        ...field,
        lineCount: values.length,
        value: valueText
      });
    });

    const lineCounts = new Set(columns.map((column) => column.lineCount));
    if (lineCounts.size !== 1 || !lineCounts.has(rows.length)) {
      throw new Error(
        "Jenkins was not prepared because the generated fields do not contain equal line counts."
      );
    }

    return Object.freeze({
      columns: Object.freeze(columns),
      displayName: config.displayName,
      fields: Object.freeze(fields),
      rowCount: rows.length,
      type: String(type).toLowerCase()
    });
  };

  return Object.freeze({
    TYPE_CONFIG,
    cleanCell,
    parseBatch
  });
})();
