(() => {
  const clean = (value) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  const first = (...values) => values.map(clean).find(Boolean) || "";
  const site = (() => {
    const host = location.hostname.toLowerCase();
    if (host === "dubicars.com" || host.endsWith(".dubicars.com")) return "dubicars";
    if (host === "dubizzle.com" || host.endsWith(".dubizzle.com")) return "dubizzle";
    return "";
  })();

  const readJsonLd = () => {
    const values = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        values.push(JSON.parse(script.textContent));
      } catch (error) {
        /* malformed page data is ignored */
      }
    });
    return values;
  };
  const walk = (value, found = []) => {
    if (!value || typeof value !== "object") return found;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, found));
      return found;
    }
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    const isVehicle = types.some((type) => /^(?:vehicle|car)$/i.test(String(type || "")));
    const isAutomotiveProduct =
      types.some((type) => /^product$/i.test(String(type || ""))) &&
      ["mileageFromOdometer", "vehicleModelDate", "vehicleTransmission"].some(
        (name) => value[name]
      );
    if (isVehicle || isAutomotiveProduct) found.push(value);
    Object.values(value).forEach((item) => walk(item, found));
    return found;
  };
  const vehicle = walk(readJsonLd())[0] || {};
  const pageText = String(
    document.querySelector("main")?.innerText || document.body?.innerText || ""
  ).replace(/\r/g, "");
  const lines = pageText.split(/\n+/).map(clean).filter(Boolean);
  const cutoff = lines.findIndex((line) =>
    /^(?:similar cars|you may also like|recommended(?: cars)?|related cars|car finance calculator|popular .*)$/i.test(
      line
    )
  );
  const detailLines = cutoff >= 0 ? lines.slice(0, cutoff) : lines;
  const afterLabel = (...labels) => {
    const wanted = labels.map((label) => label.toLocaleLowerCase("en"));
    for (let index = 0; index < detailLines.length - 1; index += 1) {
      if (wanted.includes(detailLines[index].toLocaleLowerCase("en")))
        return detailLines[index + 1];
    }
    return "";
  };
  const regionalSpecs = () => {
    const allowed = "GCC|American|Canadian|Chinese|European|Japanese|Korean|Other";
    for (let index = 0; index < Math.min(detailLines.length, 90); index += 1) {
      const line = detailLines[index];
      const inline = line.match(
        new RegExp(
          `^(?:Specs|Regional Specs|Target Market)\\s*[:\\-]?\\s*(${allowed})(?:\\s+Specs?)?$`,
          "i"
        )
      );
      if (inline)
        return /\\sSpecs?$/i.test(line) && !/^other$/i.test(inline[1])
          ? `${inline[1]} Specs`
          : inline[1];
      if (/^(?:Specs|Regional Specs|Target Market)$/i.test(line)) {
        const next = detailLines[index + 1] || "";
        const value = next.match(new RegExp(`^(${allowed})(?:\\s+Specs?)?$`, "i"));
        if (value) return next;
      }
    }
    return (
      detailLines
        .slice(0, 90)
        .find((line) =>
          /^(?:GCC|American|Canadian|Chinese|European|Japanese|Korean)(?:\s+Specs?)?$/i.test(line)
        ) || ""
    );
  };
  const meta = (property) => document.querySelector(`meta[property="${property}"]`)?.content || "";
  const namedMeta = (name) => document.querySelector(`meta[name="${name}"]`)?.content || "";
  const valueFromIdentifier = (value) => {
    try {
      const url = new URL(String(value || ""), location.href);
      const part = url.pathname.split("/").filter(Boolean).at(-1) || "";
      return decodeURIComponent(part).replace(/[-_]+/g, " ");
    } catch (error) {
      return "";
    }
  };
  const directValueOf = (value) =>
    typeof value === "object" ? first(value?.name, value?.value) : clean(value);
  const valueOf = (value) =>
    typeof value === "object"
      ? first(directValueOf(value), valueFromIdentifier(value?.["@id"]))
      : clean(value);
  const fact = (value, source) =>
    value ? { evidence: source, value: clean(value) } : { evidence: "", value: "" };
  const routeHints = (() => {
    if (site !== "dubizzle") return { make: "", model: "" };
    const match = location.pathname.match(/\/motors\/(?:used|new)-cars\/([^/]+)\/([^/]+)\//i);
    if (!match) return { make: "", model: "" };
    const fromSlug = (value) => decodeURIComponent(value).replace(/[-_]+/g, " ");
    const visible = (slug) =>
      detailLines.find(
        (line) => clean(line).toLocaleLowerCase("en") === clean(slug).toLocaleLowerCase("en")
      ) || slug;
    return { make: visible(fromSlug(match[1])), model: visible(fromSlug(match[2])) };
  })();
  const make = first(
    directValueOf(vehicle.brand),
    afterLabel("Make", "Brand"),
    valueFromIdentifier(vehicle.brand?.["@id"]),
    routeHints.make
  );
  const model = first(
    directValueOf(vehicle.model),
    afterLabel("Model"),
    valueFromIdentifier(vehicle.model?.["@id"]),
    routeHints.model
  );
  const vehicleHeading = detailLines.find((line) => {
    const normalized = line.toLocaleLowerCase("en");
    const prefix = `${make} ${model}`.toLocaleLowerCase("en");
    return (
      prefix.trim().length > 2 && normalized.startsWith(prefix) && normalized.length > prefix.length
    );
  });
  const pageTitle = first(
    vehicleHeading,
    vehicle.name,
    document.querySelector("h1")?.textContent,
    meta("og:title"),
    document.title
  );
  const trim = afterLabel("Trim");
  const color = first(valueOf(vehicle.color), afterLabel("Color", "Exterior Color"));
  const transmission = first(
    valueOf(vehicle.vehicleTransmission),
    afterLabel("Transmission", "Transmission Type")
  );
  const mileage = first(
    valueOf(vehicle.mileageFromOdometer),
    afterLabel("Kilometers", "Kilometres", "Mileage", "Odometer")
  );
  const targetMarket = afterLabel("Target Market");
  const specs = regionalSpecs();
  const year = first(valueOf(vehicle.vehicleModelDate), afterLabel("Model year", "Year"));
  const description = first(
    valueOf(vehicle.description),
    afterLabel("Description"),
    namedMeta("description"),
    meta("og:description")
  );
  const conditionTitle = first(meta("og:title"), document.title);
  const routeCondition =
    /\/new-cars\//i.test(location.pathname) || /^new\b/i.test(conditionTitle)
      ? "New"
      : /\/used-cars\//i.test(location.pathname) || /^used\b/i.test(conditionTitle)
        ? "Used"
        : "";
  const visibleCondition = afterLabel("Condition");
  const structuredCondition = valueOf(vehicle.itemCondition);
  const category = first(visibleCondition, routeCondition, structuredCondition);
  const image = Array.isArray(vehicle.image) ? vehicle.image[0] : valueOf(vehicle.image);
  const context = detailLines
    .join("\n")
    .split(/\n+|(?<=[.!?])\s+/)
    .map(clean)
    .filter(
      (line) =>
        line.length <= 240 &&
        /\b(?:awd|4wd|body|camera|cylinder|drive|engine|export|exterior|feature|fuel|horsepower|interior|kilomet|leather|make|mileage|model|package|seat|series|spec|sunroof|transmission|trim|turbo|version|wheel|year)\b/i.test(
          line
        )
    )
    .filter((line) => !/(?:https?:\/\/|www\.|@|\+?\d[\d *()-]{7,}\d)/i.test(line))
    .slice(0, 40)
    .join(" · ")
    .slice(0, 1200);
  return {
    facts: {
      category: fact(
        category,
        visibleCondition
          ? "Visible Condition"
          : routeCondition
            ? "Explicit condition route/title"
            : structuredCondition
              ? "Structured vehicle condition"
              : ""
      ),
      color: fact(
        color,
        color === valueOf(vehicle.color) ? "Structured vehicle color" : "Visible exterior color"
      ),
      mileage: fact(
        mileage,
        mileage === valueOf(vehicle.mileageFromOdometer)
          ? "Structured vehicle mileage"
          : "Visible vehicle mileage"
      ),
      make: fact(
        make,
        make === valueOf(vehicle.brand)
          ? "Structured vehicle brand"
          : afterLabel("Make", "Brand")
            ? "Visible Make"
            : "Vehicle detail route"
      ),
      model: fact(
        model,
        model === valueOf(vehicle.model)
          ? "Structured vehicle model"
          : afterLabel("Model")
            ? "Visible Model"
            : "Vehicle detail route"
      ),
      specs: fact(specs, specs ? "Visible regional specification" : ""),
      targetMarket: fact(targetMarket, "Visible Target Market"),
      transmission: fact(
        transmission,
        transmission === valueOf(vehicle.vehicleTransmission)
          ? "Structured vehicle transmission"
          : "Visible Transmission"
      ),
      trim: fact(trim, "Visible Trim"),
      year: fact(
        year,
        year === valueOf(vehicle.vehicleModelDate) ? "Structured model year" : "Visible Year"
      ),
      engine: fact(
        afterLabel("Engine Capacity (cc)", "Engine Capacity", "Engine"),
        "Visible engine specification"
      ),
      cylinders: fact(
        afterLabel("No. of Cylinders", "Cylinders"),
        "Visible cylinder specification"
      ),
      fuelType: fact(afterLabel("Fuel Type"), "Visible fuel specification"),
      drivetrain: fact(
        afterLabel("Drivetrain", "Drive Type", "Drive"),
        "Visible drivetrain specification"
      )
    },
    context,
    description: description.slice(0, 1200),
    imageUrl: first(image, meta("og:image")),
    summary: description.slice(0, 500),
    site,
    sourceUrl: location.href,
    title: pageTitle,
    version: 3
  };
})();
