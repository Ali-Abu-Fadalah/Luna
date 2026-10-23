globalThis.LunaAuctionCore = (() => {
  const clean = (value) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  const key = (value) =>
    clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const missing = (value) => !clean(value) || /^(?:n\/?a|null|none|-)$/i.test(clean(value));
  const aliases = {
    title: ["modeltitle", "modelandtitle", "listingname", "title"],
    brand: ["brand"],
    category: ["category"],
    condition: ["condition", "contion"],
    startPrice: ["startprice", "initialprice"],
    reservePrice: ["reserveprice"],
    startDate: ["startdate"],
    endDate: ["enddate"],
    tamara: ["tamara", "tamaray"],
    photosUrl: ["descalephotoes", "descalephotos", "dscalephotos"],
    descriptionUrl: ["description"],
    serial: ["srno", "serial", "no"]
  };
  const safeUrl = (value) => {
    try {
      const url = new URL(clean(value));
      if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
      return url.href;
    } catch {
      return "";
    }
  };
  const parseTSV = (text) => {
    const rows = [];
    let row = [],
      cell = "",
      quoted = false;
    const input = String(text).replace(/\r\n?/g, "\n");
    for (let index = 0; index < input.length; index++) {
      const char = input[index];
      if (char === '"') {
        if (quoted && input[index + 1] === '"') {
          cell += '"';
          index++;
        } else if (quoted || !cell) quoted = !quoted;
        else cell += char;
      } else if (!quoted && (char === "\t" || char === "\n")) {
        row.push(cell);
        cell = "";
        if (char === "\n") {
          rows.push(row);
          row = [];
        }
      } else cell += char;
    }
    if (quoted)
      throw new Error(
        "The pasted sheet has an unfinished quoted cell. Copy the complete rows again."
      );
    row.push(cell);
    if (row.some((value) => clean(value))) rows.push(row);
    return rows;
  };
  const cellValue = (cell) => {
    if (cell && typeof cell === "object")
      return { text: String(cell.text ?? ""), url: safeUrl(cell.url) };
    const text = String(cell ?? ""),
      link = text.trim().match(/^\[([\s\S]*)\]\((https:\/\/[^\s]+)\)$/);
    if (link && safeUrl(link[2])) return { text: link[1], url: safeUrl(link[2]) };
    return { text, url: "" };
  };
  const parseTable = (text) => {
    const lines = String(text).trim().split(/\r?\n/);
    if (!text.includes("\t") && lines.every((line) => /^\s*\|.*\|\s*$/.test(line)))
      return lines
        .map((line) =>
          line
            .trim()
            .slice(1, -1)
            .split(/(?<!\\)\|/)
            .map((cell) => {
              const value = cell.trim().replace(/\\\|/g, "|");
              return value.replace(/^(\*{1,3}|_{1,3})([\s\S]+)\1$/, "$2");
            })
        )
        .filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell)));
    return parseTSV(text);
  };
  const parseDate = (value, format = "strict", yearForMissing = new Date().getFullYear()) => {
    let text = clean(value).replace(/(\d)(?:st|nd|rd|th)\b/gi, "$1");
    if (missing(text)) return "";
    // A copied date may include a displayed time. The auction's PM rule is
    // applied later; never let that display text shift or obscure the date.
    const time = text.match(/(?:\s+|T)(\d{1,2})(?::(\d{2})(?::(\d{2}))?)?\s*(AM|PM)?$/i);
    if (time && (time[2] !== undefined || time[4])) {
      const hour = Number(time[1]);
      if (
        hour > (time[4] ? 12 : 23) ||
        (time[4] && hour < 1) ||
        Number(time[2] || 0) > 59 ||
        Number(time[3] || 0) > 59
      )
        throw new Error(`Invalid date time: ${text}`);
      text = text.slice(0, time.index).trim();
    }
    let year, month, day, match;
    if (/^\d{5}(?:\.\d+)?$/.test(text)) {
      const serial = Number(text),
        date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
      return parseDate(date.toISOString().slice(0, 10));
    }
    if ((match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [, year, month, day] = match;
    else if (
      (match = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/)) &&
      (["dmy", "mdy"].includes(format) || Number(match[1]) > 12 !== Number(match[2]) > 12)
    ) {
      const order = ["dmy", "mdy"].includes(format)
        ? format
        : Number(match[1]) > 12
          ? "dmy"
          : "mdy";
      year = match[3] || yearForMissing;
      month = order === "dmy" ? match[2] : match[1];
      day = order === "dmy" ? match[1] : match[2];
    } else if ((match = text.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})(?:[ ,-]+(\d{4}))?$/))) {
      day = match[1];
      year = match[3] || yearForMissing;
      month =
        [
          "jan",
          "feb",
          "mar",
          "apr",
          "may",
          "jun",
          "jul",
          "aug",
          "sep",
          "oct",
          "nov",
          "dec"
        ].indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
    } else
      throw new Error(
        `Date “${text}” needs YYYY-MM-DD, a named month, or an explicitly chosen day/month format.`
      );
    year = Number(year);
    month = Number(month);
    day = Number(day);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      year < 2020 ||
      year > 2100 ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    )
      throw new Error(`Invalid date: ${text}`);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const money = (value) => {
    const text = clean(value)
      .replace(/^AED\s*/i, "")
      .replace(/\s*AED$/i, "");
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text))
      throw new Error(
        `Invalid price: “${clean(value)}”. Use an AED amount with at most two decimals.`
      );
    const [whole, decimal = ""] = text.replaceAll(",", "").split(".");
    const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000000)
      throw new Error("Price must be a positive, valid AED amount.");
    return (
      String(Math.floor(cents / 100)) +
      (cents % 100 ? `.${String(cents % 100).padStart(2, "0")}` : "")
    );
  };
  const startTime = (date) =>
    new Date(`${parseDate(date)}T12:00:00Z`).getUTCDay() === 6 ? "10:00" : "9:00";
  const fingerprint = (row) =>
    JSON.stringify([
      row.title,
      row.brand,
      row.category,
      row.condition,
      row.startPrice,
      row.reservePrice,
      row.startDate,
      row.endDate,
      row.tamara,
      row.photosUrl,
      row.description,
      row.categoryPath,
      row.capture?.images,
      row.imagesImported,
      row.importedCount,
      row.mainImage
    ]);
  // Column names only: no workbook rows or private links are bundled in Luna.
  const full24 = [
    "Sr. No.",
    "Vendor Name",
    "Category",
    "Brand",
    "Tag",
    "Warranty",
    "Model - Title",
    "Ayshei Link",
    "Product ID",
    "Description",
    "Year",
    "Start Price",
    "Reserve Price",
    "Buy Now Price",
    "With 5% VAT",
    "Threshold",
    "Tamara",
    "Condition",
    "link photos",
    "Start Date",
    "End Date",
    "Duration",
    "Payment",
    "Descale Photoes"
  ];
  const full25 = [...full24.slice(0, 7), "Gold Weight", ...full24.slice(7)];
  const layouts = Object.freeze({
    sheet24: full24,
    sheet25: full25,
    visible24: full24.filter((_, i) => ![5, 13, 14].includes(i)),
    visible25: full25.filter((_, i) => ![14, 15].includes(i))
  });
  // Observed column positions across the reference workbook, including its
  // hidden-column variants. Only column metadata is bundled, never source rows.
  // Each tuple is: width, title, brand, category, start price, reserve price,
  // condition, start date, end date, Tamara, Descale Photoes, Description.
  // -1 means the column is absent. In particular, Photos/link photos never
  // becomes Descale Photoes when headers identify it as a different source.
  const workbookColumns = [
    [24, 6, 3, 2, 11, 12, 17, 19, 20, 16, 23, 9],
    [21, 5, 3, 2, 10, 11, 14, 16, 17, 13, 20, 8],
    [25, 6, 3, 2, 12, 13, 18, 20, 21, 17, 24, 10],
    [23, 6, 3, 2, 12, 13, 16, 18, 19, 15, 22, 10],
    [24, 5, 3, 2, 11, 12, 17, 19, 20, 16, 23, 9],
    [25, 6, 3, 2, 12, 13, 18, 20, 21, 17, -1, 10],
    [24, 6, 3, 2, 12, 13, 17, 19, 20, -1, -1, 10],
    [26, 6, 3, 2, 12, 13, 18, 20, 21, 17, 24, 10],
    [25, 6, 3, 2, 11, 12, 17, 19, 20, 16, 23, 9],
    [23, 6, 3, 2, 11, 12, 16, 18, 19, -1, -1, 9],
    [24, 6, 3, 2, 11, 12, 16, 18, 19, -1, -1, 9],
    [26, 7, 4, 2, 13, 14, 18, 20, 21, -1, 24, [10, 11]],
    [22, 6, 3, 2, 11, 12, 15, 17, 18, -1, -1, 9],
    [26, 7, 4, 2, 12, 13, 17, 19, 20, -1, 24, 10],
    [25, 7, 4, 2, 12, 13, 16, 18, 19, -1, 23, 10],
    [23, 6, 4, 2, 11, 12, 15, 17, 18, -1, 21, 9],
    [22, 7, 4, 2, 12, 13, 16, 18, 19, -1, -1, 10],
    [21, 7, 4, 2, 11, 12, 15, 17, 18, -1, -1, 9],
    [21, 6, 3, 2, 11, 12, 15, 17, 18, -1, -1, 9],
    [20, 7, 4, 2, 10, 11, 14, 16, 17, -1, -1, 8],
    [21, 7, 4, 2, 10, 11, 14, 16, 17, -1, -1, 8],
    [22, 7, 4, 2, 10, 11, 14, 16, 17, -1, -1, 8],
    [22, 8, 4, 2, 11, 12, 15, 17, 18, -1, -1, 9],
    [22, 7, 4, 2, 11, 12, 15, 17, 18, -1, -1, 9],
    [24, 7, 4, 2, 10, 11, 14, 16, 17, -1, -1, 8],
    [29, 7, 4, 2, 10, 11, 14, 16, 17, -1, -1, 8],
    [23, 7, 4, 2, 10, 11, 14, 16, 17, -1, -1, 8],
    [22, 7, 4, 2, 10, 11, 13, 15, 16, -1, -1, 8],
    [20, 7, 4, 2, 10, 11, 13, 15, 16, -1, -1, 8],
    [19, 6, 4, 2, 9, 10, 12, 14, 15, -1, -1, 7],
    [18, 5, 4, 2, 8, 9, 11, 13, 14, -1, -1, 6],
    [17, 5, 4, 2, 7, 8, 10, 12, 13, -1, -1, -1],
    [17, 5, 4, 2, 8, 9, 11, 13, 14, -1, -1, 6]
  ];
  const profileFields = [
    "title",
    "brand",
    "category",
    "startPrice",
    "reservePrice",
    "condition",
    "startDate",
    "endDate",
    "tamara",
    "photosUrl",
    "descriptionUrl"
  ];
  const workbookLayouts = workbookColumns.map(([width, ...indexes]) => {
    const headers = Array(width).fill("");
    headers[0] = "Sr. No.";
    indexes.forEach((index, field) => {
      for (const position of Array.isArray(index) ? index : [index])
        if (position >= 0) headers[position] = aliases[profileFields[field]][0];
    });
    return headers;
  });
  const columnMap = (cells) => {
    const headers = cells.map((cell) => key(cellValue(cell).text));
    return Object.fromEntries(
      Object.entries(aliases).map(([field, names]) => {
        const indexes = headers.flatMap((header, index) =>
          names.includes(header) || (field === "tamara" && header.startsWith("tamara"))
            ? [index]
            : []
        );
        if (indexes.length > 1 && field !== "descriptionUrl")
          throw new Error(
            `More than one ${field} column was found. Keep one header for each field.`
          );
        return [field, field === "descriptionUrl" ? indexes : (indexes[0] ?? -1)];
      })
    );
  };
  const conditionKeys = new Set([
    "new",
    "newwithtags",
    "newwithouttags",
    "verygood",
    "good",
    "satisfactory",
    "used",
    "refurbished",
    "openbox",
    "preowned"
  ]);
  const sharePointFolder = (cell) => {
    const url = safeUrl(cell?.url || cell?.text);
    if (!url) return "";
    const parsed = new URL(url);
    return /^[a-z0-9-]+\.sharepoint\.com$/i.test(parsed.hostname) &&
      (/\/:f:\//i.test(parsed.pathname) ||
        /\/_layouts\/15\/onedrive\.aspx$/i.test(parsed.pathname) ||
        /\/folders?(?:\/|$)/i.test(parsed.pathname))
      ? url
      : "";
  };
  const inferredColumns = (headers, method, review = []) => {
    headers.importMethod = method;
    headers.reviewColumns = review;
    return headers;
  };
  // Known layouts are evidence for each individual field, not an all-or-nothing
  // choice. Gold tabs, for example, agree on every amount but disagree on the
  // name of their last photo column. Preserve the amounts and isolate that doubt.
  const consensusHeaders = (candidates, width) => {
    const maps = candidates.map(columnMap),
      headers = Array(width).fill(""),
      review = [];
    for (const field of Object.keys(aliases)) {
      const values = [
        ...new Map(maps.map((map) => [JSON.stringify(map[field]), map[field]])).values()
      ];
      if (values.length === 1) {
        for (const index of Array.isArray(values[0]) ? values[0] : [values[0]])
          if (index >= 0) headers[index] = aliases[field][0];
      } else {
        const columns = [
          ...new Set(values.flatMap((value) => (Array.isArray(value) ? value : [value])))
        ].filter((index) => index >= 0);
        review.push({
          field,
          columns,
          reason:
            field === "photosUrl"
              ? "The hidden header could be Descale Photoes or Photos. Choose the intended folder source."
              : "The possible sheet layouts disagree on this field. Choose its source cell or enter the value."
        });
      }
    }
    return inferredColumns(
      headers,
      candidates.length === 1 ? "catalog" : "catalog-consensus",
      review
    );
  };
  // For unfamiliar rows, recover only typed anchors. In particular, a group of
  // positive numbers cannot tell us which is Start Price, Reserve or Threshold.
  const anchorHeaders = (cells, format, year) => {
    const headers = Array(cells.length).fill(""),
      review = [],
      text = (index) => clean(cells[index]?.text),
      url = (index) => safeUrl(cells[index]?.url || text(index)),
      put = (field, index) => {
        if (index >= 0) headers[index] = aliases[field][0];
      };
    const conditions = cells.flatMap((cell, index) =>
      conditionKeys.has(key(cell.text)) ? [index] : []
    );
    if (conditions.length === 1) put("condition", conditions[0]);
    const durationIndex = cells.findIndex((cell) =>
      /^\d+(?:\.\d+)?\s*(?:hours?|days?)$/i.test(clean(cell.text))
    );
    if (durationIndex >= 2) {
      try {
        const start = parseDate(text(durationIndex - 2), format, year),
          end = parseDate(text(durationIndex - 1), format, year);
        if (start && end) {
          put("startDate", durationIndex - 2);
          put("endDate", durationIndex - 1);
        }
      } catch {
        const dateLike = (value) =>
          /^\d{4}-\d{2}-\d{2}|^\d{1,2}(?:st|nd|rd|th)?[ /-](?:\d{1,2}|[A-Za-z]{3,9})/.test(value);
        if (dateLike(text(durationIndex - 2)) && dateLike(text(durationIndex - 1))) {
          put("startDate", durationIndex - 2);
          put("endDate", durationIndex - 1);
        }
      }
    }
    const listing = cells.findIndex((_, index) => {
      const link = url(index);
      return (
        link &&
        new URL(link).hostname === "marketplace.example.invalid" &&
        /^\/auctions\/detail\//.test(new URL(link).pathname)
      );
    });
    if (listing > 0) {
      let titleIndex = listing - 1;
      while (
        titleIndex >= 0 &&
        (missing(text(titleIndex)) || /^\d+(?:\.\d+)?$/.test(text(titleIndex)))
      )
        titleIndex--;
      if (
        titleIndex >= 0 &&
        listing - titleIndex <= 2 &&
        !url(titleIndex) &&
        /\p{L}/u.test(text(titleIndex))
      )
        put("title", titleIndex);
    }
    if (/^\d+$/.test(text(0))) put("serial", 0);
    const numericColumns = cells.flatMap((cell, index) => {
      if (index === 0 || (conditions.length === 1 && index >= conditions[0]) || url(index))
        return [];
      try {
        money(cell.text);
        return [index];
      } catch {
        return [];
      }
    });
    for (const field of ["startPrice", "reservePrice"])
      review.push({
        field,
        columns: numericColumns,
        reason:
          "Several amounts have no visible column names. Choose the exact price cell; Luna will not guess an amount."
      });
    const map = columnMap(headers);
    if (map.title < 0 && map.condition < 0 && map.startDate < 0) return null;
    return inferredColumns(headers, "anchors", review);
  };
  const inferHeaders = (table, format, { layout, savedHeaders, year }) => {
    const populated = table.filter((row) => row.some((cell) => clean(cell.text) || cell.url));
    const width = Math.max(...table.map((row) => row.length));
    const usedWidth = Math.max(
      ...table.map((row) =>
        row.reduce((last, cell, index) => (clean(cell.text) || cell.url ? index + 1 : last), 0)
      )
    );
    const fits = (headers) =>
      Array.isArray(headers) && headers.length >= usedWidth && headers.length <= width;
    if (layout === "saved" || layouts[layout]) {
      const headers = layout === "saved" ? savedHeaders : layouts[layout];
      if (!fits(headers))
        throw new Error(
          "The selected layout does not fit these rows. Use Columns: Auto or include the headers."
        );
      return inferredColumns(
        [...headers],
        layout === "saved" ? "saved-headers" : "selected-layout"
      );
    }
    const compatible = (headers, structural = false) => {
      const map = columnMap(headers);
      const get = (row, name) => row[map[name]] || { text: "", url: "" };
      return populated.every((row) => {
        const price = (name, reserve = false) => {
          const text = clean(get(row, name).text);
          if (missing(text)) return reserve;
          if (reserve && /^no\s+reserve$/i.test(text)) return true;
          try {
            money(text);
            return true;
          } catch {
            return false;
          }
        };
        const date = (name) => {
          try {
            parseDate(get(row, name).text, format, year);
            return true;
          } catch {
            return false;
          }
        };
        const condition = key(get(row, "condition").text),
          tamara = clean(get(row, "tamara").text);
        const photo = get(row, "photosUrl"),
          url = safeUrl(photo.url || photo.text);
        return (
          (structural || (price("startPrice") && price("reservePrice", true))) &&
          date("startDate") &&
          date("endDate") &&
          (missing(condition) || conditionKeys.has(condition)) &&
          (missing(tamara) || /^(yes|no)$/i.test(tamara)) &&
          (!url || /^[a-z0-9-]+\.sharepoint\.com$/i.test(new URL(url).hostname)) &&
          !!clean(get(row, "title").text) &&
          /\p{L}/u.test(get(row, "title").text) &&
          !safeUrl(get(row, "title").text)
        );
      });
    };
    // Actual headers from a previous paste are explicit column information.
    if (
      savedHeaders.length &&
      fits(savedHeaders) &&
      (compatible(savedHeaders) || compatible(savedHeaders, true))
    )
      return inferredColumns([...savedHeaders], "saved-headers");
    const candidates = [...Object.values(layouts), ...workbookLayouts].filter(fits);
    const unique = [
      ...new Map(
        candidates.map((headers) => [JSON.stringify(columnMap(headers)), headers])
      ).values()
    ];
    // Amount validity must never decide which amount column it represents.
    // An invalid Start Price beside a valid Reserve/Threshold is still invalid;
    // it is not evidence for shifting the price map one cell to the right.
    const evidence = (headers) => {
      if (!compatible(headers, true)) return -1;
      const map = columnMap(headers);
      let score = 0,
        anchored = false;
      for (const row of populated) {
        const value = (field) => clean(row[map[field]]?.text);
        const noReserve = row.flatMap((cell, index) =>
          /^no\s+reserve$/i.test(clean(cell.text)) ? [index] : []
        );
        if (noReserve.length === 1 && map.reservePrice !== noReserve[0]) return -1;
        const condition = conditionKeys.has(key(value("condition")));
        const start = parseDate(value("startDate"), format, year),
          end = parseDate(value("endDate"), format, year);
        if (condition) {
          score += 6;
          anchored = true;
        }
        if (start) score += 2;
        if (end) score += 2;
        if (start && end) {
          score += 4;
          anchored = true;
        }
        const listing = row.findIndex((cell) => {
          const link = safeUrl(cell.url || cell.text);
          return (
            link &&
            new URL(link).hostname === "marketplace.example.invalid" &&
            /^\/auctions\/detail\//.test(new URL(link).pathname)
          );
        });
        if (listing > 0) {
          let titleIndex = listing - 1;
          while (
            titleIndex >= 0 &&
            (missing(row[titleIndex]?.text) || /^\d+(?:\.\d+)?$/.test(clean(row[titleIndex]?.text)))
          )
            titleIndex--;
          if (titleIndex >= 0 && map.title !== titleIndex) return -1;
          score += 3;
        }
      }
      return anchored ? score : -1;
    };
    const scored = unique.map((headers) => ({ headers, score: evidence(headers) })),
      best = Math.max(-1, ...scored.map((entry) => entry.score));
    const matches =
      best >= 0 ? scored.filter((entry) => entry.score === best).map((entry) => entry.headers) : [];
    if (matches.length) {
      const headers = consensusHeaders(matches, width);
      const completeAnchors = matches.every((candidate) => {
        const map = columnMap(candidate);
        return populated.every(
          (row) =>
            conditionKeys.has(key(row[map.condition]?.text)) &&
            map.endDate === map.startDate + 1 &&
            !!parseDate(row[map.startDate]?.text, format, year) &&
            !!parseDate(row[map.endDate]?.text, format, year)
        );
      });
      // A misplaced New or a lone date in an old/partial row is insufficient
      // to assign monetary meaning to neighboring numbers. Keep the row and
      // expose only those amounts as source choices until the operator fixes it.
      if (!completeAnchors) {
        const map = columnMap(headers);
        for (const field of ["startPrice", "reservePrice"]) {
          if (map[field] < 0) continue;
          headers[map[field]] = "";
          headers.reviewColumns.push({
            field,
            columns: [map[field]],
            reason:
              "This row has incomplete or misplaced condition/date fields. Choose the exact price source instead of inferring from neighboring amounts."
          });
        }
      }
      return headers;
    }
    // Copies can start at Tag or Model - Title and stop at Duration. Align a
    // catalog slice using the title/link, condition and adjacent dates, never
    // by looking for a plausible amount. All surviving slices must agree on
    // each money column; otherwise consensus keeps that field unresolved.
    const anchors = populated.map((row) => anchorHeaders(row, format, year));
    if (anchors.every(Boolean)) {
      const maps = anchors.map(columnMap),
        first = maps[0];
      if (
        first.title >= 0 &&
        first.condition >= 0 &&
        first.startDate >= 0 &&
        first.endDate === first.startDate + 1 &&
        maps.every((map) =>
          ["title", "condition", "startDate", "endDate"].every(
            (field) => map[field] === first[field]
          )
        )
      ) {
        const cropped = [];
        for (const source of [...Object.values(layouts), ...workbookLayouts]) {
          const offset = columnMap(source).title - first.title;
          if (offset <= 0 || offset + width > source.length) continue;
          const slice = source.slice(offset, offset + width),
            map = columnMap(slice);
          if (
            ["title", "condition", "startDate", "endDate"].every(
              (field) => map[field] === first[field]
            )
          )
            cropped.push(slice);
        }
        const eligible = cropped.filter((headers) => evidence(headers) >= 0);
        if (eligible.length) {
          const headers = consensusHeaders(eligible, width);
          headers.importMethod = "cropped-catalog";
          return headers;
        }
      }
    }
    // Mixed or unfamiliar rows are handled separately so one changed/invalid
    // row cannot discard every other auction pasted alongside it.
    const headers = inferredColumns(Array(width).fill(""), "anchors");
    headers.perRow = true;
    return headers;
  };
  const parseSheet = (
    input,
    format = "strict",
    {
      layout = "auto",
      savedHeaders = [],
      year = new Date().getFullYear(),
      allowHeaderlessPhotoSource = false
    } = {}
  ) => {
    const table = (typeof input === "string" ? parseTable(input) : input || []).map((row) =>
      row.map(cellValue)
    );
    if (!table.length || !table.some((row) => row.some((cell) => clean(cell.text) || cell.url)))
      throw new Error("Paste the auction rows first.");
    const textOf = (cell) => clean(cellValue(cell).text);
    let headerIndex = table.findIndex(
      (row) =>
        row.some((cell) => aliases.title.includes(key(textOf(cell)))) &&
        row.some((cell) => aliases.startPrice.includes(key(textOf(cell))))
    );
    let headerCells = table[headerIndex];
    if (headerIndex < 0) {
      headerCells = inferHeaders(table, format, { layout, savedHeaders, year });
    }
    const headers = headerCells.map((cell) => key(textOf(cell)));
    const commonMap = columnMap(headerCells);
    const rows = [];
    for (let index = headerIndex + 1; index < table.length; index++) {
      const cells = table[index];
      if (!cells.some((cell) => textOf(cell))) continue;
      let rowHeaders = headerCells;
      if (
        headerCells.perRow ||
        (table.length > 1 &&
          headerIndex < 0 &&
          layout === "auto" &&
          !["saved-headers"].includes(headerCells.importMethod))
      ) {
        const individual = inferHeaders([cells], format, { layout: "auto", savedHeaders, year });
        rowHeaders = individual.perRow ? anchorHeaders(cells, format, year) : individual;
        if (!rowHeaders) continue;
      }
      const map = rowHeaders === headerCells ? commonMap : columnMap(rowHeaders);
      if (aliases.title.includes(key(textOf(cells[map.title])))) continue;
      const get = (field, link = false) => {
        const cell = cells[map[field]];
        return link ? safeUrl(cell?.url || textOf(cell)) : textOf(cell);
      };
      // Worksheet separators outside the listing fields are not auction rows.
      // Partial listings still import and expose their missing fields.
      if (
        !Object.keys(map)
          .filter((field) => field !== "serial")
          .some((field) =>
            (Array.isArray(map[field]) ? map[field] : [map[field]]).some((column) => {
              const cell = cells[column];
              return cell && (!missing(cell.text) || cell.url);
            })
          )
      )
        continue;
      const descriptions = map.descriptionUrl
        .map((index) => cells[index])
        .filter((cell) => cell && (!missing(cell.text) || cell.url));
      const distinctDescriptions = [
        ...new Map(
          descriptions.map((cell) => [safeUrl(cell.url || cell.text) || cell.text.trim(), cell])
        ).values()
      ];
      const description = distinctDescriptions.length === 1 ? distinctDescriptions[0] : null;
      const importReview = (rowHeaders.reviewColumns || []).map(({ field, columns, reason }) => ({
        field,
        reason,
        candidates: columns.flatMap((column) => {
          const cell = cells[column];
          return cell && (!missing(cell.text) || cell.url)
            ? [
                {
                  column,
                  text: textOf(cell),
                  url: safeUrl(cell.url || cell.text),
                  value: field === "photosUrl" ? safeUrl(cell.url || cell.text) : textOf(cell)
                }
              ]
            : [];
        })
      }));
      let photoSource = get("photosUrl", true),
        photoSourceMethod = map.photosUrl >= 0 ? "mapped-column" : "";
      const photoReview = importReview.find((entry) => entry.field === "photosUrl");
      if (headerIndex < 0 && !photoSource && allowHeaderlessPhotoSource) {
        const end = map.endDate;
        const indexes =
          photoReview?.candidates.map((candidate) => candidate.column) ||
          cells.flatMap((_, column) => (end >= 0 && column > end ? [column] : []));
        const eligibleIndexes = indexes.filter(
          (column) =>
            rowHeaders.importMethod !== "saved-headers" ||
            !["photos", "linkphotos"].includes(key(rowHeaders[column]))
        );
        const folders = [
          ...new Set(
            eligibleIndexes.map((column) => sharePointFolder(cells[column])).filter(Boolean)
          )
        ];
        const allFolders = new Set(cells.map(sharePointFolder).filter(Boolean));
        if (folders.length === 1 && allFolders.size === 1) {
          photoSource = folders[0];
          photoSourceMethod = "headerless-folder";
          if (photoReview) importReview.splice(importReview.indexOf(photoReview), 1);
        }
      }
      const row = {
        id: `auction-row-${index + 1}`,
        sourceRow: index + 1,
        serial: get("serial"),
        title: get("title"),
        brand: get("brand"),
        category: get("category"),
        condition: get("condition"),
        startPrice: get("startPrice"),
        reservePrice: get("reservePrice"),
        tamara: get("tamara"),
        photosUrl: photoSource,
        photosColumnMissing: map.photosUrl < 0 && !photoReview && !photoSource,
        photosColumnAmbiguous: !!photoReview && !photoSource,
        photoSourceMethod,
        importMethod: headerIndex >= 0 ? "headers" : rowHeaders.importMethod,
        importReview,
        descriptionUrl: description ? safeUrl(description.url || description.text) : "",
        descriptionConflict: distinctDescriptions.length > 1,
        descriptionColumnOnly: true,
        startDate: get("startDate"),
        endDate: get("endDate"),
        description: "",
        descriptionSource: "",
        categoryPath: [],
        status: "pending",
        issues: []
      };
      if (!row.descriptionUrl && description && !missing(description.text)) {
        row.descriptionSource = description.text.trim();
        row.description = bulletize(row.descriptionSource);
      }
      for (const field of ["startDate", "endDate"])
        try {
          const original = row[field];
          row[field] = parseDate(original, format, year);
          if (row[field] && !/\b\d{4}\b/.test(original) && !/^\d{5}(?:\.\d+)?$/.test(original))
            row.inferredYear = Number(year);
        } catch (error) {
          row.issues.push(error.message);
        }
      if (cells.slice(rowHeaders.length).some((cell) => clean(cell.text) || cell.url)) {
        row.importError =
          "This row has populated cells outside the selected column layout. Copy its headers with the data to preserve alignment.";
        row.issues.push(row.importError);
      }
      rows.push(row);
    }
    if (!rows.length)
      throw new Error(
        "No recognizable auction rows were found. Paste complete rows or choose a local workbook."
      );
    if (rows.length > 500)
      throw new Error(
        "Paste at most 500 auction rows at a time so the local queue stays responsive."
      );
    const signatures = new Map();
    for (const row of rows) {
      const signature = JSON.stringify([row.title, row.photosUrl, row.startDate, row.startPrice]);
      if (signatures.has(signature)) {
        row.issues.push(
          "Possible duplicate row. Compare it with the matching row before preparing another auction."
        );
        signatures
          .get(signature)
          .issues.push(
            "Possible duplicate row. Compare it with the matching row before preparing another auction."
          );
      } else signatures.set(signature, row);
    }
    rows.layoutHeaders = headerCells.map(textOf);
    rows.hasHeaders = headerIndex >= 0;
    rows.inferredYear = rows.some((row) => row.inferredYear) ? Number(year) : null;
    rows.importMethod = headerIndex >= 0 ? "headers" : headerCells.importMethod;
    return rows;
  };
  const bulletize = (value) => {
    const text = String(value || "").trim();
    const lines = text.split(/\n+/).filter((line) => clean(line));
    const sentences = lines.flatMap((line) =>
      [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(line)].map(
        (part) => part.segment
      )
    );
    return sentences
      .map((line) => clean(line).replace(/^(?:[-*•]|\d+[.)])\s*/, ""))
      .filter(Boolean)
      .map((line) => `• ${line}`)
      .join("\n");
  };
  const descriptionIssues = (source, output) => {
    if (!clean(source) || !clean(output))
      return ["Paste the product description and prepare its bullet points."];
    const numbers = (text) => new Set(String(text).match(/\d+(?:[.,]\d+)*/g) || []);
    const sourceNumbers = numbers(source),
      outputNumbers = numbers(output);
    const issues = [];
    if (
      [...sourceNumbers].some((value) => !outputNumbers.has(value)) ||
      [...outputNumbers].some((value) => !sourceNumbers.has(value))
    )
      issues.push("Description numbers changed or are missing. Restore every product number.");
    if (
      !String(output)
        .split("\n")
        .every((line) => !clean(line) || /^\s*[-•*]\s+\S/.test(line))
    )
      issues.push("Use one bullet point per line.");
    for (const claim of [
      "warranty",
      "guarantee",
      "authentic",
      "certified",
      "sealed",
      "free delivery",
      "vehicle",
      "engine",
      "mileage"
    ])
      if (
        new RegExp(`\\b${claim}\\b`, "i").test(output) &&
        !new RegExp(`\\b${claim}\\b`, "i").test(source)
      )
        issues.push(`The description added an unsupported “${claim}” claim.`);
    return issues;
  };
  const validate = (row, { details = false, today = "" } = {}) => {
    const issues = row.importError ? [row.importError] : [];
    if (row.descriptionConflict && !clean(row.descriptionSource))
      issues.push(
        "The two Description columns contain different sources. Paste the intended product description into Source."
      );
    const plan = {};
    for (const field of ["title", "brand", "category"])
      if (missing(row[field])) issues.push(`${field} is missing.`);
    if (row.title?.length > 180)
      issues.push(
        "Listing title exceeds 180 characters; review it without silently truncating it."
      );
    try {
      plan.initialPrice = money(row.startPrice);
    } catch (error) {
      issues.push(error.message);
    }
    plan.noReserve = /^no\s+reserve$/i.test(clean(row.reservePrice));
    try {
      plan.reservePrice = plan.noReserve ? plan.initialPrice : money(row.reservePrice);
    } catch (error) {
      issues.push(error.message);
    }
    if (
      plan.initialPrice &&
      plan.reservePrice &&
      Number(plan.reservePrice) < Number(plan.initialPrice)
    )
      issues.push("Reserve price is below the initial price.");
    const conditions = {
      new: "New with tags",
      newwithtags: "New with tags",
      newwithouttags: "New without tags",
      verygood: "Very good",
      good: "Good",
      satisfactory: "Satisfactory"
    };
    plan.condition = conditions[key(row.condition)];
    if (!plan.condition)
      issues.push("Condition is missing or unsupported. Choose an explicit Ayshei condition.");
    for (const field of ["startDate", "endDate"])
      try {
        plan[field] = parseDate(row[field]);
        if (!plan[field]) issues.push(`${field} is missing. Enter the date explicitly.`);
      } catch (error) {
        issues.push(error.message);
      }
    if (plan.startDate && plan.endDate && plan.endDate <= plan.startDate)
      issues.push("End date must be after the start date.");
    if (today && plan.startDate && plan.startDate < today)
      issues.push("Start date is in the past.");
    if (plan.startDate) plan.startTime = startTime(plan.startDate);
    plan.period = "PM";
    plan.title = clean(row.title);
    plan.brand = clean(row.brand);
    plan.tamara = /^yes$/i.test(clean(row.tamara));
    if (!missing(row.tamara) && !/^(?:yes|no)$/i.test(clean(row.tamara)))
      issues.push("Tamara must be Yes, No, or blank; other values need review.");
    if (
      !safeUrl(row.photosUrl) ||
      !/^[a-z0-9-]+\.sharepoint\.com$/i.test(
        new URL(safeUrl(row.photosUrl) || "https://invalid.test").hostname
      )
    )
      issues.push(
        row.photosColumnMissing
          ? "This layout has no Descale Photoes column. Paste its SharePoint folder link under Photos. Photos and link photos are not used."
          : "Descale Photoes needs the actual SharePoint folder link. Copy directly from the sheet to keep the hyperlink, or paste the folder URL in Links & options."
      );
    if (details) {
      if (row.categoryPath?.length !== 3)
        issues.push(
          "Choose the category on Ayshei, click Next, then continue filling from step 2."
        );
      issues.push(...descriptionIssues(row.descriptionSource, row.description));
      plan.description = row.description;
    }
    return { issues: [...new Set(issues)], plan, valid: issues.length === 0 };
  };
  return Object.freeze({
    clean,
    key,
    missing,
    safeUrl,
    parseTSV,
    parseDate,
    money,
    startTime,
    parseSheet,
    layouts,
    bulletize,
    descriptionIssues,
    validate,
    fingerprint
  });
})();
