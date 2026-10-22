const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const context = { URL };
vm.runInNewContext(read("src/services/ai/groq-core.js"), context);
vm.runInNewContext(read("src/features/work-queue/vehicle-detail-core.js"), context);
const core = context.LunaGroqCore;
const input = {
  task: "trim",
  facts: {
    make: "Cadillac",
    model: "XT6",
    trim: "Black Edition",
    year: "2022",
    specs: "Korean",
    engine: "3.6L V6"
  },
  candidates: [
    { id: "luxury", label: "LUXURY" },
    { id: "sport", label: "SPORT" }
  ]
};
const parse = (analysis, request = input) =>
  core.parseAnalysis(
    {
      model: "qwen/qwen3.8-27b",
      analysis: { confidence: "high", confidenceScore: 0.99, riskFlags: [], ...analysis }
    },
    request
  );
const comparison = {
  basis: "vehicle-specification",
  matchedSpecifications: [
    "Supplied drivetrain and distinguishing equipment match the candidate's grade"
  ],
  materialDifferences: [],
  uncertainties: [],
  explanation:
    "The candidate matches the supplied mechanical specification and distinguishing grade equipment."
};

const reportedReason =
  "Page facts.trim is 'Black Edition'. While not an exact match to the candidates, 'Black Edition' is a styling package typically associated with the 'SPORT' trim in Cadillac's lineup.";
test("the reported real provider answer fills its named catalog trim without comparison metadata", () => {
  for (const candidateId of ["sport", null]) {
    const result = parse({
      candidateId,
      confidence: "low",
      confidenceScore: 0.49,
      reason: reportedReason
    });
    assert.equal(result.candidate.id, "sport");
    assert.equal(result.trimRecommendationEligible, true);
    assert.equal(result.autoFillEligible, false);
    assert.equal(result.reason, reportedReason);
  }
  assert.equal(
    parse({
      candidateId: null,
      reason: "The closest trim might be SPORT or LUXURY; no recommendation was chosen."
    }).candidate,
    null
  );
  assert.equal(
    parse({ candidateId: null, reason: "Do not recommend SPORT for this vehicle." }).candidate,
    null
  );
  assert.throws(
    () => parse({ candidateId: "invented", reason: reportedReason }),
    /outside the live/
  );
});

test("trim requests use text for named grades and images for ambiguous appearance/dealer editions", () => {
  const imageUrl = "https://dbz-images.dubizzle.com/car.jpg";
  assert.equal(core.prepareAnalysis({ ...input, imageUrl }).imageUrl, imageUrl);
  for (const trim of ["Black Edition", "Full Option", "Other", ""]) {
    assert.equal(
      core.prepareAnalysis({ ...input, imageUrl, facts: { ...input.facts, trim } }).imageUrl,
      imageUrl
    );
  }
  for (const trim of ["LUXURY", "Premium Luxury AWD", "LE"]) {
    assert.equal(
      core.prepareAnalysis({ ...input, imageUrl, facts: { ...input.facts, trim } }).imageUrl,
      ""
    );
  }
  assert.equal(core.prepareAnalysis({ ...input, task: "color", imageUrl }).imageUrl, imageUrl);
});

test("model discovery includes common word-spacing aliases without an unbounded search", () => {
  const terms = context.LunaVehicleDetailCore.modelSearchTerms({
    title: "Toyota LandCruiser 2022",
    facts: {
      make: { value: "Toyota" },
      model: { value: "LandCruiser" }
    }
  });
  assert.ok(terms.some((term) => term.toLowerCase() === "toyota land cruiser"));
  assert.ok(terms.some((term) => term.toLowerCase() === "toyota landcruiser"));
  assert.ok(terms.length <= 7);
});

test("a confident claim or exact flag cannot turn Black Edition into Luxury without specification evidence", () => {
  for (const exact of [true, false]) {
    const result = parse({ candidateId: "luxury", exact, reason: "Nearest label" });
    assert.equal(result.autoFillEligible, false);
    assert.equal(result.trimRecommendationEligible, false);
  }
  for (const candidates of [input.candidates, [...input.candidates].reverse()]) {
    assert.equal(
      context.LunaVehicleDetailCore.fallbackTrim(candidates, {
        title: "Cadillac XT6 Black Edition",
        facts: { trim: { value: "Black Edition" } },
        context: "A luxury SUV with premium equipment"
      }),
      null,
      "Neither words nor catalog order establishes a grade"
    );
  }
});

test("closest specification-based trims remain recommendations when facts are uncertain", () => {
  for (const candidates of [input.candidates, [...input.candidates].reverse()]) {
    const result = parse(
      {
        candidateId: "sport",
        confidence: "low",
        confidenceScore: 0.45,
        trimComparison: {
          ...comparison,
          materialDifferences: ["Available grade has different equipment"],
          uncertainties: ["Underlying Black Edition equipment is not verified"]
        }
      },
      { ...input, candidates }
    );
    assert.equal(result.candidate.id, "sport");
    assert.equal(result.autoFillEligible, false);
    assert.equal(result.trimRecommendationEligible, true);
    assert.equal(result.exact, false);
  }
  assert.equal(
    parse({
      candidateId: "sport",
      trimComparison: {
        ...comparison,
        basis: "word-similarity"
      }
    }).trimRecommendationEligible,
    false
  );
});

test("missing grade equipment must lower certainty without forcing AI to invent matched specifications", () => {
  const result = parse({
    candidateId: "sport",
    confidence: "low",
    confidenceScore: 0.4,
    trimComparison: {
      ...comparison,
      matchedSpecifications: [],
      uncertainties: ["No confirmed equipment-grade specification"]
    }
  });
  assert.equal(result.trimRecommendationEligible, true);
  assert.equal(result.autoFillEligible, false);
  assert.equal(result.trimComparison.matchedSpecifications.length, 0);
  const format = core.trimResponseFormat(input);
  assert.equal(format.type, "json_schema");
  assert.equal(format.json_schema.strict, true);
  const schema = format.json_schema.schema;
  assert.deepEqual(Array.from(schema.properties.candidateId.enum), ["luxury", "sport"]);
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes("trimComparison"));
  assert.equal(schema.properties.trimComparison.additionalProperties, false);
  assert.ok(schema.properties.trimComparison.required.includes("uncertainties"));
});

test("supported AI vehicle equivalence can be accepted, but missing evidence or material differences cannot", () => {
  assert.equal(parse({ candidateId: "sport", trimComparison: comparison }).autoFillEligible, true);
  for (const changed of [
    { uncertainties: ["Underlying grade is unknown"] },
    { materialDifferences: ["Engine or drivetrain differs"] },
    { matchedSpecifications: [] },
    { basis: "word-similarity" },
    { explanation: "" },
    { uncertainties: undefined }
  ]) {
    assert.equal(
      parse({ candidateId: "sport", trimComparison: { ...comparison, ...changed } })
        .autoFillEligible,
      false
    );
  }
  assert.equal(
    parse({ candidateId: "sport", confidenceScore: 0.8, trimComparison: comparison })
      .autoFillEligible,
    false
  );
  assert.equal(
    parse({ candidateId: null, confidence: "low", reason: "Need VIN or equipment verification" })
      .candidate,
    null
  );
});

test("LE and SE remain distinct; explicit grade matching still works without inference", () => {
  const request = {
    task: "trim",
    facts: { trim: "LE" },
    candidates: [
      { id: "le", label: "LE" },
      { id: "se", label: "SE" }
    ]
  };
  assert.equal(parse({ candidateId: "se", exact: true }, request).autoFillEligible, false);
  assert.equal(parse({ candidateId: "le", exact: true }, request).autoFillEligible, true);
  assert.equal(core.prepareAnalysis(input).facts.engine, "3.6L V6");
  assert.equal(core.prepareAnalysis(input).facts.specs, "Korean");
});

test("related advertisements cannot contribute trim or equipment evidence", () => {
  const source = read("src/features/work-queue/vehicle-detail-page.js");
  const text =
    "Cadillac\nXT6\nCadillac XT6 Black Edition\nTrim\nBlack Edition\nEngine Capacity (cc)\n3500 - 3999 cc\nNo. of Cylinders\n6\nYou May Also Like\nCadillac Escalade Premium Luxury Platinum\nSimilar Cars\nCadillac XT6 Luxury";
  const capture = vm.runInNewContext(source, {
    URL,
    location: new URL("https://uae.dubizzle.com/motors/used-cars/cadillac/xt6/example/"),
    document: {
      title: "Cadillac XT6 Black Edition",
      body: { innerText: text },
      querySelectorAll: () => [],
      querySelector: (s) =>
        s === "main"
          ? { innerText: text }
          : s === "h1"
            ? { textContent: "Cadillac XT6 Black Edition" }
            : null
    }
  });
  assert.equal(capture.facts.trim.value, "Black Edition");
  assert.equal(capture.facts.cylinders.value, "6");
  assert.doesNotMatch(capture.context, /Escalade|Platinum|Luxury/);
});
