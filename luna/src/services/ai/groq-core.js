globalThis.LunaGroqCore = (() => {
  const MODEL = "qwen/qwen3.8-27b";
  const ROUTER_MODELS = Object.freeze([
    MODEL,
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
  ]);
  const MAX_CANDIDATES = 80;
  const BODY_TYPES = Object.freeze([
    "Convertible",
    "Coupe",
    "Crossover",
    "Hatchback",
    "Minivan",
    "Pickup Truck",
    "Sedan",
    "Sports Car",
    "SUV",
    "Van",
    "Wagon"
  ]);
  const clean = (value, limit = 160) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  const cleanContext = (value, limit) =>
    clean(value, limit)
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\b\S+@\S+\b/g, "")
      .replace(/\+?\d[\d *()-]{7,}\d/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const cleanSourceText = (value, limit = 2400) =>
    String(value ?? "")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, limit);
  const key = (value) =>
    clean(value)
      .toLocaleLowerCase("en")
      .replace(/[^\p{L}\p{N}]+/gu, "");

  const prepareCandidates = (value, keepOther = false) => {
    const candidates = Array.isArray(value)
      ? value
          .slice(0, MAX_CANDIDATES)
          .map((candidate) => ({
            id: clean(candidate?.id, 80),
            label: clean(candidate?.label, 120)
          }))
          .filter((candidate) => candidate.id && candidate.label)
      : [];
    if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
      throw new TypeError("Ayshei candidate identifiers must be unique.");
    }
    const nonOther = candidates.filter((candidate) => key(candidate.label) !== "other");
    return Object.freeze(keepOther ? candidates : nonOther.length ? nonOther : candidates);
  };

  const prepareAnalysis = (input) => {
    const task = ["bodyType", "color", "description", "field", "model", "trim"].includes(
      input?.task
    )
      ? input.task
      : "";
    if (!task) throw new TypeError("Groq vehicle-analysis task is invalid.");
    const factNames =
      task === "description"
        ? ["sourceText", "title"]
        : task === "bodyType"
          ? ["make", "model", "title", "year"]
          : task === "color"
            ? ["color", "make", "model", "title", "year"]
            : task === "field"
              ? ["context", "field", "make", "model", "reported", "summary", "title", "year"]
              : ["make", "model", "trim", "title", "year", "summary", "context"];
    const facts = Object.fromEntries(
      factNames
        .map((name) => [
          name,
          name === "sourceText"
            ? cleanSourceText(input?.facts?.[name])
            : ["summary", "context"].includes(name)
              ? cleanContext(input?.facts?.[name], name === "context" ? 900 : 400)
              : clean(input?.facts?.[name], name === "title" ? 180 : 80)
        ])
        .filter(([, value]) => value)
    );
    const candidates = ["bodyType", "description"].includes(task)
      ? []
      : prepareCandidates(input?.candidates, task === "field");
    if (!["bodyType", "description"].includes(task) && !candidates.length) {
      throw new TypeError("No live Ayshei candidates were supplied.");
    }
    let imageUrl = "";
    try {
      const url = new URL(String(input?.imageUrl || ""));
      const host = url.hostname.toLowerCase();
      if (
        url.protocol === "https:" &&
        [
          "alwanworld.com",
          "dubicars.com",
          "dubizzle.com",
          "kandycars.com",
          "lowmileage.net",
          "mohamedhakim.com",
          "shopify.com"
        ].some((root) => host === root || host.endsWith(`.${root}`))
      )
        imageUrl = url.href;
    } catch (error) {
      imageUrl = "";
    }
    return Object.freeze({ candidates, facts, imageUrl, task });
  };

  const parseAnalysis = (payload, input) => {
    const prepared = prepareAnalysis(input);
    if (!ROUTER_MODELS.includes(payload?.model)) {
      throw new Error("The Worker is not using a Luna-approved AI model.");
    }
    const selectedModel = payload.model;
    const provider =
      selectedModel === MODEL
        ? "groq"
        : selectedModel.startsWith("gemini-")
          ? "gemini"
          : "openrouter";
    const analysis = payload?.analysis;
    const confidence = ["high", "medium", "low"].includes(analysis?.confidence)
      ? analysis.confidence
      : "low";
    const confidenceScore = Number.isFinite(analysis?.confidenceScore)
      ? analysis.confidenceScore
      : null;
    const riskFlags = Array.isArray(analysis?.riskFlags) ? analysis.riskFlags.slice(0, 6) : [];
    const autoFillEligible =
      confidenceScore !== null &&
      confidenceScore >= 0.85 &&
      confidence === "high" &&
      riskFlags.length === 0 &&
      !String(payload?.imageWarning || "").trim() &&
      !String(payload?.reviewReason || "").trim();
    if (prepared.task === "description") {
      const description = cleanSourceText(analysis?.description, 3200);
      if (!description) throw new Error("Groq returned an empty description.");
      return Object.freeze({
        bodyType: null,
        candidate: null,
        confidence,
        confidenceScore,
        autoFillEligible,
        description,
        exact: false,
        imageUsed: false,
        imageWarning: "",
        model: selectedModel,
        provider,
        riskFlags,
        reason: clean(analysis?.reason, 180),
        requiresReview: true
      });
    }
    if (prepared.task === "bodyType") {
      const bodyType = BODY_TYPES.find((item) => key(item) === key(analysis?.bodyType));
      if (!bodyType) throw new Error("Groq returned an unsupported body type.");
      return Object.freeze({
        bodyType,
        candidate: null,
        confidence,
        confidenceScore,
        autoFillEligible,
        exact: false,
        imageUsed: payload?.imageUsed === true,
        imageWarning: clean(payload?.imageWarning, 180),
        model: selectedModel,
        provider,
        riskFlags,
        reason: clean(analysis?.reason, 180),
        requiresReview: true
      });
    }
    const candidateId = analysis?.candidateId === null ? null : clean(analysis?.candidateId, 80);
    const candidate = candidateId
      ? prepared.candidates.find((item) => item.id === candidateId)
      : null;
    if (!candidateId) {
      throw new Error(`Groq did not choose a live ${prepared.task} candidate.`);
    }
    if (candidateId && !candidate) {
      throw new Error("Groq selected a value outside the live Ayshei catalog.");
    }
    return Object.freeze({
      bodyType: null,
      candidate: candidate || null,
      confidence,
      confidenceScore,
      autoFillEligible,
      exact: Boolean(candidate && analysis?.exact === true),
      imageUsed: payload?.imageUsed === true,
      imageWarning: clean(payload?.imageWarning, 180),
      model: selectedModel,
      provider,
      riskFlags,
      reason: clean(analysis?.reason, 180),
      requiresReview: Boolean(candidate)
    });
  };

  const cacheKey = (input) => {
    const prepared = prepareAnalysis(input);
    return JSON.stringify({
      candidates: prepared.candidates,
      facts: prepared.facts,
      imageUrl: prepared.imageUrl,
      task: prepared.task
    });
  };

  return Object.freeze({
    BODY_TYPES,
    MODEL,
    ROUTER_MODELS,
    cacheKey,
    parseAnalysis,
    prepareAnalysis,
    prepareCandidates
  });
})();
