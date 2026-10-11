globalThis.LunaXlsxExportCore = (() => {
  const encoder = new TextEncoder();
  const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  const crc32 = (bytes) => {
    let value = 0xffffffff;
    bytes.forEach((byte) => {
      value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
    });
    return (value ^ 0xffffffff) >>> 0;
  };
  const u16 = (value) => Uint8Array.of(value & 255, (value >>> 8) & 255);
  const u32 = (value) =>
    Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
  const join = (parts) => {
    const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    parts.forEach((part) => {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  };
  const xml = (value) =>
    String(value ?? "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
      .replace(
        /[<>&"']/g,
        (character) =>
          ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]
      );
  const col = (index) => {
    let result = "";
    for (let value = index + 1; value; value = Math.floor((value - 1) / 26))
      result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
    return result;
  };
  const dateSerial = (key) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ""))) return null;
    const [year, month, day] = key.split("-").map(Number);
    const date = Date.UTC(year, month - 1, day);
    return new Date(date).toISOString().slice(0, 10) === key
      ? (date - Date.UTC(1899, 11, 30)) / 86400000
      : null;
  };
  const C = (value, style = 5, formula = "") => ({ value, style, formula });
  const formatCell = (item, ref) => {
    if (!item || item.value === null || typeof item.value === "undefined") return "";
    const style = Number(item.style) || 0;
    if (item.formula)
      return `<c r="${ref}" s="${style}"><f>${xml(item.formula.replace(/^=/, ""))}</f><v>${Number(item.value)}</v></c>`;
    if (typeof item.value === "number" && Number.isFinite(item.value))
      return `<c r="${ref}" s="${style}"><v>${item.value}</v></c>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(item.value)}</t></is></c>`;
  };
  const sheetXml = ({ rows, widths, freeze, filter, validations = [], alertRange = "" }) => {
    if (rows.length > 1048576) throw new Error("The report exceeds Excel's worksheet row limit.");
    const paneName = freeze?.col ? "bottomRight" : "bottomLeft";
    const pane = freeze
      ? `<pane xSplit="${freeze.col || 0}" ySplit="${freeze.row || 0}" topLeftCell="${col(freeze.col || 0)}${(freeze.row || 0) + 1}" activePane="${paneName}" state="frozen"/><selection pane="${paneName}" activeCell="${col(freeze.col || 0)}${(freeze.row || 0) + 1}" sqref="${col(freeze.col || 0)}${(freeze.row || 0) + 1}"/>`
      : "";
    const cols = widths
      .map(
        (width, index) =>
          `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
      )
      .join("");
    const data = rows
      .map(
        (row, index) =>
          `<row r="${index + 1}" ht="20" customHeight="1">${(row || []).map((item, column) => formatCell(item, `${col(column)}${index + 1}`)).join("")}</row>`
      )
      .join("");
    const autoFilter = filter ? `<autoFilter ref="${filter}"/>` : "";
    const conditional = alertRange
      ? `<conditionalFormatting sqref="${alertRange}"><cfRule type="cellIs" dxfId="0" priority="1" operator="notEqual"><formula>0</formula></cfRule></conditionalFormatting>`
      : "";
    const validationXml = validations.length
      ? `<dataValidations count="${validations.length}">${validations.map(({ cell, name }) => `<dataValidation type="list" allowBlank="0" showErrorMessage="1" sqref="${cell}"><formula1>${name}</formula1></dataValidation>`).join("")}</dataValidations>`
      : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${col(Math.max(0, widths.length - 1))}${Math.max(1, rows.length)}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${cols}</cols><sheetData>${data}</sheetData>${autoFilter}${conditional}${validationXml}</worksheet>`;
  };
  const zip = (entries) => {
    let offset = 0;
    const locals = [];
    const centrals = [];
    entries.forEach(({ name, text }) => {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(text);
      const crc = crc32(data);
      if (data.length > 0xffffffff || offset + data.length > 0xffffffff)
        throw new Error("The report exceeds the supported XLSX size.");
      const local = join([
        u32(0x04034b50),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        nameBytes,
        data
      ]);
      locals.push(local);
      centrals.push(
        join([
          u32(0x02014b50),
          u16(20),
          u16(20),
          u16(0),
          u16(0),
          u16(0),
          u16(0),
          u32(crc),
          u32(data.length),
          u32(data.length),
          u16(nameBytes.length),
          u16(0),
          u16(0),
          u16(0),
          u16(0),
          u32(0),
          u32(offset),
          nameBytes
        ])
      );
      offset += local.length;
    });
    const central = join(centrals);
    return join([
      ...locals,
      central,
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(entries.length),
      u16(entries.length),
      u32(central.length),
      u32(offset),
      u16(0)
    ]);
  };
  const xf = (font, fill, numFmt = 0, align = "left") =>
    `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${align}" vertical="center"/></xf>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="#,##0"/><numFmt numFmtId="166" formatCode="0.0%"/><numFmt numFmtId="167" formatCode="0.0"/></numFmts><fonts count="5"><font><sz val="10"/><name val="Aptos"/><color rgb="FF233247"/></font><font><b/><sz val="14"/><name val="Aptos"/><color rgb="FF17324D"/></font><font><i/><sz val="10"/><name val="Aptos"/><color rgb="FF64748B"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FF17324D"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF1F8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17324D"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5F8FB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF1CB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1">${xf(0, 0)}</cellStyleXfs><cellXfs count="17">${xf(0, 0)}${xf(1, 0)}${xf(2, 0)}${xf(3, 2)}${xf(4, 3, 0, "center")}${xf(0, 0)}${xf(0, 4)}${xf(0, 0, 165, "right")}${xf(0, 4, 165, "right")}${xf(0, 0, 164, "right")}${xf(0, 4, 164, "right")}${xf(0, 0, 166, "right")}${xf(0, 4, 166, "right")}${xf(3, 5)}${xf(0, 0, 167, "right")}${xf(0, 4, 167, "right")}${xf(2, 0)}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="1"><dxf><font><color rgb="FFB42318"/><b/></font><fill><patternFill patternType="solid"><fgColor rgb="FFFFE1DE"/><bgColor indexed="64"/></patternFill></fill></dxf></dxfs></styleSheet>`;
  const dataSheet = (name, note, headers, values, types, widths, freezeCol = 1) => {
    const rows = [[], [C(name, 1)], [C(note, 2)], [], headers.map((value) => C(value, 4))];
    values.forEach((valuesRow, index) =>
      rows.push(
        valuesRow.map((value, column) => {
          const alternate = index % 2 === 1;
          const type = types[column];
          if (type === "date") return C(dateSerial(value) ?? value, alternate ? 10 : 9);
          if (type === "number") return C(value, alternate ? 8 : 7);
          if (type === "percent") return C(value, alternate ? 12 : 11);
          if (type === "decimal") return C(value, alternate ? 15 : 14);
          return C(value, alternate ? 6 : 5);
        })
      )
    );
    if (!values.length) rows.push([]);
    return {
      name,
      rows,
      widths,
      freeze: { row: 5, col: freezeCol },
      filter: `A5:${col(headers.length - 1)}${Math.max(6, rows.length)}`
    };
  };
  const sumWork = (rows, month) =>
    rows
      .filter((row) => row.month === month)
      .reduce(
        (totals, row) => {
          totals[row.outcome.toLowerCase()] += 1;
          return totals;
        },
        { listed: 0, unlisted: 0, auctions: 0 }
      );
  const sumInteractions = (rows, month) =>
    rows
      .filter((row) => row.month === month)
      .reduce(
        (totals, row) => {
          totals[row.channel.toLowerCase()] += row.count;
          return totals;
        },
        { inbound: 0, outbound: 0, chat: 0 }
      );
  const dashboard = (report, ends) => {
    const rows = Array.from({ length: 31 + report.months.length }, () => []);
    const put = (row, column, value, style = 5, formula = "") => {
      rows[row - 1][column - 1] = C(value, style, formula);
    };
    const agent = 'IF($B$5="All agents","*",$B$5)';
    const workMonth = 'IF($B$6="All available","*",$B$6)';
    const interactionMonth = 'IF($B$7="All time","*",$B$7)';
    const company = 'IF($B$8="Both companies","*",$B$8)';
    const workFormula = (outcome, monthCriterion = workMonth) =>
      `COUNTIFS('Work data'!$B$6:$B$${ends.work},${monthCriterion},'Work data'!$C$6:$C$${ends.work},${agent},'Work data'!$E$6:$E$${ends.work},"${outcome}")`;
    const interactionFormula = (channel, monthCriterion = interactionMonth) =>
      `SUMIFS('Interaction data'!$F$6:$F$${ends.interactions},'Interaction data'!$B$6:$B$${ends.interactions},${monthCriterion},'Interaction data'!$C$6:$C$${ends.interactions},${agent},'Interaction data'!$D$6:$D$${ends.interactions},${company},'Interaction data'!$E$6:$E$${ends.interactions},"${channel}")`;
    const recentFormula = (field) =>
      `SUMIFS('Recent tracker'!$${field}$6:$${field}$${ends.recent},'Recent tracker'!$A$6:$A$${ends.recent},"Last 30 days",'Recent tracker'!$D$6:$D$${ends.recent},${agent})`;
    const defaultWork = sumWork(report.work, report.defaultMonth);
    const defaultInteractionMonth = report.interactionMonths.includes(report.defaultMonth)
      ? report.defaultMonth
      : "All time";
    const defaultInteraction =
      defaultInteractionMonth === "All time"
        ? report.interactionRows.reduce(
            (value, row) => {
              value[row.channel.toLowerCase()] += row.count;
              return value;
            },
            { inbound: 0, outbound: 0, chat: 0 }
          )
        : sumInteractions(report.interactionRows, defaultInteractionMonth);
    const recent = report.recentWork.reduce(
      (value, row) => {
        value[row.outcome.toLowerCase()] += 1;
        return value;
      },
      { listed: 0, unlisted: 0, auctions: 0 }
    );
    put(2, 1, "Luna Sheet Statistics", 1);
    put(
      3,
      1,
      `Read-only snapshot generated ${String(report.generatedAt || "")
        .slice(0, 16)
        .replace("T", " ")} UAE`,
      2
    );
    [
      [5, "Agent", "All agents"],
      [6, "Work month", report.defaultMonth],
      [7, "Interaction month", defaultInteractionMonth],
      [8, "Interaction company", "Both companies"]
    ].forEach(([row, label, value]) => {
      put(row, 1, label, 3);
      put(row, 2, value, 13);
    });
    [
      [10, 1, "Monthly work"],
      [10, 4, "Interactions"],
      [18, 1, "Recent work: last 30 days"],
      [18, 4, "Source coverage"],
      [26, 1, "Available-month trend"]
    ].forEach(([row, column, title]) => put(row, column, title, 3));
    [
      [11, 1],
      [11, 4],
      [19, 1],
      [19, 4]
    ].forEach(([row, column]) => {
      put(row, column, "Metric", 4);
      put(row, column + 1, "Count", 4);
    });
    [
      [12, "Listed", defaultWork.listed, workFormula("Listed")],
      [13, "Unlisted", defaultWork.unlisted, workFormula("Unlisted")],
      [14, "Auctions", defaultWork.auctions, workFormula("Auctions")],
      [15, "Total work", defaultWork.listed + defaultWork.auctions, "B12+B14"]
    ].forEach(([row, label, value, formula]) => {
      put(row, 1, label);
      put(row, 2, value, 7, formula);
    });
    put(16, 1, "Total work is Listed + Auctions. Unlisted is always separate.", 16);
    [
      [12, "Inbound calls", defaultInteraction.inbound, interactionFormula("Inbound")],
      [13, "Outbound calls", defaultInteraction.outbound, interactionFormula("Outbound")],
      [14, "Chats", defaultInteraction.chat, interactionFormula("Chat")],
      [
        15,
        "Total interactions",
        defaultInteraction.inbound + defaultInteraction.outbound + defaultInteraction.chat,
        "SUM(E12:E14)"
      ]
    ].forEach(([row, label, value, formula]) => {
      put(row, 4, label);
      put(row, 5, value, 7, formula);
    });
    put(16, 4, "Interactions are not added to credited work.", 16);
    [
      [20, "Listed", recent.listed, recentFormula("E")],
      [21, "Unlisted", recent.unlisted, recentFormula("F")],
      [22, "Auctions", recent.auctions, recentFormula("G")],
      [23, "Total work", recent.listed + recent.auctions, "B20+B22"]
    ].forEach(([row, label, value, formula]) => {
      put(row, 1, label);
      put(row, 2, value, 7, formula);
    });
    const skipped = Object.values(report.audit.interactions.quality).reduce(
      (sum, value) => sum + (Number(value) || 0),
      0
    );
    [
      [20, "Work months", report.months.length],
      [21, "Recent days", 30],
      [22, "Interaction rows", report.audit.interactions.sourceRows],
      [23, "All-time exclusions", skipped]
    ].forEach(([row, label, value]) => {
      put(row, 4, label);
      put(row, 5, value, 7);
    });
    put(24, 1, "Total work excludes Unlisted. Excluded interaction reasons are in Audit.", 16);
    ["Month", "Listed", "Unlisted", "Auctions", "Total work", "Interactions"].forEach(
      (label, index) => put(27, index + 1, label, 4)
    );
    report.months.forEach((month, index) => {
      const row = 28 + index;
      const work = sumWork(report.work, month);
      const interactions = sumInteractions(report.interactionRows, month);
      put(row, 1, month, index % 2 ? 6 : 5);
      [
        [2, work.listed, workFormula("Listed", `$A${row}`)],
        [3, work.unlisted, workFormula("Unlisted", `$A${row}`)],
        [4, work.auctions, workFormula("Auctions", `$A${row}`)],
        [5, work.listed + work.auctions, `B${row}+D${row}`],
        [
          6,
          interactions.inbound + interactions.outbound + interactions.chat,
          `SUMIFS('Interaction data'!$F$6:$F$${ends.interactions},'Interaction data'!$B$6:$B$${ends.interactions},$A${row},'Interaction data'!$C$6:$C$${ends.interactions},${agent},'Interaction data'!$D$6:$D$${ends.interactions},${company})`
        ]
      ].forEach(([column, value, formula]) => put(row, column, value, index % 2 ? 8 : 7, formula));
    });
    put(
      29 + report.months.length,
      1,
      "Work months are limited to available tabs. Interaction history may extend farther back.",
      16
    );
    return {
      name: "Dashboard",
      rows,
      widths: [24, 21, 18, 25, 19, 20],
      validations: [
        { cell: "B5", name: "AgentChoices" },
        { cell: "B6", name: "WorkMonthChoices" },
        { cell: "B7", name: "InteractionMonthChoices" },
        { cell: "B8", name: "CompanyChoices" }
      ]
    };
  };
  const audit = (report, ends) => {
    const rows = [];
    const put = (row, column, value, style = 5, formula = "") => {
      while (rows.length < row) rows.push([]);
      rows[row - 1][column - 1] = C(value, style, formula);
    };
    put(2, 1, "Source audit and definitions", 1);
    put(
      3,
      1,
      "All reads are from Luna's approved read-only Sheet service. Source times can differ during download.",
      2
    );
    [
      "Month",
      "Source tab",
      "Read at (UAE)",
      "Source rows",
      "Listed",
      "Unlisted",
      "Auctions",
      "Total work",
      "Difference"
    ].forEach((name, index) => put(5, index + 1, name, 4));
    report.audit.monthSources.forEach((source, index) => {
      const row = index + 6;
      [
        source.month,
        source.tab,
        source.generatedAt,
        source.sourceRows,
        source.listed,
        source.unlisted,
        source.auctions
      ].forEach((value, column) => put(row, column + 1, value, column >= 3 ? 7 : 5));
      put(
        row,
        8,
        source.workTotal,
        7,
        `COUNTIFS('Work data'!$B$6:$B$${ends.work},A${row},'Work data'!$E$6:$E$${ends.work},"Listed")+COUNTIFS('Work data'!$B$6:$B$${ends.work},A${row},'Work data'!$E$6:$E$${ends.work},"Auctions")`
      );
      put(row, 9, 0, 7, `H${row}-SUM(E${row},G${row})`);
    });
    let current = 8 + report.audit.monthSources.length;
    put(current, 1, "Recent work source", 3);
    [
      ["Range", `${report.audit.recent.rangeStart} to ${report.audit.recent.rangeEnd}`],
      ["Read at (UAE)", report.audit.recent.generatedAt],
      ["Accepted source rows", report.audit.recent.sourceRows],
      ["Listed", report.audit.recent.listed],
      ["Unlisted", report.audit.recent.unlisted],
      ["Auctions", report.audit.recent.auctions]
    ].forEach(([label, value], index) => {
      put(current + 1 + index, 1, label);
      put(current + 1 + index, 2, value, typeof value === "number" ? 7 : 5);
    });
    current += 9;
    put(current, 1, "Daily interactions source", 3);
    [
      ["Range", `${report.audit.interactions.rangeStart} to ${report.audit.interactions.rangeEnd}`],
      ["Read at (UAE)", report.audit.interactions.generatedAt],
      ["Accepted source rows", report.audit.interactions.sourceRows],
      ["Grouped source rows", report.audit.interactions.groupedRows],
      ["Detail count", report.audit.interactions.total]
    ].forEach(([label, value], index) => {
      put(current + 1 + index, 1, label);
      put(current + 1 + index, 2, value, typeof value === "number" ? 7 : 5);
    });
    put(current + 6, 1, "Interaction difference");
    put(
      current + 6,
      2,
      0,
      7,
      `SUM('Interaction data'!$F$6:$F$${ends.interactions})-B${current + 3}`
    );
    current += 9;
    put(current, 1, "Excluded rows by source and reason", 3);
    ["Source", "Reason", "Rows"].forEach((value, index) => put(current + 1, index + 1, value, 4));
    const qualitySources = [
      ...report.audit.monthSources.map((item) => ({ name: item.month, quality: item.quality })),
      { name: "Recent 30 days", quality: report.audit.recent.quality },
      { name: "Daily interactions", quality: report.audit.interactions.quality }
    ];
    let qualityRow = current + 2;
    const qualityLabels = {
      skippedFutureDate: "Future date",
      skippedInvalidDate: "Invalid or blank date",
      skippedNoAgent: "Missing agent",
      skippedUnknownChannel: "Unrecognized interaction type",
      skippedUnknownSource: "Unrecognized company",
      skippedOutsideRange: "Outside source period",
      skippedNoWork: "No work value",
      skippedNoAuctionConfirmation: "Auction without confirmation link"
    };
    qualitySources.forEach((source) =>
      Object.entries(source.quality).forEach(([reason, count]) => {
        put(qualityRow, 1, source.name);
        put(qualityRow, 2, qualityLabels[reason] || reason);
        put(qualityRow, 3, Number(count) || 0, 7);
        qualityRow += 1;
      })
    );
    current = qualityRow + 2;
    put(current, 1, "Definitions", 3);
    [
      ["Total work", "Listed plus confirmed Auctions. Unlisted stays visible but adds no credit."],
      ["Recent total work", "Listed plus Auctions in the 30-day window. Unlisted is separate."],
      ["Active work day", "A date with at least one Listed or Auctions item."],
      ["Interaction", "One accepted Sheet row; grouped detail retains its count."],
      [
        "Monthly activity index",
        "Average of work / month's highest work and interactions / month's highest interactions, scaled to 100. If a whole stream has no activity, use the other stream alone."
      ],
      [
        "Monthly rank",
        "Descending activity index; ties use credited work, then interaction total, then agent name. Activity is not a quality or outcome measure."
      ],
      [
        "Ranking scope",
        "Only months with available work tabs. Unlisted is shown in the summary but does not increase the index."
      ],
      ["Missing source", "No zero is inferred for a month without an available work tab."],
      [
        "Dashboard filters",
        "Selectors recalculate dashboard figures in Excel; table filters affect their own sheets only."
      ]
    ].forEach(([name, meaning], index) => {
      put(current + 1 + index, 1, name);
      put(current + 1 + index, 2, meaning);
    });
    ["Agent choices", "Work month choices", "Interaction month choices", "Company choices"].forEach(
      (value, index) => put(5, 11 + index, value, 4)
    );
    const lists = [
      ["All agents", ...report.agents],
      ["All available", ...report.months],
      ["All time", ...report.interactionMonths],
      ["Both companies", "Ayshei", "Other source"]
    ];
    lists.forEach((values, index) =>
      values.forEach((value, offset) => put(6 + offset, 11 + index, value))
    );
    return {
      sheet: {
        name: "Audit",
        rows,
        widths: [26, 58, 27, 15, 14, 14, 14, 17, 15, 3, 28, 23, 25, 20],
        freeze: { row: 5, col: 0 },
        alertRange: `I6:I${5 + report.audit.monthSources.length}`
      },
      lists: lists.map(
        (list, index) => `'Audit'!$${col(10 + index)}$6:$${col(10 + index)}$${5 + list.length}`
      )
    };
  };
  const buildWorkbook = (report) => {
    if (
      !report?.months?.length ||
      !report.audit ||
      !Array.isArray(report.interactionRows) ||
      !Array.isArray(report.leaderboard)
    )
      throw new Error("The Sheet Statistics report is incomplete.");
    const ends = {
      work: Math.max(6, 5 + report.work.length),
      interactions: Math.max(6, 5 + report.interactionRows.length),
      recent: Math.max(6, 5 + report.recentRows.length)
    };
    const workTotalByMonth = new Map(
      report.months.map((month) => [
        month,
        report.work.filter((item) => item.month === month && item.credit).length
      ])
    );
    const sheets = [
      dashboard(report, ends),
      dataSheet(
        "Monthly leaderboard",
        "Filter Month to see 1st, 2nd and onward. Balanced activity index uses credited work and interactions; it is not a quality score.",
        [
          "Month",
          "Rank",
          "Agent",
          "Activity index",
          "Work index",
          "Interaction index",
          "Listed",
          "Unlisted",
          "Auctions",
          "Total work",
          "Inbound",
          "Outbound",
          "Chats",
          "Interactions",
          "Active work days",
          "Activity summary"
        ],
        report.leaderboard.map((row) => [
          row.month,
          row.rank,
          row.agent,
          row.activityIndex,
          row.workIndex,
          row.interactionIndex,
          row.listed,
          row.unlisted,
          row.auctions,
          row.workTotal,
          row.inbound,
          row.outbound,
          row.chat,
          row.total,
          row.activeDays,
          row.summary
        ]),
        [
          "text",
          "number",
          "text",
          "decimal",
          "decimal",
          "decimal",
          "number",
          "number",
          "number",
          "number",
          "number",
          "number",
          "number",
          "number",
          "number",
          "text"
        ],
        [14, 10, 26, 18, 16, 20, 13, 13, 13, 18, 13, 13, 13, 18, 20, 80],
        3
      ),
      dataSheet(
        "Agent months",
        "Monthly work only. Use Interaction agents for calls and chats. Filter Agent or Month to explore.",
        [
          "Month",
          "Agent",
          "Listed",
          "Unlisted",
          "Auctions",
          "Total work",
          "Active work days",
          "Avg / active day",
          "Share of month",
          "Best work day",
          "Best-day work"
        ],
        report.monthlyAgents.map((row) => [
          row.month,
          row.agent,
          row.listed,
          row.unlisted,
          row.auctions,
          row.workTotal,
          row.activeDays,
          row.average,
          workTotalByMonth.get(row.month) ? row.workTotal / workTotalByMonth.get(row.month) : 0,
          row.bestDay,
          row.bestDayWork
        ]),
        [
          "text",
          "text",
          "number",
          "number",
          "number",
          "number",
          "number",
          "decimal",
          "percent",
          "date",
          "number"
        ],
        [14, 25, 13, 13, 13, 18, 19, 19, 19, 17, 17],
        2
      ),
      dataSheet(
        "Daily work",
        "One row per agent and recorded work date across available monthly tabs.",
        ["Date", "Month", "Agent", "Listed", "Unlisted", "Auctions", "Total work"],
        report.dailyWork.map((row) => [
          row.date,
          row.month,
          row.agent,
          row.listed,
          row.unlisted,
          row.auctions,
          row.workTotal
        ]),
        ["date", "text", "text", "number", "number", "number", "number"],
        [17, 14, 26, 14, 14, 14, 18],
        3
      ),
      dataSheet(
        "Vendors",
        "Monthly and recent vendor counts are separate scopes; filter Scope before comparing.",
        ["Scope", "Period", "Vendor", "Agent", "Listed", "Unlisted", "Auctions", "Total work"],
        report.vendors.map((row) => [
          row.scope,
          row.period,
          row.vendor,
          row.agent,
          row.listed,
          row.unlisted,
          row.auctions,
          row.workTotal
        ]),
        ["text", "text", "text", "text", "number", "number", "number", "number"],
        [20, 26, 30, 25, 13, 13, 13, 18],
        4
      ),
      dataSheet(
        "Recent tracker",
        "As-of UAE date shown in Start and End. Total work is Listed + Auctions; Unlisted is separate.",
        ["Period", "Start", "End", "Agent", "Listed", "Unlisted", "Auctions", "Total work"],
        report.recentRows.map((row) => [
          row.period,
          row.start,
          row.end,
          row.agent,
          row.listed,
          row.unlisted,
          row.auctions,
          row.workTotal
        ]),
        ["text", "date", "date", "text", "number", "number", "number", "number"],
        [20, 17, 17, 26, 13, 13, 13, 18],
        4
      ),
      dataSheet(
        "Interaction agents",
        "Monthly interaction counts by agent and company. These are not work credits.",
        ["Month", "Agent", "Company", "Inbound", "Outbound", "Chats", "Total interactions"],
        report.interactionAgents.map((row) => [
          row.month,
          row.agent,
          row.company,
          row.inbound,
          row.outbound,
          row.chat,
          row.total
        ]),
        ["text", "text", "text", "number", "number", "number", "number"],
        [14, 26, 21, 14, 14, 14, 21],
        2
      ),
      dataSheet(
        "Interaction daily",
        "Daily interaction counts by agent and company. Use filters to inspect a date or source.",
        ["Date", "Agent", "Company", "Inbound", "Outbound", "Chats", "Total interactions"],
        report.interactionDaily.map((row) => [
          row.date,
          row.agent,
          row.company,
          row.inbound,
          row.outbound,
          row.chat,
          row.total
        ]),
        ["date", "text", "text", "number", "number", "number", "number"],
        [17, 26, 21, 14, 14, 14, 21],
        2
      ),
      dataSheet(
        "Work data",
        "One row per recorded listed, unlisted, or confirmed Auctions item from available monthly tabs.",
        [
          "Date",
          "Month",
          "Agent",
          "Vendor",
          "Outcome",
          "Unlisted reason",
          "Work credit",
          "Tracker event"
        ],
        report.work.map((row) => [
          row.date,
          row.month,
          row.agent,
          row.vendor,
          row.outcome,
          row.reason,
          row.credit,
          1
        ]),
        ["date", "text", "text", "text", "text", "text", "number", "number"],
        [17, 14, 26, 30, 16, 38, 16, 18],
        3
      ),
      dataSheet(
        "Interaction data",
        "Privacy-limited grouped rows from Daily interactions: date, agent, company, type, and count only.",
        ["Date", "Month", "Agent", "Company", "Type", "Count"],
        report.interactionRows.map((row) => [
          row.date,
          row.month,
          row.agent,
          row.company,
          row.channel,
          row.count
        ]),
        ["date", "text", "text", "text", "text", "number"],
        [17, 14, 26, 21, 16, 14],
        3
      )
    ];
    const auditResult = audit(report, ends);
    sheets.push(auditResult.sheet);
    const names = sheets.map((sheet) => sheet.name);
    const definedNames = [
      "AgentChoices",
      "WorkMonthChoices",
      "InteractionMonthChoices",
      "CompanyChoices"
    ]
      .map(
        (name, index) =>
          `<definedName name="${name}">${xml(auditResult.lists[index])}</definedName>`
      )
      .join("");
    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets><definedNames>${definedNames}</definedNames><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
    const entries = [
      { name: "[Content_Types].xml", text: contentTypes },
      {
        name: "_rels/.rels",
        text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
      },
      { name: "xl/workbook.xml", text: workbookXml },
      {
        name: "xl/_rels/workbook.xml.rels",
        text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
      },
      { name: "xl/styles.xml", text: styles },
      ...sheets.map((sheet, index) => ({
        name: `xl/worksheets/sheet${index + 1}.xml`,
        text: sheetXml(sheet)
      }))
    ];
    return new Blob([zip(entries)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  };
  return Object.freeze({ buildWorkbook });
})();
