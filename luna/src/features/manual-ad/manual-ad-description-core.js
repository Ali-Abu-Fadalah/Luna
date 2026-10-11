globalThis.LunaManualAdDescriptionCore = (() => {
  const togglePattern =
    "(?:read|show)\\s+(?:more|less)|(?:see|show|hide|read)\\s+(?:(?:the|this)\\s+)?(?:full\\s+)?description";
  const descriptionNoiseLine =
    /^(?:related posts?|no related posts?|related cars?|no related cars?)\s*[:.\-–—]?$/i;
  const descriptionNoiseSuffix =
    /(?:\s+(?:related posts?|no related posts?|related cars?|no related cars?)\s*[:.\-–—]?)+\s*$/i;
  const stripSectionHeading = (value) =>
    String(value ?? "").replace(
      /^\s*(?:(?:overview)\s*)?(?:about\s+this\s+vehicle|vehicle\s+overview)\s*[:\-]?\s*/i,
      ""
    );
  const cleanDescription = (value) =>
    String(value ?? "")
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .filter((line) => !descriptionNoiseLine.test(line.trim()))
      .join("\n")
      .replace(descriptionNoiseSuffix, "")
      .replace(new RegExp(`^\\s*(?:${togglePattern})\\s*$`, "gim"), "")
      .replace(new RegExp(`\\s*\\b(?:${togglePattern})\\b\\s*$`, "gim"), "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 8000);

  const pageChrome =
    /^(?:(?:get|download)\s+(?:the\s+)?(?:dubicars|dubizzle|our)\s+app|sell\s+your\s+car|subscribe\s+to\s+our\s+newsletter|free,?\s+instant\s+car\s+valuation|similar\s+cars|related\s+(?:cars|links))/i;
  const placeholderDescription = (value) => {
    const text = stripSectionHeading(cleanDescription(value))
      .replace(/^(?:seller|vehicle|car)?\s*(?:notes?|comments?|description)\s*[:\-]?\s*/i, "")
      .replace(/[.\-–—\s]+$/g, "")
      .trim()
      .toLocaleLowerCase("en");
    return /^(?:n\/?a|na|none|nil|not available|not applicable|not provided|not specified|no (?:description|details|comments?|notes?)|tbc|tba|coming soon)$/i.test(
      text
    );
  };

  const chooseDescription = (candidates, { marketplace = false } = {}) => {
    const prepared = (Array.isArray(candidates) ? candidates : [])
      .map((candidate) => {
        const text = cleanDescription(candidate?.text);
        if (text.length < 20 || pageChrome.test(text) || placeholderDescription(text)) return null;
        const direct = Boolean(candidate?.direct);
        const headed = Boolean(candidate?.headed);
        if (marketplace && !direct && !headed) return null;
        return {
          direct,
          headed,
          score: Number(candidate?.score) || 0,
          semantic: Boolean(candidate?.semantic),
          text
        };
      })
      .filter(Boolean)
      .sort(
        (left, right) =>
          Number(right.direct) - Number(left.direct) ||
          Number(right.headed) - Number(left.headed) ||
          Number(right.semantic) - Number(left.semantic) ||
          right.score - left.score ||
          right.text.length - left.text.length
      );
    return prepared[0] ? Object.freeze({ ...prepared[0] }) : null;
  };

  return Object.freeze({ chooseDescription, cleanDescription, placeholderDescription });
})();
