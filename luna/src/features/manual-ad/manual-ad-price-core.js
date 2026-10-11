globalThis.LunaManualAdPriceCore = (() => {
  const clean = (value) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  const currencyPattern = "(?:AED|DHS?\\.?|USD|SAR|د\\.?إ|\\$)";
  const amountPattern = "([0-9][\\d,]{2,})(?:\\.\\d{1,2})?";
  const prefixPrice = new RegExp(`^(${currencyPattern})\\s*${amountPattern}$`, "i");
  const suffixPrice = new RegExp(`^${amountPattern}\\s*(${currencyPattern})$`, "i");
  const barePrice = new RegExp(`^${amountPattern}$`);
  const financingContext =
    /\b(?:finance|financing|monthly|per month|installments?|tenure|down payment|deposit|net financed|annual profit)\b|\/\s*month\b/i;
  const primaryPriceContext = /\b(?:car|vehicle|asking|sale|cash)?\s*price\b/i;

  const parseDisplayedPriceText = (value, { allowBare = false } = {}) => {
    const text = clean(value);
    const prefix = text.match(prefixPrice);
    const suffix = prefix ? null : text.match(suffixPrice);
    const bare = prefix || suffix || !allowBare ? null : text.match(barePrice);
    const amountText = prefix?.[2] || suffix?.[1] || bare?.[1] || "";
    const amount = amountText.replace(/\D/g, "");
    if (!/^\d{3,9}$/.test(amount)) return null;
    const currency = prefix?.[1] || suffix?.[2] || "";
    return Object.freeze({
      amount,
      hasCurrency: Boolean(currency),
      raw: currency ? text : `AED ${amountText}`
    });
  };

  const chooseDisplayedPrice = (candidates) => {
    const prepared = (Array.isArray(candidates) ? candidates : [])
      .filter(
        (candidate) => !candidate?.financing && !financingContext.test(clean(candidate?.context))
      )
      .map((candidate) => {
        const parsed = parseDisplayedPriceText(candidate?.text, {
          allowBare: Boolean(candidate?.inPriceContainer)
        });
        if (!parsed) return null;
        return {
          ...parsed,
          score:
            (parsed.hasCurrency ? 20 : 10) +
            (candidate?.inPriceContainer ? 10 : 0) +
            (candidate?.primaryPrice || primaryPriceContext.test(clean(candidate?.context))
              ? 40
              : 0)
        };
      })
      .filter(Boolean);
    if (!prepared.length) return Object.freeze({ conflicting: false, match: null });
    const bestScore = Math.max(...prepared.map((candidate) => candidate.score));
    const best = prepared.filter((candidate) => candidate.score === bestScore);
    const amounts = [...new Set(best.map((candidate) => candidate.amount))];
    if (amounts.length !== 1) {
      return Object.freeze({
        conflicting: true,
        match: null,
        observedAmounts: Object.freeze(amounts)
      });
    }
    return Object.freeze({ conflicting: false, match: Object.freeze(best[0]) });
  };

  return Object.freeze({ chooseDisplayedPrice, parseDisplayedPriceText });
})();
