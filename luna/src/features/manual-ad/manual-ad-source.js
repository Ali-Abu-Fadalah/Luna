(() => {
  const clean = (value) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  const preserveLines = (value) =>
    String(value ?? "")
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\s*(?:read|show)\s+(?:more|less)\s*$/gim, "")
      .replace(/\s*\b(?:read|show)\s+(?:more|less)\b\s*$/gim, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const normalized = (value) =>
    clean(value)
      .toLocaleLowerCase("en")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const excluded = (element) =>
    Boolean(
      element?.closest(
        "footer,nav,[class*='similar' i],[class*='related' i],[class*='recommended' i]," +
          "[id*='similar' i],[id*='related' i],[id*='recommended' i]"
      )
    );

  const values = {};
  const evidence = {};
  const specs = [];
  const specKeys = new Set();
  const conflictedFields = new Set();
  const fieldPriorities = {};

  const observe = (field, rawValue, source, state = "strong", options = {}) => {
    const value = (options.preserveLines ? preserveLines(rawValue) : clean(rawValue)).slice(
      0,
      options.preserveLines ? 12000 : 500
    );
    if (!value) return;
    const priority = Number(options.priority) || 1;
    const existing = values[field];
    if (!existing) {
      const previousPriority = fieldPriorities[field] || 0;
      if (conflictedFields.has(field) && priority <= previousPriority) return;
      values[field] = value;
      fieldPriorities[field] = priority;
      conflictedFields.delete(field);
      evidence[field] = { raw: clean(value), source, state };
      return;
    }
    if (normalized(existing) === normalized(value)) return;
    const existingPriority = fieldPriorities[field] || 1;
    if (priority < existingPriority || conflictedFields.has(field)) return;
    if (priority > existingPriority) {
      values[field] = value;
      fieldPriorities[field] = priority;
      conflictedFields.delete(field);
      evidence[field] = { raw: clean(value), source, state };
      return;
    }
    values[field] = "";
    conflictedFields.add(field);
    evidence[field] = {
      raw: `${clean(existing)} | ${clean(value)}`.slice(0, 500),
      source,
      state: "conflicting"
    };
  };

  const mappings = Object.freeze({
    body: "bodyType",
    "body style": "bodyType",
    "body type": "bodyType",
    condition: "category",
    color: "exteriorColor",
    colour: "exteriorColor",
    exterior: "exteriorColor",
    "exterior color": "exteriorColor",
    "exterior colour": "exteriorColor",
    "exterior paint": "exteriorColor",
    "paint color": "exteriorColor",
    "paint colour": "exteriorColor",
    "body color": "exteriorColor",
    "body colour": "exteriorColor",
    "vehicle color": "exteriorColor",
    "vehicle colour": "exteriorColor",
    fuel: "fuelType",
    "fuel type": "fuelType",
    make: "make",
    mileage: "kilometers",
    model: "model",
    odometer: "kilometers",
    price: "price",
    "asking price": "price",
    "sale price": "price",
    "regional spec": "regionalSpec",
    "regional specs": "regionalSpec",
    spec: "regionalSpec",
    specs: "regionalSpec",
    specification: "regionalSpec",
    transmission: "transmission",
    trim: "trim",
    "car trim": "trim",
    type: "bodyType",
    "vehicle type": "bodyType",
    year: "year"
  });

  const addSpec = (label, value, source = "Vehicle detail", state = "strong", priority = 2) => {
    if (specs.length >= 160) return;
    const left = clean(label).replace(/\s*:$/, "");
    const right = clean(value);
    const key = normalized(left);
    if (!left || !right || normalized(left) === normalized(right)) return;
    const field = mappings[key];
    const pairKey = `${key}:${normalized(right)}`;
    if (specKeys.has(pairKey)) return;
    specKeys.add(pairKey);
    if (field !== "price") specs.push(`${left}: ${right}`);
    if (!field) return;
    const observedValue =
      field === "price" && !/(?:\b(?:AED|DHS?\.?|USD|SAR)\b|\$|د\.?إ)/i.test(right)
        ? `AED ${right}`
        : right;
    observe(field, observedValue, source, state, { priority });
  };

  const heading = [...document.querySelectorAll("h1,h2,h3")]
    .filter((element) => !excluded(element))
    .map((element) => {
      const text = clean(element.textContent);
      let score = element.tagName === "H1" ? 6 : element.tagName === "H2" ? 3 : 1;
      if (/\b(?:19|20)\d{2}\b/.test(text)) score += 7;
      if (element.closest("main,article,[role='main']")) score += 2;
      if (text.length >= 8 && text.length <= 180) score += 2;
      if (/^(?:description|overview|details|features|similar|related)\b/i.test(text)) score -= 8;
      return { element, score, text };
    })
    .filter((candidate) => candidate.text)
    .sort((left, right) => right.score - left.score)[0]?.element;
  const mainArticle = heading?.closest("article");
  const root =
    mainArticle ||
    heading?.closest("main,[role='main']") ||
    document.querySelector("main,[role='main'],article") ||
    document.body;
  const schemaRecords = [];
  const collectSchemaRecords = (value, depth = 0) => {
    if (!value || depth > 5) return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((item) => collectSchemaRecords(item, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    const types = (Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]]).map(
      normalized
    );
    if (types.some((type) => ["car", "product", "vehicle"].includes(type))) {
      schemaRecords.push(value);
    }
    if (value["@graph"]) collectSchemaRecords(value["@graph"], depth + 1);
  };
  document.querySelectorAll("script[type='application/ld+json']").forEach((script) => {
    try {
      collectSchemaRecords(JSON.parse(script.textContent));
    } catch (error) {
      // Invalid optional metadata must not interrupt visible-page extraction.
    }
  });
  const schemaRecord = schemaRecords
    .map((record) => {
      const recordName = normalized(record.name);
      const headingText = normalized(heading?.textContent);
      let score = 0;
      if (record.url && String(record.url).split("#")[0] === location.href.split("#")[0])
        score += 10;
      if (
        recordName &&
        headingText &&
        (headingText.includes(recordName) || recordName.includes(headingText))
      )
        score += 6;
      if (record.offers) score += 2;
      return { record, score };
    })
    .sort((left, right) => right.score - left.score)[0]?.record;
  const schemaDescription = schemaRecord?.description || "";
  if (schemaRecord) {
    const record = schemaRecord;
    const brand = typeof record.brand === "object" ? record.brand?.name : record.brand;
    const manufacturer =
      typeof record.manufacturer === "object" ? record.manufacturer?.name : record.manufacturer;
    const offers = Array.isArray(record.offers) ? record.offers[0] : record.offers;
    const mileage =
      typeof record.mileageFromOdometer === "object"
        ? record.mileageFromOdometer?.value
        : record.mileageFromOdometer;
    addSpec("Make", brand || manufacturer, "Structured vehicle metadata", "strong", 4);
    addSpec("Model", record.model, "Structured vehicle metadata", "strong", 4);
    addSpec("Color", record.color, "Structured vehicle metadata", "strong", 4);
    addSpec(
      "Body Type",
      record.bodyType || record.bodyStyle,
      "Structured vehicle metadata",
      "strong",
      4
    );
    addSpec(
      "Fuel Type",
      record.fuelType || record.vehicleFuelType,
      "Structured vehicle metadata",
      "strong",
      4
    );
    addSpec("Transmission", record.vehicleTransmission, "Structured vehicle metadata", "strong", 4);
    addSpec("Mileage", mileage, "Structured vehicle metadata", "strong", 4);
    addSpec(
      "Year",
      record.vehicleModelDate || record.productionDate,
      "Structured vehicle metadata",
      "strong",
      4
    );
    if (offers?.price) {
      addSpec(
        "Price",
        `${offers.priceCurrency || "AED"} ${offers.price}`,
        "Structured vehicle metadata",
        "strong",
        4
      );
    }
    (Array.isArray(record.additionalProperty)
      ? record.additionalProperty
      : [record.additionalProperty]
    )
      .filter(Boolean)
      .forEach((property) => {
        addSpec(
          property?.name || property?.propertyID,
          property?.value,
          "Structured vehicle property",
          "strong",
          4
        );
      });
  }

  root.querySelectorAll("[itemprop]").forEach((element) => {
    const property = normalized(element.getAttribute("itemprop"));
    const semanticLabels = {
      brand: "Make",
      color: "Color",
      fueltype: "Fuel Type",
      model: "Model",
      price: "Price",
      productiondate: "Year",
      vehiclemodeldate: "Year",
      vehicletransmission: "Transmission"
    };
    if (!semanticLabels[property] || excluded(element)) return;
    addSpec(
      semanticLabels[property],
      element.getAttribute("content") || element.textContent,
      "Semantic vehicle metadata",
      "strong",
      3
    );
  });

  root.querySelectorAll("dl").forEach((list) => {
    if (excluded(list)) return;
    list.querySelectorAll("dt").forEach((term) => {
      addSpec(
        term.textContent,
        term.nextElementSibling?.textContent,
        "Vehicle definition list",
        "strong",
        3
      );
    });
  });
  root.querySelectorAll("table tr").forEach((row) => {
    if (excluded(row)) return;
    const cells = row.querySelectorAll("th,td");
    if (cells.length >= 2)
      addSpec(cells[0].textContent, cells[1].textContent, "Vehicle details table", "strong", 3);
  });

  const knownLabels = new Set(Object.keys(mappings));
  root.querySelectorAll("*").forEach((element) => {
    if (excluded(element)) return;
    const fullText = clean(element.textContent);
    if (fullText.length > 80) return;
    const label = clean(element.textContent).replace(/\s*:$/, "");
    if (!knownLabels.has(normalized(label))) return;
    const sibling = clean(element.nextElementSibling?.textContent);
    const parentText = clean(element.parentElement?.textContent);
    const fallback =
      parentText.length <= 220
        ? clean(
            parentText.replace(
              new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?`, "i"),
              ""
            )
          )
        : "";
    addSpec(label, sibling || fallback, "Semantic vehicle detail", "review", 2);
  });
  root.querySelectorAll("li,p,div,span").forEach((element) => {
    if (excluded(element)) return;
    const text = clean(element.textContent);
    if (!text || text.length > 180) return;
    const match = text.match(/^([^:]{2,36}):\s*(.{1,140})$/);
    if (!match || !knownLabels.has(normalized(match[1]))) return;
    addSpec(match[1], match[2], "Inline labeled vehicle detail", "review", 1);
  });

  if (values.make && values.model) {
    observe("makeModel", `${values.make} ${values.model}`, "Labeled vehicle identity", "strong");
  }
  delete values.make;
  delete values.model;
  delete evidence.make;
  delete evidence.model;

  const visibleBodyTypes = [...root.querySelectorAll('a[href*="?type="],a[href*="&type="]')]
    .filter((element) => visible(element) && !excluded(element))
    .map((element) => clean(element.textContent))
    .filter(Boolean);
  const bodyTypeValues = [...new Set(visibleBodyTypes.map(normalized))];
  if (bodyTypeValues.length === 1) {
    observe("bodyType", visibleBodyTypes[0], "Visible vehicle type badge", "confirmed", {
      priority: 5
    });
  }

  const host = location.hostname.toLocaleLowerCase("en");
  const supportedMarketplace = ["dubicars.com", "dubizzle.com"].some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
  const priceCore = globalThis.LunaManualAdPriceCore;
  const priceSelector =
    "[class*='price' i],[id*='price' i],[data-testid*='price' i],[data-qa*='price' i]";
  const inMainVehicle = (element) =>
    !excluded(element) && (!mainArticle || element.closest("article") === mainArticle);
  const financingElement = (element) => {
    if (
      element.closest(
        "[class*='financ' i],[id*='financ' i],[data-testid*='financ' i]," +
          "[class*='monthly' i],[id*='monthly' i],[class*='installment' i],[id*='installment' i]"
      )
    )
      return true;
    const actionText = clean(element.closest("a,button")?.textContent);
    return /\b(?:financ|monthly|per month|installment|deposit|down payment)\b/i.test(actionText);
  };
  const priceContext = (element) => {
    const parts = [];
    let current = element;
    for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
      const text = clean(current.textContent);
      if (text && text.length <= 240) parts.push(text);
      const previous = current.previousElementSibling;
      const previousText = clean(previous?.textContent);
      if (previousText && previousText.length <= 80) parts.push(previousText);
    }
    return [...new Set(parts)].join(" | ").slice(0, 600);
  };
  const renderedPriceElement = (element) =>
    visible(element) &&
    !element.closest("[hidden],[aria-hidden='true']") &&
    (!element.getClientRects || element.getClientRects().length > 0);
  const priceContainers = [...root.querySelectorAll(priceSelector)];
  const priceElements = [
    ...new Set([
      ...priceContainers,
      ...priceContainers.flatMap((container) =>
        [...container.querySelectorAll("*")].filter((element) => !element.children.length)
      ),
      ...[...root.querySelectorAll("*")].filter(
        (element) =>
          !element.children.length && priceCore?.parseDisplayedPriceText(element.textContent)
      )
    ])
  ];
  const visiblePrice = priceCore?.chooseDisplayedPrice(
    priceElements
      .filter((element) => renderedPriceElement(element) && inMainVehicle(element))
      .map((element) => ({
        financing: financingElement(element),
        inPriceContainer: Boolean(element.matches(priceSelector) || element.closest(priceSelector)),
        context: priceContext(element),
        text: clean(element.textContent)
      }))
  );
  if (visiblePrice?.match) {
    observe("price", visiblePrice.match.raw, "Exact visible vehicle price", "confirmed", {
      priority: 6
    });
  } else if (supportedMarketplace) {
    values.price = "";
    fieldPriorities.price = 6;
    conflictedFields.add("price");
    evidence.price = {
      raw: visiblePrice?.observedAmounts?.join(" | ") || "",
      source: visiblePrice?.conflicting
        ? "Conflicting visible vehicle prices"
        : "Visible marketplace price required",
      state: visiblePrice?.conflicting ? "conflicting" : "missing"
    };
  }

  const descriptionSelectors = [
    "#card-description #car-description",
    "#card-description .more-wrapper-text",
    "[itemprop='description']",
    "[data-description]",
    "[data-testid*='description' i]",
    "[class*='description-inner' i]",
    "[class*='description-content' i]",
    "[class*='description-body' i]",
    "[id*='description' i]",
    "[class*='description' i]"
  ];
  const descriptionCore = globalThis.LunaManualAdDescriptionCore;
  const semanticDescriptionHeading =
    /^(?:(?:the|vehicle|car) )*(?:description|overview|narrative|about (?:this )?(?:vehicle|car))$/i;
  const descriptionSubheading =
    /^(?:seller (?:notes?|comments?)|vehicle (?:notes?|comments?)|details|overview)$/i;
  const formattedTextFromElement = (element) => {
    const blockTags = new Set([
      "ADDRESS",
      "ARTICLE",
      "BLOCKQUOTE",
      "DIV",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "LI",
      "P",
      "SECTION"
    ]);
    const readNode = (node) => {
      if (node.nodeType === 3) return node.nodeValue || "";
      if (node.nodeType !== 1) return "";
      if (node.tagName === "BR") return "\n";
      const text = [...node.childNodes].map(readNode).join("");
      return blockTags.has(node.tagName) ? `${text}\n\n` : text;
    };
    return preserveLines(readNode(element));
  };
  const descriptionCandidates = [
    ...new Set(descriptionSelectors.flatMap((selector) => [...root.querySelectorAll(selector)]))
  ]
    .filter((element) => !excluded(element))
    .map((element) => {
      const clone = element.cloneNode(true);
      clone.querySelectorAll("script,style,button,[role='tab']").forEach((node) => node.remove());
      clone.querySelectorAll("h1,h2,h3,h4,h5,h6,legend").forEach((node) => {
        if (/^(?:description|vehicle description)$/i.test(clean(node.textContent))) node.remove();
      });
      const text = formattedTextFromElement(clone)
        .replace(/^(?:description|vehicle description)\s*[:\-]?\s*/i, "")
        .trim();
      const className = clean(element.className);
      let score = 0;
      if (element.matches("[itemprop='description'],[data-description]")) score += 8;
      if (/\b(?:inner|content|body|text)\b/i.test(className.replace(/[-_]+/g, " "))) score += 5;
      if (element.querySelectorAll("p,li,br").length) score += 3;
      if (text.length >= 40) score += 2;
      if (text.length > 8000) score -= 4;
      return {
        direct: element.matches(
          "#car-description,#card-description .more-wrapper-text,[data-testid*='description' i],[data-description]"
        ),
        score,
        semantic: element.matches("[itemprop='description'],[data-description]"),
        text
      };
    })
    .filter(
      (candidate) =>
        candidate.text &&
        !/^(?:description|vehicle description)$/i.test(candidate.text) &&
        !descriptionCore?.placeholderDescription(candidate.text)
    );
  const headedDescriptionCandidates = [
    ...root.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']")
  ]
    .filter(
      (heading) => !excluded(heading) && semanticDescriptionHeading.test(clean(heading.textContent))
    )
    .map((heading) => {
      const blocks = [];
      let sibling = heading.nextElementSibling;
      while (sibling && blocks.length < 24) {
        if (excluded(sibling)) break;
        if (sibling.matches("h1,h2,h3,h4,h5,h6,[role='heading']")) {
          if (descriptionSubheading.test(clean(sibling.textContent))) {
            sibling = sibling.nextElementSibling;
            continue;
          }
          break;
        }
        const text = formattedTextFromElement(sibling);
        if (text) blocks.push(text);
        sibling = sibling.nextElementSibling;
      }
      return {
        headed: true,
        score: 14 + Math.min(blocks.length, 6),
        text: preserveLines(blocks.join("\n\n"))
      };
    })
    .filter((candidate) => candidate.text);
  descriptionCandidates.push(...headedDescriptionCandidates);
  const selectedDescription = descriptionCore?.chooseDescription(descriptionCandidates, {
    marketplace: supportedMarketplace
  });
  observe(
    "description",
    selectedDescription?.text || (supportedMarketplace ? "" : preserveLines(schemaDescription)),
    selectedDescription?.direct
      ? "Exact vehicle description"
      : selectedDescription?.headed
        ? "Visible description section"
        : "Vendor description",
    "strong",
    { preserveLines: true }
  );

  if (!values.year) {
    observe(
      "year",
      clean(heading?.textContent).match(/\b(?:19|20)\d{2}\b/)?.[0],
      "Vehicle heading",
      "strong"
    );
  }
  if (!values.category) {
    const condition =
      specs.find((item) => /^Condition:/i.test(item))?.replace(/^[^:]+:\s*/, "") || "";
    observe("category", condition, "Vehicle condition", condition ? "strong" : "missing");
  }
  if (!values.description) {
    observe(
      "descriptionSource",
      specs.join("\n"),
      "Extracted vehicle specifications for AI formatting",
      "review",
      { preserveLines: true }
    );
  }

  const vehicleImage = [...(mainArticle || root).querySelectorAll("img")]
    .map((image, index) => {
      const url = image.currentSrc || image.src || "";
      const nearby = clean(
        `${image.alt || ""} ${image.className || ""} ${image.parentElement?.className || ""}`
      );
      if (
        !/^https:\/\//i.test(url) ||
        /\b(?:logo|icon|avatar|profile|placeholder|favicon)\b/i.test(nearby)
      )
        return null;
      let score = 0;
      if (heading && normalized(nearby).includes(normalized(heading.textContent))) score += 12;
      if (/\b(?:gallery|slider|carousel|vehicle|listing|car)\b/i.test(nearby)) score += 6;
      if (Number(image.naturalWidth || image.width) >= 500) score += 3;
      if (Number(image.naturalHeight || image.height) >= 300) score += 2;
      return { index, score, url };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0];
  observe("imageUrl", vehicleImage?.url, "Ranked vehicle gallery image", "review");

  const sourceUrl = (() => {
    const url = new URL(location.href);
    url.hash = "";
    [...url.searchParams.keys()].forEach((name) => {
      if (
        /^(?:access[_-]?token|api[_-]?key|auth|key|session|signature|sig|token|x-amz-.+)$/i.test(
          name
        )
      ) {
        url.searchParams.delete(name);
      }
    });
    return url.href;
  })();

  return {
    ...values,
    capturedAt: new Date().toISOString(),
    evidence,
    sourceAdapter: "universal",
    sourceUrl,
    specs,
    version: 7
  };
})();
