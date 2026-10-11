const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const vehicleCoreSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/work-queue/vehicle-detail-core.js"),
  "utf8"
);
const groqCoreSource = fs.readFileSync(
  path.resolve(__dirname, "../src/services/ai/groq-core.js"),
  "utf8"
);
const pageSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/work-queue/vehicle-detail-page.js"),
  "utf8"
);
const context = { JSON, Object, Set, String, TypeError, URL };
context.globalThis = context;
vm.runInNewContext(vehicleCoreSource, context);
vm.runInNewContext(groqCoreSource, context);

const core = context.LunaVehicleDetailCore;
assert.equal(
  core.supportedSite("https://www.dubicars.com/cadillac-escalade-717683.html"),
  "dubicars"
);
assert.equal(
  core.supportedSite("https://dubai.dubizzle.com/motors/used-cars/gac/gs8/example/"),
  "dubizzle"
);
assert.equal(
  core.supportedSite("https://dubai.dubizzle.com/motors/new-cars/mercedes/c300/example/"),
  "dubizzle"
);
assert.equal(core.supportedSite("https://www.dubicars.com/search"), null);
assert.equal(core.normalizeCategory("https://schema.org/UsedCondition"), "USED");
assert.equal(core.normalizeCategory("Export only"), "EXPORT");
assert.equal(core.normalizeCategory("Export"), "");
assert.equal(core.normalizeCategory("For export"), "");
assert.equal(core.isExportOnly("Only for export"), true);
assert.equal(core.isExportOnly("Available for export only"), true);
assert.equal(core.isExportOnly("Can be exported"), false);
assert.equal(core.isExportOnly("Export available"), false);
assert.equal(core.isExportOnly("Not export only"), false);
assert.equal(core.isExportOnly("This vehicle is not available for export only"), false);
assert.equal(core.isExportOnly("No export-only restriction"), false);
assert.equal(core.isExportOnly("Export only is not applicable"), false);
assert.equal(core.mileageNumber("60,000 Km"), 60000);
assert.equal(
  core.resolveCategory({
    facts: {
      category: { value: "Used" },
      mileage: { value: "0 Km" },
      targetMarket: { value: "UAE (can be exported)" }
    }
  }),
  "NEW"
);
assert.equal(
  core.resolveCategory({
    facts: {
      category: { value: "Used" },
      mileage: { value: "6 Km" },
      targetMarket: { value: "UAE (can be exported)" }
    }
  }),
  "NEW"
);
assert.equal(
  core.resolveCategory({
    facts: {
      category: { value: "Used" },
      mileage: { value: "80 Km" },
      targetMarket: { value: "UAE (can be exported)" }
    }
  }),
  "NEW"
);
assert.equal(
  core.resolveCategory({
    facts: {
      category: { value: "New" },
      mileage: { value: "81 Km" },
      targetMarket: { value: "UAE (can be exported)" }
    }
  }),
  "USED"
);
assert.equal(core.resolveCategory({ facts: { category: { value: "Used" } } }), "USED");
assert.equal(core.resolveCategory({ facts: { category: { value: "New" } } }), "NEW");
assert.equal(
  core.resolveCategory({
    description: "This UAE vehicle can be exported.",
    facts: { category: { value: "Used" }, mileage: { value: "60,000 Km" } }
  }),
  "USED"
);
assert.equal(
  core.resolveCategory({
    description: "This vehicle is not export only.",
    facts: { mileage: { value: "80 Km" } }
  }),
  "NEW"
);
assert.equal(
  core.resolveCategory({
    context: "No export-only restriction applies.",
    facts: { mileage: { value: "81 Km" } }
  }),
  "USED"
);
assert.equal(
  core.resolveCategory({
    description: "This vehicle is available for export only.",
    facts: { mileage: { value: "5 Km" }, targetMarket: { value: "UAE" } }
  }),
  "EXPORT"
);
assert.equal(
  core.resolveCategory({
    description: "Brand new car, export options available.",
    facts: { mileage: { value: "5 Km" } }
  }),
  "NEW"
);
assert.equal(
  core.resolveCategory({
    context: "Related cars: export only Land Cruiser",
    facts: { mileage: { value: "6000 Km" } }
  }),
  "USED"
);
assert.equal(
  core.resolveCategory({
    facts: { mileage: { value: "5 Km" }, targetMarket: { value: "Export only" } }
  }),
  "EXPORT"
);
assert.equal(
  core.resolveCategory({
    facts: {
      category: { value: "New" },
      mileage: { value: "5 Km" },
      targetMarket: { value: "Export only" }
    }
  }),
  "EXPORT"
);
assert.equal(
  core.resolveCategory({
    title: "ONLY FOR EXPORT - Toyota Land Cruiser",
    facts: { mileage: { value: "5 Km" } }
  }),
  "EXPORT"
);
assert.equal(
  core.resolveCategory({ facts: { category: { value: "Export" }, mileage: { value: "81 Km" } } }),
  "USED"
);
assert.equal(core.normalizeTransmission("Automatic Transmission"), "AUTOMATIC");
assert.equal(core.normalizeSpecs("GCC Specs"), "GCC");
assert.equal(core.normalizeSpecs("Other"), "Other");
assert.equal(core.normalizeSpecs("Other Regional Specs"), "Other");
assert.equal(core.normalizeSpecs("Southern market"), "");
assert.equal(core.normalizeColor("Gray"), "Grey");
assert.equal(core.normalizeColor("Champagne Gold"), "Other");
assert.equal(core.normalizeColor("Other"), "Other");
assert.equal(core.normalizeColor(""), "");
assert.equal(core.isPlainGreen("Green"), true);
assert.equal(core.isPlainGreen("Dark Green"), false);
assert.equal(
  core.proposalFromCapture({ facts: { color: { value: "Champagne Gold" } } }).color,
  "Other"
);
assert.equal(core.proposalFromCapture({ facts: { specs: { value: "Other" } } }).specs, "Other");
assert.equal(
  core.proposalFromCapture({ description: "Japanese specs", facts: {} }).specs,
  "Japanese"
);
assert.equal(
  core.proposalFromCapture({ description: "No regional specifications mentioned", facts: {} })
    .specs,
  ""
);
assert.deepEqual(JSON.parse(JSON.stringify(core.proposalFromCapture({ facts: {} }))), {
  category: "",
  color: "",
  specs: "",
  transmission: ""
});

const models = [
  { label: "Cadillac Escalade", make: "Cadillac", makeCode: 1, model: "Escalade", modelCode: 2 },
  {
    label: "Cadillac Escalade IQ",
    make: "Cadillac",
    makeCode: 1,
    model: "Escalade IQ",
    modelCode: 3
  }
];
assert.equal(core.exactModel(models, "Cadillac", "Escalade").modelCode, 2);
assert.equal(core.exactTrim([{ label: "PLATINUM", trimCode: 9 }], "platinum").trimCode, 9);
assert.equal(
  core.exactTrim(
    [
      { label: "BASE", trimCode: 4 },
      { label: "BASE", trimCode: 5 }
    ],
    "BASE"
  ).trimCode,
  4
);
assert.equal(
  core.modelFromEvidence(models, { title: "Used Cadillac Escalade 2016 for sale" }).modelCode,
  2
);
const toyotaModels = [
  { label: "Toyota 4Runner", make: "Toyota", makeCode: 10, model: "4Runner", modelCode: 40 },
  {
    label: "Toyota Land Cruiser",
    make: "Toyota",
    makeCode: 10,
    model: "Land Cruiser",
    modelCode: 41
  },
  {
    label: "Toyota Land Cruiser Prado",
    make: "Toyota",
    makeCode: 10,
    model: "Land Cruiser Prado",
    modelCode: 42
  }
];
assert.equal(
  core.rankModelCandidates(toyotaModels, {
    facts: { make: { value: "Toyota" }, model: { value: "Land Cruiser" } },
    title: "Toyota Land Cruiser 2024"
  })[0].modelCode,
  41
);
assert.deepEqual(
  core
    .rankModelCandidates(toyotaModels, {
      facts: { make: { value: "Toyota" }, model: { value: "Land Cruiser" } },
      title: "Toyota Land Cruiser 2024"
    })
    .map((model) => model.modelCode),
  [41]
);
assert.equal(
  core.rankModelCandidates(toyotaModels, {
    facts: { make: { value: "Toyota" }, model: { value: "Landcruiser" } },
    title: "Toyota Landcruiser 2024"
  })[0].modelCode,
  41
);
assert.equal(
  core.rankModelCandidates([toyotaModels[0]], {
    facts: { make: { value: "Toyota" }, model: { value: "Land Cruiser" } },
    title: "Toyota Land Cruiser 2024"
  }).length,
  0
);
assert.equal(
  core.rankModelCandidates([toyotaModels[0]], {
    facts: { make: { value: "Toyota" }, model: { value: "Land Cruiser" } },
    title: "Toyota 4Runner 2024"
  }).length,
  0
);
assert.equal(
  core.rankModelCandidates([toyotaModels[0]], {
    title: "Toyota Land Cruiser 2024",
    sourceUrl: "https://example.com/toyota-4runner"
  }).length,
  0
);
assert.equal(
  core.rankModelCandidates(
    [
      {
        label: "Toyota Land Cruiser",
        make: "Toyota",
        makeCode: 10,
        model: "LandCruiser",
        modelCode: 41
      }
    ],
    { facts: { make: { value: "Toyota" }, model: { value: "Land Cruiser" } } }
  )[0].modelCode,
  41
);
assert.equal(
  core.rankModelCandidates(toyotaModels, {
    facts: { model: { value: "Land Cruiser" } },
    title: "Toyota Land Cruiser 2024"
  })[0].modelCode,
  41
);
assert.deepEqual(
  core
    .sameMakeModels(
      [
        ...toyotaModels,
        { label: "Honda Accord", make: "Honda", makeCode: 20, model: "Accord", modelCode: 21 }
      ],
      { facts: { make: { value: "Toyota" } } }
    )
    .map((model) => model.make),
  ["Toyota", "Toyota", "Toyota"]
);
assert.equal(
  core.sameMakeModels([{ label: "Honda Accord", make: "Honda", model: "Accord" }], {
    facts: { make: { value: "Toyota" } },
    title: "Toyota Land Cruiser"
  }).length,
  0
);
assert.equal(core.sameMakeModels(toyotaModels, { title: "Toyota Land Cruiser 2024" }).length, 3);
assert.equal(
  core.nearestModelCandidates([toyotaModels[0]], {
    facts: { make: { value: "Toyota" }, model: { value: "Land Cruiser" } },
    title: "Toyota Land Cruiser 2024"
  })[0].modelCode,
  40
);
assert.equal(
  core.modelFromEvidence(
    [{ label: "Mercedes C250", make: "Mercedes", makeCode: 3, model: "C250", modelCode: 4 }],
    { facts: { make: { value: "Mercedes Benz" }, model: { value: "C250" } } }
  ).modelCode,
  4
);
assert.equal(
  core.modelFromEvidence(
    [{ label: "Mercedes C250", make: "Mercedes", makeCode: 3, model: "C250", modelCode: 4 }],
    { title: "Excellent deal for our Mercedes Benz C250 Coupe" }
  ).modelCode,
  4
);
assert.equal(
  core.modelFromEvidence(
    [{ label: "BMW 210i", make: "BMW", makeCode: 7, model: "210i", modelCode: 8 }],
    { title: "BMW 2 210i in excellent condition" }
  ).modelCode,
  8
);
assert.equal(core.canonicalMake("Mercedec Benz"), "mercedes");
const mercedesCandidates = [
  { label: "Mercedes C-Class", make: "Mercedes", makeCode: 44, model: "C-Class", modelCode: 0 },
  { label: "Mercedes C300", make: "Mercedes", makeCode: 44, model: "C300", modelCode: 703 }
];
const mercedesCapture = {
  facts: { make: { value: "Mercedes-Benz" }, model: { value: "C-Class" } },
  title: "Mercedes-Benz C-Class C300"
};
assert.equal(core.rankModelCandidates(mercedesCandidates, mercedesCapture)[0].modelCode, 703);
assert.equal(core.modelFromEvidence(mercedesCandidates, mercedesCapture).modelCode, 703);
const bmwCandidates = [
  { label: "BMW 3-Series", make: "BMW", makeCode: 7, model: "3-Series", modelCode: 0 },
  { label: "BMW 330i", make: "BMW", makeCode: 7, model: "330i", modelCode: 40 }
];
assert.equal(
  core.rankModelCandidates(bmwCandidates, { title: "BMW 3-Series 330i xDrive" })[0].modelCode,
  40
);
const bmw318Candidates = [
  { label: "BMW 3", make: "BMW", makeCode: 7, model: "3", modelCode: 30 },
  { label: "BMW 318i", make: "BMW", makeCode: 7, model: "318i", modelCode: 318 }
];
const bmw318Capture = {
  facts: { make: { value: "BMW" }, model: { value: "3 Series" }, trim: { value: "Sport" } },
  title: "BMW 3 Series 318i Sport"
};
assert.equal(core.rankModelCandidates(bmw318Candidates, bmw318Capture)[0].modelCode, 318);
assert.equal(
  core.selectTrimAwareModel(
    [
      { model: bmw318Candidates[0], trims: [{ label: "BASE", trimCode: 1 }] },
      { model: bmw318Candidates[1], trims: [{ label: "SPORT", trimCode: 2 }] }
    ],
    bmw318Capture,
    bmw318Candidates[0]
  ).model.modelCode,
  318
);
const lexusCandidates = [
  { label: "Lexus RX-Series", make: "Lexus", makeCode: 31, model: "RX-Series", modelCode: 100 },
  { label: "Lexus RX350", make: "Lexus", makeCode: 31, model: "RX350", modelCode: 350 }
];
const lexusCapture = {
  facts: { make: { value: "Lexus" }, model: { value: "RX-Series" }, trim: { value: "F Sport" } },
  title: "Lexus RX-Series RX 350 F Sport"
};
assert.equal(core.rankModelCandidates(lexusCandidates, lexusCapture)[0].modelCode, 350);
assert.equal(
  core.selectTrimAwareModel(
    [
      { model: lexusCandidates[0], trims: [{ label: "STD", trimCode: 10 }] },
      { model: lexusCandidates[1], trims: [{ label: "F SPORT", trimCode: 11 }] }
    ],
    lexusCapture,
    lexusCandidates[0]
  ).model.modelCode,
  350
);
const mercedesGlcCandidates = [
  { label: "Mercedes GLC", make: "Mercedes", makeCode: 44, model: "GLC", modelCode: 500 },
  {
    label: "Mercedes GLC 300 AMG",
    make: "Mercedes",
    makeCode: 44,
    model: "GLC 300 AMG",
    modelCode: 501
  }
];
assert.equal(
  core.rankModelCandidates(mercedesGlcCandidates, { title: "Mercedes GLC300 AMG" })[0].modelCode,
  501
);
assert.equal(
  core.nearestModelCandidates(
    [
      { label: "Lexus RX300", make: "Lexus", makeCode: 31, model: "RX300", modelCode: 300 },
      { label: "Lexus LX600", make: "Lexus", makeCode: 31, model: "LX600", modelCode: 600 }
    ],
    { facts: { make: { value: "Lexus" }, model: { value: "RX 320" } }, title: "Lexus RX 320" }
  )[0].modelCode,
  300
);
assert.equal(
  core.selectTrimAwareModel(
    [
      {
        model: {
          label: "Lexus RX300",
          make: "Lexus",
          makeCode: 31,
          model: "RX300",
          modelCode: 300
        },
        trims: [{ label: "STD", trimCode: 12 }]
      },
      {
        model: {
          label: "Lexus RX400",
          make: "Lexus",
          makeCode: 31,
          model: "RX400",
          modelCode: 400
        },
        trims: [{ label: "F SPORT", trimCode: 13 }]
      }
    ],
    {
      facts: { make: { value: "Lexus" }, model: { value: "RX 320" }, trim: { value: "F Sport" } },
      title: "Lexus RX 320 F Sport"
    }
  ).model.modelCode,
  400
);
const s3 = { label: "Mercedes S3", make: "Mercedes", makeCode: 44, model: "S3", modelCode: 3 };
const s318 = {
  label: "Mercedes S318",
  make: "Mercedes",
  makeCode: 44,
  model: "S318",
  modelCode: 318
};
const sCapture = {
  facts: { make: { value: "Mercedes Benz" } },
  title: "Mercedes Benz S3 S318 Premium"
};
const trimAware = core.selectTrimAwareModel(
  [
    { model: s3, trims: [] },
    { model: s318, trims: [{ label: "PREMIUM", trimCode: 91 }] }
  ],
  sCapture,
  s3
);
assert.equal(trimAware.model.modelCode, 318);
assert.equal(
  core.fallbackTrim(
    [
      { label: "STD", trimCode: 1 },
      { label: "XDRIVE GT SPORT", trimCode: 2 }
    ],
    { title: "BMW 3-Series 330i xDrive" }
  ).trimCode,
  2
);
assert.equal(
  core.fallbackTrim([{ label: "Other", trimCode: 1000001 }], { title: "Unknown trim" }).trimCode,
  1000001
);
assert.equal(
  core.trimFromEvidence(
    [
      { label: "Other", trimCode: 1 },
      { label: "PLATINUM", trimCode: 9 }
    ],
    { context: "The Platinum trim includes premium leather." }
  ),
  null
);
assert.equal(
  core.trimFromEvidence(
    [
      { label: "M SPORT", trimCode: 8 },
      { label: "STD", trimCode: 10 }
    ],
    { facts: { trim: { value: "Standard" } } }
  ).trimCode,
  10
);
assert.equal(
  core.trimFromEvidence(
    [
      { label: "M SPORT", trimCode: 8 },
      { label: "STD", trimCode: 10 }
    ],
    { facts: { trim: { value: "Other Trim" } } }
  ),
  null
);
assert.equal(
  core.trimFromEvidence([{ label: "M SPORT", trimCode: 8 }], {
    facts: { trim: { value: "Other" } }
  }),
  null
);
assert.equal(
  core.trimFromEvidence(
    [
      { label: "BASE", trimCode: 4 },
      { label: "PREMIUM", trimCode: 5 }
    ],
    { facts: { trim: { value: "BASE" } }, context: "Premium leather package" }
  ).trimCode,
  4
);
assert.equal(
  core.trimFromEvidence(
    [
      { label: "BASE", trimCode: 4 },
      { label: "PREMIUM", trimCode: 5 }
    ],
    { summary: "Premium equipment", title: "Example vehicle BASE" }
  ).trimCode,
  4
);
assert.ok(
  core
    .modelSearchTerms({ title: "Used Cadillac Escalade 2016 for sale in Dubai" })
    .some((term) => term.toLowerCase() === "cadillac escalade")
);
const importAnalysis = core.analyzeImport({
  ads: [
    { source: { adName: "Same", url: "https://www.dubicars.com/a-1.html" } },
    { source: { adName: "same", url: "https://www.dubicars.com/a-1.html" } },
    { source: { adName: "Different", url: "https://example.com/ad" } }
  ],
  invalidLines: [4]
});
assert.deepEqual(JSON.parse(JSON.stringify(importAnalysis)), {
  duplicateNameRows: 1,
  duplicateUrlRows: 1,
  invalidRows: 1,
  sites: { dubicars: 2, dubizzle: 0, other: 1 },
  totalRows: 3
});

const groqInput = {
  candidates: [{ id: "1:2", label: "Cadillac Escalade" }],
  facts: {
    context: "6.2L engine · 4WD · Contact +971 50 123 4567",
    make: "Cadillac",
    model: "Escalade",
    summary: "Details at https://vendor.example and sales@vendor.example",
    title: "2016 Cadillac Escalade"
  },
  task: "model"
};
const prepared = context.LunaGroqCore.prepareAnalysis(groqInput);
assert.match(prepared.facts.context, /6\.2L engine/);
assert.doesNotMatch(JSON.stringify(prepared), /vendor\.example|sales@|971 50/);
const resolved = context.LunaGroqCore.parseAnalysis(
  {
    analysis: {
      candidateId: "1:2",
      confidence: "high",
      exact: true,
      reason: "Exact make and model"
    },
    imageUsed: true,
    model: "qwen/qwen3.8-27b"
  },
  groqInput
);
assert.equal(resolved.candidate.id, "1:2");
assert.equal(resolved.requiresReview, true);
assert.equal(
  resolved.autoFillEligible,
  false,
  "Missing confidence metadata must never authorize Auto Fill"
);
const geminiResolved = context.LunaGroqCore.parseAnalysis(
  {
    analysis: {
      candidateId: "1:2",
      confidence: "high",
      confidenceScore: 0.94,
      riskFlags: [],
      exact: true
    },
    model: "gemini-3.8-flash"
  },
  groqInput
);
assert.equal(geminiResolved.provider, "gemini");
assert.equal(geminiResolved.confidenceScore, 0.94);
assert.equal(geminiResolved.autoFillEligible, true);
for (const [model, provider] of [
  ["gemini-3.5-flash-lite", "gemini"],
  ["google/gemma-4-26b-a4b-it:free", "openrouter"],
  ["nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "openrouter"]
]) {
  const result = context.LunaGroqCore.parseAnalysis(
    {
      analysis: { candidateId: "1:2", confidence: "high", confidenceScore: 0.95, riskFlags: [] },
      model
    },
    groqInput
  );
  assert.equal(result.provider, provider);
  assert.equal(result.autoFillEligible, true);
}
const uncertainResolved = context.LunaGroqCore.parseAnalysis(
  {
    analysis: {
      candidateId: "1:2",
      confidence: "medium",
      confidenceScore: 0.84,
      riskFlags: ["trim_uncertain"],
      exact: false
    },
    model: "gemini-3.8-flash"
  },
  groqInput
);
assert.equal(uncertainResolved.autoFillEligible, false);
assert.throws(
  () =>
    context.LunaGroqCore.parseAnalysis(
      {
        analysis: { candidateId: "1:2", confidence: "high" },
        model: "unapproved/model"
      },
      groqInput
    ),
  /Luna-approved AI model/
);
assert.throws(
  () =>
    context.LunaGroqCore.parseAnalysis(
      {
        analysis: { candidateId: "invented", confidence: "high", exact: true, reason: "" },
        model: "qwen/qwen3.8-27b"
      },
      groqInput
    ),
  /outside the live Ayshei catalog/
);
assert.throws(
  () =>
    context.LunaGroqCore.parseAnalysis(
      {
        analysis: { candidateId: null, confidence: "low", exact: false, reason: "" },
        model: "qwen/qwen3.8-27b"
      },
      groqInput
    ),
  /did not choose a live model candidate/
);
assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      context.LunaGroqCore.prepareCandidates([
        { id: "other", label: "Other" },
        { id: "std", label: "STD" }
      ])
    )
  ),
  [{ id: "std", label: "STD" }]
);
const inferredFieldAnalysis = context.LunaGroqCore.prepareAnalysis({
  candidates: [
    { id: "grey", label: "Grey" },
    { id: "other", label: "Other" }
  ],
  facts: {
    context: "Exterior color was not displayed in text",
    field: "Exterior Color",
    title: "2026 BYD Sealion 7"
  },
  imageUrl: "https://alwanworld.com/wp-content/uploads/2026/09/1-1024x577.webp",
  task: "field"
});
assert.deepEqual(JSON.parse(JSON.stringify(inferredFieldAnalysis.candidates)), [
  { id: "grey", label: "Grey" },
  { id: "other", label: "Other" }
]);
assert.equal(inferredFieldAnalysis.facts.field, "Exterior Color");
assert.match(inferredFieldAnalysis.imageUrl, /^https:\/\/alwanworld\.com\//);
assert.match(
  context.LunaGroqCore.prepareAnalysis({
    candidates: [{ id: "white", label: "White" }],
    facts: { field: "Exterior Color", title: "2026 Hyundai Palisade" },
    imageUrl: "https://mohamedhakim.com/wp-content/uploads/vehicle.jpeg",
    task: "field"
  }).imageUrl,
  /^https:\/\/mohamedhakim\.com\//
);
const inferredFieldResult = context.LunaGroqCore.parseAnalysis(
  {
    analysis: {
      candidateId: "other",
      confidence: "low",
      exact: false,
      reason: "No exact evidence"
    },
    imageUsed: false,
    model: "qwen/qwen3.8-27b"
  },
  inferredFieldAnalysis
);
assert.equal(inferredFieldResult.candidate.label, "Other");
const greenAnalysis = context.LunaGroqCore.prepareAnalysis({
  candidates: [
    { id: "dark-green", label: "Dark Green" },
    { id: "light-green", label: "Light Green" }
  ],
  facts: { color: "Green", title: "Green SUV" },
  imageUrl: "https://images.dubicars.com/green.jpg",
  task: "color"
});
assert.deepEqual(JSON.parse(JSON.stringify(greenAnalysis.candidates)), [
  { id: "dark-green", label: "Dark Green" },
  { id: "light-green", label: "Light Green" }
]);
assert.deepEqual(JSON.parse(JSON.stringify(greenAnalysis.facts)), {
  color: "Green",
  title: "Green SUV"
});

const structuredVehicle = {
  "@context": "https://schema.org",
  "@type": "Vehicle",
  brand: { name: "GAC" },
  color: "White",
  image: "https://images.example/gs8.jpg",
  itemCondition: "https://schema.org/UsedCondition",
  model: "GS8",
  vehicleModelDate: "2022",
  vehicleTransmission: "Automatic Transmission"
};
const pageContext = {
  JSON,
  Object,
  String,
  document: {
    body: { innerText: "" },
    title: "GAC GS8 listing",
    querySelector(selector) {
      if (selector === "main")
        return {
          innerText:
            "Car Overview\nMake\nGAC\nModel\nGS8\nTrim\n320T i-4WD Turbo\nExterior Color\nWhite\nTarget Market\nGCC Specs\nTransmission\nAutomatic Transmission\nYear\n2022\nSimilar Cars"
        };
      if (selector === "h1") return { textContent: "1,053 P.M • GAC GS8" };
      return null;
    },
    querySelectorAll(selector) {
      return selector === 'script[type="application/ld+json"]'
        ? [{ textContent: JSON.stringify(structuredVehicle) }]
        : [];
    }
  },
  location: {
    href: "https://dubai.dubizzle.com/motors/used-cars/gac/gs8/example/",
    hostname: "dubai.dubizzle.com",
    pathname: "/motors/used-cars/gac/gs8/example/"
  }
};
pageContext.globalThis = pageContext;
const capture = vm.runInNewContext(pageSource, pageContext);
assert.equal(capture.site, "dubizzle");
assert.equal(capture.facts.make.value, "GAC");
assert.equal(capture.facts.model.value, "GS8");
assert.equal(capture.facts.trim.value, "320T i-4WD Turbo");
assert.equal(capture.facts.specs.value, "GCC Specs");
assert.equal(capture.facts.transmission.value, "Automatic Transmission");
assert.doesNotMatch(pageSource, /\bfetch\s*\(|chrome\.storage|sendMessage/);

const newRouteContext = {
  ...pageContext,
  document: { ...pageContext.document, title: "New GAC GS8" },
  location: {
    href: "https://dubai.dubizzle.com/motors/new-cars/gac/gs8/example/",
    hostname: "dubai.dubizzle.com",
    pathname: "/motors/new-cars/gac/gs8/example/"
  }
};
newRouteContext.globalThis = newRouteContext;
const newRouteCapture = vm.runInNewContext(pageSource, newRouteContext);
assert.equal(newRouteCapture.facts.category.value, "New");
assert.equal(newRouteCapture.facts.category.evidence, "Explicit condition route/title");
assert.equal(core.proposalFromCapture(newRouteCapture).category, "NEW");

const dubicarsVehicle = {
  "@context": "https://schema.org",
  "@type": "Vehicle",
  brand: { "@id": "https://www.dubicars.com/new-cars/toyota#brand" },
  itemCondition: "https://schema.org/UsedCondition",
  mileageFromOdometer: { "@type": "QuantitativeValue", unitCode: "KMT", value: "80" },
  model: { "@id": "https://www.dubicars.com/new-cars/toyota/camry#model" },
  vehicleModelDate: "2025"
};
const dubicarsContext = {
  JSON,
  Object,
  String,
  URL,
  document: {
    body: { innerText: "" },
    title: "Used Toyota Camry 2025 for sale",
    querySelector(selector) {
      if (selector === "main")
        return {
          innerText:
            "Car Overview\nTarget Market\nUAE (can be exported)\nDescription\nClean UAE vehicle"
        };
      if (selector === "h1") return { textContent: "2025 Toyota Camry" };
      return null;
    },
    querySelectorAll(selector) {
      return selector === 'script[type="application/ld+json"]'
        ? [{ textContent: JSON.stringify(dubicarsVehicle) }]
        : [];
    }
  },
  location: {
    href: "https://www.dubicars.com/2025-toyota-camry-123456.html",
    hostname: "www.dubicars.com",
    pathname: "/2025-toyota-camry-123456.html"
  }
};
dubicarsContext.globalThis = dubicarsContext;
const dubicarsCapture = vm.runInNewContext(pageSource, dubicarsContext);
assert.equal(dubicarsCapture.facts.make.value, "toyota");
assert.equal(dubicarsCapture.facts.model.value, "camry");
assert.equal(dubicarsCapture.facts.mileage.value, "80");
assert.equal(dubicarsCapture.facts.targetMarket.value, "UAE (can be exported)");
assert.equal(core.proposalFromCapture(dubicarsCapture).category, "NEW");

const fallbackContext = {
  JSON,
  Object,
  String,
  document: {
    body: { innerText: "" },
    title: "Used GAC GS8 in Dubai",
    querySelector(selector) {
      if (selector === "main")
        return {
          innerText:
            "Used Cars\nGAC\nGS8\nGAC GS8 320T i-4WD Turbo\n2022\nGCC Specs\nCar Overview\nTrim\n320T i-4WD Turbo\nExterior Color\nWhite\nTransmission Type\nAutomatic Transmission\nTarget Market\nUAE (can be exported)"
        };
      if (selector === "h1") return { textContent: "Finance offer for GAC GS8" };
      if (selector === 'meta[property="og:title"]') return { content: "Used GAC GS8 in Dubai" };
      return null;
    },
    querySelectorAll() {
      return [];
    }
  },
  location: {
    href: "https://dubai.dubizzle.com/motors/used-cars/gac/gs8/example/",
    hostname: "dubai.dubizzle.com",
    pathname: "/motors/used-cars/gac/gs8/example/"
  }
};
fallbackContext.globalThis = fallbackContext;
const fallbackCapture = vm.runInNewContext(pageSource, fallbackContext);
assert.equal(fallbackCapture.facts.category.value, "Used");
assert.equal(fallbackCapture.facts.make.value, "GAC");
assert.equal(fallbackCapture.facts.model.value, "GS8");
assert.equal(fallbackCapture.facts.specs.value, "GCC Specs");
assert.equal(fallbackCapture.facts.transmission.value, "Automatic Transmission");

const otherSpecsContext = {
  ...fallbackContext,
  document: {
    ...fallbackContext.document,
    querySelector(selector) {
      if (selector === "main")
        return {
          innerText:
            "Used Cars\nGAC\nGS8\nCar Overview\nRegional Specs: Other\nTransmission Type\nAutomatic Transmission"
        };
      if (selector === "h1") return { textContent: "GAC GS8" };
      return null;
    }
  }
};
otherSpecsContext.globalThis = otherSpecsContext;
const otherSpecsCapture = vm.runInNewContext(pageSource, otherSpecsContext);
assert.equal(otherSpecsCapture.facts.specs.value, "Other");
assert.equal(core.proposalFromCapture(otherSpecsCapture).specs, "Other");

console.log("Phase 5 vehicle extraction and constrained Groq tests passed.");
