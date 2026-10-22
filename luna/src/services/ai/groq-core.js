globalThis.LunaGroqCore = (() => {
  const MODEL = "qwen/qwen3.8-27b";
  const GROQ_MODELS = Object.freeze([MODEL, "openai/gpt-oss-20b", "openai/gpt-oss-120b"]);
  const ROUTER_MODELS = Object.freeze([
    ...GROQ_MODELS,
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "@cf/google/gemma-4-26b-a4b-it"
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

  const trimNeedsImage = (facts, candidates) => {
    const trim = clean(facts?.trim);
    if (trim && candidates.some((candidate) => key(candidate.label) === key(trim))) return false;
    // Appearance/dealer descriptions need visual clues; an explicitly named
    // equipment grade can be compared in text without paying for an image.
    return (
      !trim ||
      /\b(?:other|unknown|unspecified|edition|appearance|package|full\s*option|fully\s*loaded|special|black|white|night|shadow|chrome|custom|modified)\b/i.test(
        trim
      )
    );
  };

  const trimChoiceFromAnswer = (analysis, candidates) => {
    const named = clean(analysis?.recommendedTrim || analysis?.closestTrim || analysis?.trim);
    if (named) {
      const exact = candidates.filter((candidate) => key(candidate.label) === key(named));
      if (exact.length === 1) return exact[0];
    }
    const phrase = (value) =>
      clean(value, 1600)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    const answer = phrase(analysis?.reason);
    if (/\b(?:not recommend|no recommendation|cannot recommend|unable to recommend)\b/.test(answer))
      return null;
    if (
      !/\b(?:closest|best matching|recommend|associated with|equivalent|corresponds to)\b/.test(
        answer
      )
    )
      return null;
    const mentioned = candidates.filter((candidate) => {
      const label = phrase(candidate.label);
      return (
        ` ${answer} `.includes(` ${label} `) &&
        !new RegExp(`\\b(?:not|never|avoid|exclude|reject) (?:the )?${label}\\b`).test(answer)
      );
    });
    const choices = mentioned.filter(
      (candidate) =>
        !mentioned.some(
          (other) =>
            other !== candidate &&
            ` ${phrase(other.label)} `.includes(` ${phrase(candidate.label)} `)
        )
    );
    // This reads an explicitly named AI answer, not similarity between a car
    // advertisement and catalog labels. Multiple alternatives are not a choice.
    return choices.length === 1 ? choices[0] : null;
  };

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
    const nonOther = candidates.filter(
      (candidate) =>
        !/\bothers?$/i.test(candidate.label) &&
        !/^other(?:\s+(?:model|trim))?$/i.test(candidate.label)
    );
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
        ? ["sourceText", "title", "format"]
        : task === "bodyType"
          ? ["make", "model", "title", "year"]
          : task === "color"
            ? ["color", "make", "model", "title", "year"]
            : task === "field"
              ? ["context", "field", "make", "model", "reported", "summary", "title", "year"]
              : [
                  "make",
                  "model",
                  "trim",
                  "title",
                  "year",
                  "summary",
                  "context",
                  "specs",
                  "targetMarket",
                  "engine",
                  "cylinders",
                  "fuelType",
                  "drivetrain"
                ];
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
    if (task === "trim" && !input?.requiresImage && !trimNeedsImage(facts, candidates))
      imageUrl = "";
    return Object.freeze({
      candidates,
      facts,
      imageUrl,
      task,
      requiresImage: input?.requiresImage === true || task === "color"
    });
  };

  const parseAnalysis = (payload, input) => {
    const prepared = prepareAnalysis(input);
    if (!ROUTER_MODELS.includes(payload?.model)) {
      throw new Error("The Worker is not using a Luna-approved AI model.");
    }
    const selectedModel = payload.model;
    const provider = GROQ_MODELS.includes(selectedModel)
      ? "groq"
      : selectedModel.startsWith("gemini-")
        ? "gemini"
        : selectedModel.startsWith("@cf/")
          ? "workersai"
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
      confidenceScore <= 1 &&
      confidence === "high" &&
      riskFlags.length === 0 &&
      (!prepared.requiresImage || payload?.imageUsed === true) &&
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
      : prepared.task === "trim"
        ? trimChoiceFromAnswer(analysis, prepared.candidates)
        : null;
    if (!candidateId && prepared.task !== "trim") {
      throw new Error(`Groq did not choose a live ${prepared.task} candidate.`);
    }
    if (candidateId && !candidate) {
      throw new Error("Groq selected a value outside the live Ayshei catalog.");
    }
    const rawComparison = analysis?.trimComparison;
    const trimComparison =
      rawComparison && typeof rawComparison === "object"
        ? {
            basis: clean(rawComparison.basis, 60),
            matchedSpecifications: Array.isArray(rawComparison.matchedSpecifications)
              ? rawComparison.matchedSpecifications
                  .map((value) => clean(value, 240))
                  .filter(Boolean)
                  .slice(0, 8)
              : [],
            materialDifferences: Array.isArray(rawComparison.materialDifferences)
              ? rawComparison.materialDifferences.map((value) => clean(value, 240)).slice(0, 8)
              : null,
            uncertainties: Array.isArray(rawComparison.uncertainties)
              ? rawComparison.uncertainties.map((value) => clean(value, 240)).slice(0, 8)
              : null,
            explanation: clean(rawComparison.explanation, 800)
          }
        : null;
    const sourceTrim = key(prepared.facts.trim);
    const exactTrim = Boolean(
      candidate &&
        sourceTrim &&
        !["other", "othertrim", "unknown", "na"].includes(sourceTrim) &&
        (sourceTrim === key(candidate.label) ||
          (["std", "standard"].includes(sourceTrim) &&
            ["std", "standard"].includes(key(candidate.label))))
    );
    const supportedTrim =
      prepared.task !== "trim" ||
      exactTrim ||
      Boolean(
        trimComparison?.basis === "vehicle-specification" &&
          trimComparison.matchedSpecifications.length > 0 &&
          trimComparison.materialDifferences?.length === 0 &&
          trimComparison.uncertainties?.length === 0 &&
          trimComparison.explanation.length >= 20
      );
    const explanation = trimComparison?.explanation || clean(analysis?.reason, 1200);
    const invalidTrimBasis =
      (trimComparison?.basis && trimComparison.basis !== "vehicle-specification") ||
      /\b(?:first (?:catalog |available )?(?:choice|option)|nearest label|alphabetical|word overlap|word similarity|spelling similarity|list position)\b/i.test(
        explanation
      );
    // A real provider may return a reason without our optional comparison
    // object. Do not throw away its closed-catalog recommendation merely
    // because that metadata is missing or confidence is below exact-match rules.
    const trimRecommendationEligible = Boolean(
      prepared.task === "trim" && candidate && Boolean(explanation) && !invalidTrimBasis
    );
    return Object.freeze({
      bodyType: null,
      candidate: candidate || null,
      confidence,
      confidenceScore,
      autoFillEligible: Boolean(candidate && autoFillEligible && supportedTrim),
      trimRecommendationEligible,
      exact: prepared.task === "trim" ? exactTrim : Boolean(candidate && analysis?.exact === true),
      imageUsed: payload?.imageUsed === true,
      imageWarning: clean(payload?.imageWarning, 180),
      model: selectedModel,
      provider,
      riskFlags,
      reason: clean(analysis?.reason, prepared.task === "trim" ? 1200 : 180),
      trimComparison,
      requiresReview: Boolean(candidate)
    });
  };

  // Constrain the answer at generation time, rather than hoping JSON mode
  // includes the comparison fields or a usable live-catalog identifier.
  const trimResponseFormat = (input) => {
    const prepared = prepareAnalysis(input);
    const strings = { type: "array", items: { type: "string" } };
    const comparison = {
      basis: { type: "string", enum: ["vehicle-specification"] },
      matchedSpecifications: strings,
      materialDifferences: strings,
      uncertainties: strings,
      explanation: { type: "string" }
    };
    const properties = {
      candidateId: { type: "string", enum: prepared.candidates.map((candidate) => candidate.id) },
      exact: { type: "boolean" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      confidenceScore: { type: "number" },
      reason: { type: "string" },
      riskFlags: strings,
      trimComparison: {
        type: "object",
        additionalProperties: false,
        properties: comparison,
        required: Object.keys(comparison)
      }
    };
    return {
      type: "json_schema",
      json_schema: {
        name: "luna_trim_recommendation",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties,
          required: Object.keys(properties)
        }
      }
    };
  };

  const cacheKey = (input) => {
    const prepared = prepareAnalysis(input);
    return JSON.stringify({
      candidates: prepared.candidates,
      facts: prepared.facts,
      imageUrl: prepared.imageUrl,
      requiresImage: prepared.requiresImage,
      task: prepared.task
    });
  };

  // Successful evidence is memory-only, bounded, and invalidated on settings changes.
  // Each caller owns its cancellation; a shared request stops after its last caller leaves.
  const createRequestPool = ({
    now = Date.now,
    ttlMs = 600000,
    maxEntries = 128,
    maxActive = 3
  } = {}) => {
    const cache = new Map();
    const pending = new Map();
    const consumers = new Map();
    const earlyCancellations = new Map();
    const cancelled = () =>
      Object.assign(new Error("AI request cancelled or timed out."), { name: "AbortError" });
    const cancel = (id) => {
      if (consumers.has(id)) consumers.get(id)();
      else {
        earlyCancellations.set(id, now());
        while (earlyCancellations.size > maxEntries)
          earlyCancellations.delete(earlyCancellations.keys().next().value);
      }
    };
    return {
      cancel,
      clear() {
        cache.clear();
        for (const release of consumers.values()) release();
      },
      async run(key, id, timeoutMs, work) {
        const early = earlyCancellations.get(id);
        earlyCancellations.delete(id);
        if (early !== undefined && now() - early < 60000) throw cancelled();
        if (timeoutMs < 800) throw cancelled();
        const saved = cache.get(key);
        if (saved && now() - saved.at < ttlMs) return saved.value;
        cache.delete(key);
        let entry = pending.get(key);
        if (!entry) {
          if (pending.size >= maxActive) throw new Error("Luna AI is busy. Try again shortly.");
          const controller = new AbortController();
          const deadline = now() + Math.min(14500, timeoutMs);
          entry = { controller, clients: new Set(), deadline };
          pending.set(key, entry);
          entry.promise = Promise.resolve()
            .then(() =>
              work({
                signal: controller.signal,
                deadline,
                remaining: () => Math.max(0, deadline - now())
              })
            )
            .then((value) => {
              if (
                !controller.signal.aborted &&
                (value.autoFillEligible || value.trimRecommendationEligible)
              ) {
                cache.set(key, { at: now(), value });
                while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
              }
              return value;
            })
            .finally(() => {
              if (pending.get(key) === entry) pending.delete(key);
            });
        }
        return new Promise((resolve, reject) => {
          entry.clients.add(id);
          const release = () => {
            clearTimeout(timer);
            consumers.delete(id);
            entry.clients.delete(id);
            if (!entry.clients.size) {
              entry.controller.abort();
              if (pending.get(key) === entry) pending.delete(key);
            }
          };
          const timer = setTimeout(
            () => {
              release();
              reject(cancelled());
            },
            Math.min(timeoutMs, entry.deadline - now())
          );
          consumers.set(id, () => {
            release();
            reject(cancelled());
          });
          entry.promise.then(
            (value) => {
              release();
              resolve(value);
            },
            (error) => {
              release();
              reject(error);
            }
          );
        });
      }
    };
  };

  return Object.freeze({
    BODY_TYPES,
    GROQ_MODELS,
    MODEL,
    ROUTER_MODELS,
    cacheKey,
    createRequestPool,
    parseAnalysis,
    trimResponseFormat,
    trimNeedsImage,
    prepareAnalysis,
    prepareCandidates
  });
})();
