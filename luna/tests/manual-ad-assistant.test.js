const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const context = {
  Array,
  Date,
  Number,
  Object,
  Set,
  String,
  URL
};
context.globalThis = context;
vm.runInNewContext(read("src/features/manual-ad/manual-ad-core.js"), context);
vm.runInNewContext(read("src/features/manual-ad/manual-ad-price-core.js"), context);
vm.runInNewContext(read("src/features/manual-ad/manual-ad-description-core.js"), context);
const core = context.LunaManualAdCore;
const priceCore = context.LunaManualAdPriceCore;
const descriptionCore = context.LunaManualAdDescriptionCore;

assert.equal(core.parsePrice("AED 105,000"), "105000");
assert.equal(core.parsePrice("2024 Honda · AED 105,000"), "105000");
assert.equal(core.parsePrice("$ 101,400"), "101400");
assert.equal(core.parsePrice("USD 101,400"), "101400");
assert.equal(core.parsePrice("2024"), "");
assert.equal(core.parsePrice("Price on request"), "");
assert.equal(
  priceCore.chooseDisplayedPrice([
    { inPriceContainer: true, text: "$ 101,400" },
    { financing: true, inPriceContainer: true, text: "$ 5,317" }
  ]).match.amount,
  "101400"
);
assert.equal(
  priceCore.chooseDisplayedPrice([
    { inPriceContainer: true, text: "101,400" },
    { inPriceContainer: true, text: "101,400" }
  ]).match.amount,
  "101400"
);
assert.equal(
  priceCore.chooseDisplayedPrice([
    { inPriceContainer: true, text: "$ 101,400" },
    { inPriceContainer: true, text: "$ 99,000" }
  ]).conflicting,
  true
);
assert.equal(
  priceCore.chooseDisplayedPrice([
    {
      context: "Monthly payment | 5 years through bank | 20% down payment",
      inPriceContainer: true,
      text: "4,539 AED"
    },
    {
      context: "PRICE | 289,750 AED | Export options",
      inPriceContainer: true,
      text: "289,750 AED"
    }
  ]).match.amount,
  "289750"
);
assert.equal(priceCore.chooseDisplayedPrice([{ text: "2026" }]).match, null);
assert.equal(core.inferFuel("1.5L turbo gasoline engine"), "Gasoline");
assert.equal(core.inferTransmission("CVT gearbox"), "Automatic");
assert.equal(core.inferBodyType("Sport Cars"), "");
assert.equal(core.inferBodyType("Compact SUV"), "SUV");
assert.equal(core.inferBodyType("SUV/Crossover"), "SUV");
assert.equal(core.inferBodyType("SUV Sedan Hatchback Coupe"), "");
assert.equal(core.inferExteriorColor("Obsidian Black Metallic"), "Black");
assert.equal(core.inferExteriorColor("Pearl White exterior"), "White Pearl");
assert.equal(core.inferExteriorColor("White / Silver / Grey available"), "");
assert.equal(
  core.sanitizeCapture({
    listingName: "MERCEDES GLS450 2025 | BLACK",
    sourceUrl: "https://vendor.test/car"
  }).exteriorColor,
  ""
);
const mergedPanels = core.mergeCaptures([
  {
    description: "First paragraph\n\nSecond paragraph",
    listingName: "2025 Mercedes GLS450 | BLACK",
    sourceUrl: "https://vendor.test/car",
    specs: ["Year: 2025"]
  },
  {
    exteriorColor: "Black",
    kilometers: "9,926",
    specs: ["Year: 2025", "Color: Black"]
  }
]);
assert.equal(mergedPanels.description, "First paragraph\n\nSecond paragraph");
assert.equal(mergedPanels.exteriorColor, "Black");
assert.deepEqual(JSON.parse(JSON.stringify(mergedPanels.specs)), ["Year: 2025", "Color: Black"]);
assert.equal(core.inferYear("New Honda Accord 2024"), "2024");
assert.equal(core.polishDescription("N/A"), "");
assert.equal(core.polishDescription("Seller Notes: not provided"), "");
assert.equal(descriptionCore.placeholderDescription("Seller Notes: N/A"), true);
assert.equal(core.polishDescription("N/A\n\nRelated posts:\n\nNo related posts."), "");
assert.equal(
  descriptionCore.placeholderDescription("N/A\n\nRelated posts:\n\nNo related posts."),
  true
);
assert.equal(core.polishDescription("N/A Related posts: No related posts."), "");
assert.equal(descriptionCore.placeholderDescription("N/A Related posts: No related posts."), true);
assert.equal(
  descriptionCore.chooseDescription([{ headed: true, score: 20, text: "Seller Notes: N/A" }]),
  null
);
assert.equal(
  descriptionCore.chooseDescription([
    { headed: true, score: 20, text: "N/A Related posts: No related posts." }
  ]),
  null
);
const mohamedHakimEmptyDescription =
  "OverviewAbout This Vehicle\n\nN/A\n\nRelated posts:\n\nNo related posts.";
assert.equal(core.polishDescription(mohamedHakimEmptyDescription), "");
assert.equal(descriptionCore.placeholderDescription(mohamedHakimEmptyDescription), true);
assert.equal(
  descriptionCore.chooseDescription([
    { headed: true, score: 30, text: mohamedHakimEmptyDescription }
  ]),
  null
);
assert.equal(
  core.verifiedSpecificationSummary({
    bodyType: "SUV",
    category: "NEW",
    fuelType: "Gasoline",
    makeModel: "Hyundai Palisade",
    specs: ["Engine: 3.5", "Drive: FWD"],
    transmission: "Automatic",
    year: "2026"
  }),
  "2026 Hyundai Palisade, brand new SUV powered by a 3.5L gasoline engine. Features an automatic transmission with front-wheel drive (FWD)."
);
assert.equal(
  core.polishDescription("Description: Clean title\nOne owner"),
  "Clean title\nOne owner"
);
assert.equal(
  core.polishDescription("About this vehicle: Original vendor wording"),
  "About this vehicle: Original vendor wording"
);
assert.equal(
  core.polishDescription("Description:\nFirst  line\n\nSecond line"),
  "First  line\n\nSecond line"
);
assert.equal(
  core.polishDescription("First paragraph\nRead more\n\nSecond paragraph\nREAD LESS"),
  "First paragraph\n\nSecond paragraph"
);
assert.equal(
  core.polishDescription("Verified seller text\n\nHide full description"),
  "Verified seller text"
);
const expectedDubicarsDescription = [
  "Explore the 2026 LC300 VX 4.0L (GCC Specification)",
  "Visit our showroom to discover the latest addition to our lineup.",
  "Showroom Details",
  "- Address: Dubai, Ras Al Khor, Auto Market, No. 301",
  "- Opening Hours: Monday to Saturday, 10:00 AM - 7:00 PM"
].join("\n");
assert.equal(
  descriptionCore.chooseDescription(
    [
      { semantic: true, score: 18, text: "Get the DubiCars app\nExplore more than 30,000 cars." },
      { direct: true, score: 10, text: `${expectedDubicarsDescription}\nSee full description` }
    ],
    { marketplace: true }
  ).text,
  expectedDubicarsDescription
);
assert.equal(
  descriptionCore.chooseDescription(
    [{ semantic: true, score: 18, text: "Get the DubiCars app\nExplore more than 30,000 cars." }],
    { marketplace: true }
  ),
  null
);
assert.equal(core.resolveCategory("Used", "0 KM"), "NEW");
assert.equal(core.resolveCategory("Used", "6 KM"), "NEW");
assert.equal(core.resolveCategory("Used", "80 KM"), "NEW");
assert.equal(core.resolveCategory("Used", "81 KM"), "USED");
assert.equal(core.resolveCategory("Export", "6 KM"), "EXPORT");
assert.equal(core.normalizeRegionalSpec("Import Japan - GCC Specs"), "GCC");
assert.equal(core.normalizeRegionalSpec("Other"), "Other");
const capture = core.sanitizeCapture({
  bodyType: "Sport Cars",
  category: "New",
  description: "Description: Verified vendor text",
  exteriorColor: "White / Silver / Grey available",
  fuelType: "Petrol",
  images: ["https://vendor.test/old-image-that-must-be-ignored.jpg"],
  listingName: "New Honda Accord 2024",
  makeModel: "Honda Accord",
  price: "AED 105,000",
  sourceUrl: "https://vendor.test/?vehicle=105300",
  specs: ["Year: 2024", "Fuel: Gasoline"],
  trim: "EX",
  transmission: "CVT"
});

assert.equal(capture.bodyType, "");
assert.equal(capture.exteriorColor, "");
assert.equal(capture.insured, "No");
assert.equal(capture.regionalSpec, "");
assert.equal(Object.hasOwn(capture, "listingName"), false);
assert.equal(Object.hasOwn(capture, "images"), false);
assert.equal(capture.price, "105000");
assert.equal(capture.transmission, "Automatic");
assert.deepEqual(JSON.parse(JSON.stringify(core.validateDraft(capture).missing)), [
  "Regional Spec",
  "Body Type",
  "Exterior Color",
  "Year (confirm a live Ayshei year)",
  "Make & Model (select a live Ayshei result)",
  "Trim (select a live Ayshei option)"
]);

capture.bodyType = "Sedan";
capture.exteriorColor = "White";
capture.makeCode = 1;
capture.modelCode = 2;
capture.trimCode = 3;
capture.yearCode = 75;
capture.regionalSpec = "GCC";
capture.insured = "No";
assert.equal(core.validateDraft(capture).isReady, true);
capture.images = [];
assert.equal(core.validateDraft(capture).isReady, true);

assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      core.chooseExactModel([{ label: "Honda Accord", makeCode: 1, modelCode: 2 }], "honda accord")
    )
  ),
  { label: "Honda Accord", makeCode: 1, modelCode: 2 }
);
assert.equal(
  core.chooseTrim(
    [
      { label: "Other", trimCode: 99 },
      { label: "Sport", trimCode: 3 }
    ],
    "Unknown"
  ),
  null
);
assert.equal(
  core.chooseTrim(
    [
      { label: "Other", trimCode: 99 },
      { label: "Standard", trimCode: 3 }
    ],
    "Other"
  ),
  null
);

const longHiluxTitle =
  "Toyota Hilux GR SPORT/DOUBLE CABIN WIDE BODY/4.0L PETROL /OVER FENDER /360° CAMERA/DRIVER PWR SEATS WITH LATHER";
const liveHiluxModel = core.chooseUniqueCatalogMatch(
  [
    { label: "Toyota Hilux", makeCode: 10, modelCode: 20 },
    { label: "Toyota Land Cruiser", makeCode: 10, modelCode: 21 }
  ],
  longHiluxTitle,
  2
);
assert.equal(liveHiluxModel.label, "Toyota Hilux");
assert.equal(
  core.chooseUniqueCatalogMatch(
    [
      { label: "GR", trimCode: 1 },
      { label: "GR SPORT", trimCode: 2 },
      { label: "Other", trimCode: 99 }
    ],
    longHiluxTitle
  ).label,
  "GR SPORT"
);
assert.equal(
  core.chooseUniqueCatalogMatch(
    [
      { label: "Toyota Hilux", makeCode: 10, modelCode: 20 },
      { label: "Toyota Hilux", makeCode: 10, modelCode: 99 }
    ],
    longHiluxTitle,
    2
  ),
  null
);
assert.equal(
  core.chooseUniqueCatalogMatch([{ label: "Other", trimCode: 99 }], "Toyota Hilux Other"),
  null
);
assert.ok(
  core
    .buildCatalogSearchTerms({
      makeModel: "Toyota Hilux",
      specs: ["Model: Hilux"]
    })
    .some((term) => term.toLowerCase() === "toyota hilux")
);

const conservativeCapture = core.sanitizeCapture({
  listingName: longHiluxTitle,
  sourceUrl: "https://vendor.test/hilux"
});
assert.equal(conservativeCapture.makeModel, "");
assert.equal(conservativeCapture.trim, "");
assert.equal(conservativeCapture.fuelType, "");
assert.equal(conservativeCapture.regionalSpec, "");
assert.equal(conservativeCapture.insured, "No");
assert.equal(
  core.sanitizeCapture({
    description: "GCC Specifications",
    insured: "Yes",
    listingName: "Verified vehicle",
    sourceUrl: "https://vendor.test/car"
  }).regionalSpec,
  "GCC"
);
assert.equal(
  core.sanitizeCapture({ insured: "Yes", sourceUrl: "https://vendor.test/car" }).insured,
  "No"
);
const idealCarsCapture = core.sanitizeCapture({
  bodyType: "",
  category: "Used",
  description: "GCC Specifications\n6.2L V8 Engine\nZ71 Off-Road Package",
  exteriorColor: "Black",
  fuelType: "Petrol",
  kilometers: "11,000",
  listingName: "CHEVROLET TAHOE Z71 6.2 GCC SPECS YEAR 2024",
  makeModel: "Chevrolet TAHOE Z71",
  price: "AED215,000",
  sourceUrl: "https://idealcarsdubai.com/listing/tahoe-z71/",
  transmission: "Automatic",
  year: "2024"
});
assert.equal(idealCarsCapture.category, "USED");
assert.equal(idealCarsCapture.kilometers, "11000");
assert.equal(idealCarsCapture.regionalSpec, "GCC");
assert.equal(idealCarsCapture.exteriorColor, "Black");
assert.equal(idealCarsCapture.price, "215000");
assert.equal(idealCarsCapture.insured, "No");

const vendorFirst = core.sanitizeCapture({
  sourceUrl: "https://vendor.test/car",
  makeModel: "Hyundai Palisade",
  year: "2026",
  price: "180000 AED",
  description: "N/A",
  specs: ["Fuel: Gasoline", "Transmission: Automatic", "Body Type: SUV", "Engine: 3.5"]
});
assert.equal(vendorFirst.description, "");
assert.equal(vendorFirst.fuelType, "Gasoline");
assert.equal(vendorFirst.transmission, "Automatic");
assert.equal(vendorFirst.bodyType, "SUV");
const agentReview = { ...vendorFirst, evidence: { ...vendorFirst.evidence }, bodyType: "Coupe" };
agentReview.evidence.bodyType = {
  raw: "Coupe",
  source: "Agent reviewed or edited",
  state: "confirmed"
};
const enrichedVendor = {
  ...vendorFirst,
  evidence: { ...vendorFirst.evidence },
  description: "2026 Hyundai Palisade, brand new SUV powered by a 3.5L gasoline engine.",
  bodyType: "SUV",
  regionalSpec: "GCC",
  makeCode: 1,
  modelCode: 2,
  yearCode: 76
};
enrichedVendor.evidence.description = {
  raw: "Vehicle specs",
  source: "Verified specification summary; no AI request was needed",
  state: "strong"
};
enrichedVendor.evidence.regionalSpec = {
  raw: "GCC",
  source: "Gemini bounded inference",
  state: "review"
};
const mergedReview = core.mergeEnrichment(vendorFirst, agentReview, enrichedVendor).draft;
assert.equal(mergedReview.bodyType, "Coupe", "Background checks must not overwrite an agent edit");
assert.equal(mergedReview.fuelType, "Gasoline", "Vendor fuel must remain the source of truth");
assert.equal(
  mergedReview.description,
  enrichedVendor.description,
  "A missing description may be filled from verified specs"
);
assert.equal(mergedReview.regionalSpec, "GCC", "Only a missing field accepts AI enrichment");
assert.equal(
  mergedReview.modelCode,
  2,
  "Catalog codes may be attached without changing the vendor model label"
);
const changedYear = {
  ...vendorFirst,
  year: "2025",
  evidence: {
    ...vendorFirst.evidence,
    year: { raw: "2025", source: "Agent reviewed or edited", state: "confirmed" }
  }
};
assert.equal(
  core.mergeEnrichment(vendorFirst, changedYear, enrichedVendor).draft.yearCode,
  vendorFirst.yearCode
);

const html = read("sidepanel.html");
const assistant = read("src/features/manual-ad/manual-ad-assistant.js");
const fill = read("src/features/manual-ad/manual-ad-fill.js");
const source = read("src/features/manual-ad/manual-ad-source.js");
const priceSource = read("src/features/manual-ad/manual-ad-price-core.js");
const descriptionSource = read("src/features/manual-ad/manual-ad-description-core.js");
const background = read("src/background/background.js");
const manifest = JSON.parse(read("manifest.json"));

[
  "manual-ad-prepare",
  "manual-ad-fill-ayshei",
  "manual-ad-preview",
  "src/features/manual-ad/manual-ad-assistant.js"
].forEach((value) => assert.match(html, new RegExp(value)));
assert.doesNotMatch(html, /id="manual-ad-images"|id="manual-ad-image-count"/);
assert.match(html, />Manual Ad</);
const readAction = html.match(/<button\b[^>]*id="manual-ad-prepare"[^>]*>/)?.[0];
const fillAction = html.match(/<button\b[^>]*id="manual-ad-fill-ayshei"[^>]*>/)?.[0];
assert.ok(readAction, "Manual Ad must retain the read action.");
assert.ok(fillAction, "Manual Ad must retain the combined fill action.");
assert.match(readAction, /type="button"/);
assert.match(fillAction, /type="button"/);
assert.match(fillAction, /\bdisabled\b/);
for (const [name, selected] of [
  ["data", "true"],
  ["images", "false"]
]) {
  const tab = html.match(new RegExp(`<button\\b[^>]*id="manual-${name}-tab"[^>]*>`))?.[0];
  assert.ok(tab, `Manual ${name} tab must exist.`);
  assert.match(tab, /role="tab"/);
  assert.match(tab, new RegExp(`aria-controls="manual-${name}-panel"`));
  assert.match(tab, new RegExp(`aria-selected="${selected}"`));
  const panel = html.match(new RegExp(`<section\\b[^>]*id="manual-${name}-panel"[^>]*>`))?.[0];
  assert.ok(panel, `Manual ${name} panel must exist.`);
  assert.match(panel, /role="tabpanel"/);
  assert.match(panel, new RegExp(`aria-labelledby="manual-${name}-tab"`));
  assert.equal(/\bhidden\b/.test(panel), name === "images");
}
const manualDataMarkup = html.slice(
  html.indexOf('id="manual-data-panel"'),
  html.indexOf('id="manual-images-panel"')
);
assert.match(manualDataMarkup, /id="manual-ad-preview"/);
assert.match(manualDataMarkup, /data-manual-field="description"/);
["image-scraper-collect", "image-scraper-import", "image-scraper-list"].forEach((id) =>
  assert.ok(html.includes(`id="${id}"`), `Manual Images must retain ${id}`)
);
assert.doesNotMatch(
  html,
  /Ask agent|Evidence and confidence|Field-by-field result|Apply to Current Queue/
);
assert.match(html, /data-manual-field="insured"/);
assert.match(html, /data-manual-field="category"/);
assert.match(html, /data-manual-field="kilometers"/);
assert.match(assistant, /Very Good - No accidents, very few faults/);
assert.match(html, /data-section="manual-ad-assistant"/);
assert.match(html, /class="manual-ad-view"/);
assert.match(html, /manual-ad-model-results/);
assert.match(assistant, /Open an Ayshei place-ad tab at step 2 first/);
assert.doesNotMatch(assistant, /Dubizzle and DubiCars stay in the Jenkins workflow/);
assert.doesNotMatch(assistant, /renderImages|imageList|Make main/);
assert.match(assistant, /LunaAyshei\.searchModelsFromMirror/);
assert.match(assistant, /LunaAyshei\.fetchTrimsFromMirror/);
assert.match(assistant, /LunaAyshei\.resolveYearFromMirror/);
assert.match(assistant, /searchModelsFromMirror\(\s*keyword,\s*capture\.yearCode\s*\)/);
assert.match(assistant, /fetchTrimsFromMirror\(model\.label, yearCode\)/);
assert.match(assistant, /modelSearchRequest \+= 1/);
assert.doesNotMatch(assistant, /applyManualDraft|canApplyManualDraft/);
assert.match(assistant, /files:\s*\[\s*"src\/features\/manual-ad\/manual-ad-fill\.js"\s*\]/);
assert.match(assistant, /type: "luna\.manualAd\.fill\.v4"/);
assert.doesNotMatch(assistant, /luna\.manualAd\.(?:fill|inspect)\.v3/);
assert.match(assistant, /chrome\.tabs\.sendMessage/);
assert.match(assistant, /Math\.abs\(\(left\.index/);
assert.match(assistant, /luna\.manualAd\.inspect\.v4/);
assert.match(assistant, /inspectAysheiTab/);
assert.match(assistant, /targetUsedLayout/);
assert.match(assistant, /parseKilometers\(savedDraft\.kilometers\)/);
assert.match(assistant, /globalThis\.confirm/);
assert.match(assistant, /Fill every available field anyway/);
assert.match(assistant, /classList\.toggle\("is-missing"/);
assert.match(assistant, /task: "bodyType"/);
assert.match(assistant, /Luna is ready for the next vendor ad/);
assert.match(assistant, /clearCompletedDraft/);
assert.match(assistant, /clearCompletedWorkflow/);
assert.match(assistant, /chrome\.storage\.local\.remove\(storageKey\)/);
assert.match(assistant, /LunaImageScraper\.collectForManualAd\(\)/);
assert.match(
  assistant,
  /LunaImageScraper\.uploadToAysheiTab\(\s*tab\.id,\s*markImagesSelected\s*\)/
);
assert.match(assistant, /LunaImageScraper\.verifyOnAysheiTab/);
assert.match(assistant, /LunaImageScraper\?\.clearForManualAd\?\.\(\)/);
assert.match(assistant, /draft\.imagesImported = true/);
assert.match(assistant, /draft\.imagesImportedCount/);
assert.match(assistant, /savedDraft\.imagesImported === true/);
assert.match(assistant, /Image collection took too long/);
assert.match(assistant, /Ayshei did not confirm the vehicle fields within 20 seconds/);
assert.match(assistant, /chooseUniqueCatalogMatch/);
assert.match(assistant, /buildCatalogSearchTerms/);
assert.match(assistant, /choice from closed Mirror model list/);
assert.match(assistant, /task: "description"/);
assert.match(assistant, /descriptionFromSpecs\(capture\.specs\)/);
assert.match(assistant, /Verified page specifications copied without rewording/);
assert.match(assistant, /if \(!result\.imageUsed\)/);
assert.match(assistant, /Vehicle image was unavailable to AI/);
assert.doesNotMatch(assistant, /Qwen text-only fallback/);
assert.doesNotMatch(assistant, /title\.includes\(normalized\(candidate\.label\)\)/);
const fillFlow = fill.slice(fill.indexOf("const fill = async"));
assert.ok(
  fillFlow.indexOf('selectMui("Year"') < fillFlow.indexOf('selectAutocomplete("Make & Model"')
);
assert.ok(
  fillFlow.indexOf('selectAutocomplete("Make & Model"') <
    fillFlow.indexOf('"#mui-component-select-trim"')
);
assert.match(fill, /Number\.isInteger\(draft\.makeCode\)/);
assert.match(fill, /clickRadio\("Insured", "insured_", "No"\)/);
assert.match(fill, /CSS\.escape\(input\.id\)/);
assert.match(fill, /usedDraft !== hasUsedFields/);
assert.match(fill, /const inspect = \(\) =>/);
assert.doesNotMatch(fill, /__lunaManualAdFillInstalledV\d+/);
assert.match(fill, /message\?\.type === "luna\.manualAd\.inspect\.v4"/);
assert.match(fill, /message\?\.type !== "luna\.manualAd\.fill\.v4"/);
assert.doesNotMatch(fill, /luna\.manualAd\.(?:fill|inspect)\.v3/);
assert.match(fill, /chrome\.runtime\.onMessage\.removeListener\(previousListener\)/);
assert.match(fill, /globalThis\.__lunaManualAdFillListener = messageListener/);
assert.match(assistant, /fillAysheiVehicleDependencies/);
assert.match(assistant, /world: "MAIN"/);
assert.match(assistant, /input\._valueTracker\?\.setValue\(previous\)/);
assert.match(
  assistant,
  /Object\.getOwnPropertyDescriptor\(\s*HTMLInputElement\.prototype,\s*"value"\s*\)/
);
assert.match(assistant, /No single exact Ayshei model appeared/);
assert.doesNotMatch(assistant, /Ayshei did not retain the exact model text/);
assert.doesNotMatch(assistant, /waitFor\(\(\) => input\.value, vehicle\.makeModel, 20\)/);
assert.doesNotMatch(assistant, /setReactInput\(input, ""\)/);
assert.match(assistant, /const modelInput = \(\) =>\s*document\.querySelector/);
assert.match(assistant, /let nextWriteAt = 0/);
assert.match(assistant, /let nextOpenAt = 0/);
assert.match(assistant, /let writeAttempts = 0/);
assert.match(assistant, /let modelTextSince = 0/);
assert.match(assistant, /now - modelTextSince >= 650/);
assert.match(assistant, /writeAttempts < 2/);
assert.match(assistant, /nextWriteAt = now \+ 1000/);
assert.match(
  assistant,
  /modelOption = findExactOption\(modelInput\(\) \|\| input, vehicle\.makeModel\)/
);
assert.match(assistant, /const autocompleteIsOpen/);
assert.match(assistant, /!autocompleteIsOpen\(input\)/);
assert.match(assistant, /const reactProps = \(element\) =>/);
assert.match(assistant, /name\.startsWith\("__reactProps\$"\)/);
assert.match(assistant, /const callReactHandler = \(element, handlerName, type, extra = \{\}\) =>/);
assert.match(assistant, /callReactHandler\(input, "onChange", "change"\)/);
assert.match(assistant, /const requestAutocompleteOptions/);
assert.match(
  assistant,
  /requestAutocompleteOptions = \(input\) => \{\s+input\.focus\(\);\s+const keyboard = \{\s+code: "ArrowDown"/
);
assert.match(assistant, /callReactHandler\(input, "onKeyDown", "keydown", keyboard\)/);
assert.match(assistant, /nextOpenAt = now \+ 1200/);
assert.match(assistant, /const commitAutocompleteOption = \(option\) =>/);
assert.match(assistant, /callReactHandler\(option, "onClick", "click"/);
assert.match(assistant, /commitAutocompleteOption\(modelOption\)/);
assert.match(assistant, /const writeReactAutocomplete/);
assert.match(assistant, /const writeReactAutocomplete = \(input, value\) => \{\s+input\.focus\(\)/);
assert.match(assistant, /setReactInput\(input, String\(value\)\)/);
assert.match(assistant, /new KeyboardEvent\("keyup"/);
assert.doesNotMatch(assistant, /Nothing else was filled/);
assert.match(assistant, /vehicleDependency = await fillAysheiVehicleDependencies/);
assert.match(assistant, /Finished every available field\. Check manually/);
assert.match(assistant, /vehicleDependency\.stage === "Make & Model"/);
assert.match(assistant, /let prepareRun = 0/);
assert.match(assistant, /const sourceDraft = await withTimeout/);
assert.match(assistant, /draft = sourceDraft;[\s\S]*render\(\);[\s\S]*const enrichmentPromise/);
assert.match(assistant, /mergeEnrichment\(sourceDraft, draft, enrichment\)/);
assert.match(assistant, /Vendor facts are shown now/);
assert.match(assistant, /AI added no fields; existing vendor facts were kept/);
assert.match(html, /id="manual-ad-source-facts"/);
assert.match(
  assistant,
  /let nextDraft = LunaManualAdCore|let nextDraft = globalThis\.LunaManualAdCore/
);
assert.match(assistant, /modelSearchRequest \+= 1/);
assert.match(assistant, /key === "trim" && input instanceof HTMLSelectElement/);
assert.doesNotMatch(assistant, /Object\.values\(fields\).*replaceChildren/s);
assert.match(assistant, /const modelAlreadyConfirmed/);
assert.match(assistant, /currentTrim\.getAttribute\("aria-disabled"\) !== "true"/);
assert.ok(
  assistant.indexOf('type: "luna.manualAd.fill.v4"') <
    assistant.indexOf("vehicleDependency = await fillAysheiVehicleDependencies(tab.id, draft)")
);
assert.ok(
  fill.indexOf('results.push(await clickRadio("Regional Spec"') <
    fill.indexOf("results.push(modelResult)")
);
assert.match(assistant, /options: \{ skipVehicleDependencies: true \}/);
assert.match(fill, /if \(!options\.skipVehicleDependencies\)/);
assert.match(fill, /fill\(message\.draft, message\.options\)/);
assert.match(fill, /waitForReadback/);
assert.match(fill, /new MouseEvent\("mousedown"/);
assert.match(fill, /trigger\.getAttribute\("aria-controls"\)/);
assert.match(fill, /waitForOption\(input, choice, 160\)/);
assert.match(fill, /waitForEnabled\("input\[name='makeAndModel'\]\[role='combobox'\]"\)/);
assert.match(fill, /const waitForEnabled = async \(selector, attempts = 160\)/);
assert.match(fill, /input\.select\(\)/);
assert.match(fill, /const openAutocomplete/);
assert.match(fill, /document\.execCommand\("insertText", false, choice\)/);
assert.match(fill, /input\.dispatchEvent\(\s*new KeyboardEvent\("keyup"/);
assert.match(fill, /openAutocomplete\(input\);/);
assert.match(fill, /writeAutocompleteText\(input, choice\)/);
assert.match(fill, /new InputEvent\("input"/);
assert.match(fill, /Ayshei did not accept the reviewed model text/);
assert.match(fill, /new ClipboardEvent\("paste"/);
assert.match(fill, /insertParagraph/);
assert.match(fill, /paragraph breaks/);
assert.doesNotMatch(fill, /delay\(360\)|delay\(500\)/);
assert.match(fill, /No reviewed value is available/);
assert.match(fill, /Needs manual check/);
assert.match(fill, /Read-back matched/);
assert.match(fill, /searchParams\.get\("step"\) !== "2"/);
assert.doesNotMatch(fill, /\.click\(\).*Next|nextButton|publish|submit/i);
assert.doesNotMatch(
  fill,
  /luna\.manualAd\.fetchImage|uploadImages|input\[type='file'\]|imageCount/
);
const assistantFillFlow = assistant.slice(assistant.indexOf("const fillAyshei = async"));
const imageUploadStart = assistantFillFlow.search(
  /LunaImageScraper\.uploadToAysheiTab\(\s*tab\.id,\s*markImagesSelected\s*\)/
);
const vehicleFillStart = assistantFillFlow.search(
  /files:\s*\[\s*"src\/features\/manual-ad\/manual-ad-fill\.js"\s*\]/
);
assert.ok(imageUploadStart >= 0 && vehicleFillStart >= 0);
assert.doesNotMatch(
  assistantFillFlow,
  /clearForManualAd\(\)/,
  "The reviewed image set must remain available until the complete workflow succeeds."
);
assert.ok(
  imageUploadStart < vehicleFillStart,
  "The image upload must start before the vehicle fields."
);
assert.ok(
  assistantFillFlow.indexOf("await Promise.race([imageSelectedTask, imageUploadTask])") <
    vehicleFillStart,
  "Vehicle fields must start only after Ayshei receives the selected image files (or upload fails)."
);
assert.ok(
  vehicleFillStart < assistantFillFlow.indexOf("const upload = await imageUploadTask"),
  "Vehicle fields must start while the image upload is still running."
);
assert.ok(
  assistantFillFlow.indexOf("const upload = await imageUploadTask") <
    assistantFillFlow.indexOf(
      "if (response.result?.filled && vehicleDependency.ok && imagesConfirmed)"
    ),
  "Luna must settle and verify the images before reporting complete."
);
assert.match(
  assistantFillFlow,
  /\.then\(\s*\(result\) => \(\{ result \}\),\s*\(error\) => \(\{ error \}\)\s*\)/
);
assert.doesNotMatch(background, /SHA-256/);
// The existing ranked image feeds AI field suggestions. It does not scrape an upload gallery.
const rankedVehicleImage =
  /const vehicleImage = \[\.\.\.\(mainArticle \|\| root\)\.querySelectorAll\((["'])img\1\)\]/;
assert.match(source, rankedVehicleImage);
assert.doesNotMatch(
  source.replace(rankedVehicleImage, ""),
  /show\\s\+\(\?:all\|more\)|imageCandidates|querySelectorAll\((["'])img\1\)|og:image/
);
assert.match(source, /sourceAdapter: "universal"/);
assert.match(source, /Vendor description/);
assert.match(source, /Exact vehicle description/);
assert.match(source, /Visible description section/);
assert.match(source, /#card-description #car-description/);
assert.match(source, /descriptionSubheading/);
assert.match(source, /Extracted vehicle specifications for AI formatting/);
assert.match(source, /selectedDescription\?\.text/);
assert.match(source, /Semantic vehicle detail/);
assert.match(source, /\[class\*='price' i\],\[id\*='price' i\]/);
assert.match(source, /Exact visible vehicle price/);
assert.match(source, /Visible marketplace price required/);
assert.match(source, /Conflicting visible vehicle prices/);
assert.match(source, /getClientRects\(\)\.length > 0/);
assert.match(source, /aria-hidden='true'/);
assert.match(source, /priceContainers\.flatMap/);
assert.match(source, /dubicars\.com/);
assert.match(source, /dubizzle\.com/);
assert.doesNotMatch(source, /Vehicle page metadata price/);
assert.doesNotMatch(source, /meta\[name='description'\],meta\[property='og:description'\]/);
assert.match(source, /LunaManualAdPriceCore/);
assert.match(priceSource, /chooseDisplayedPrice/);
assert.match(priceSource, /financing/);
assert.match(priceSource, /financingContext/);
assert.match(priceSource, /primaryPriceContext/);
assert.match(priceSource, /\\\$/);
assert.match(
  assistant,
  /files:\s*\[\s*"src\/features\/manual-ad\/manual-ad-price-core\.js",\s*"src\/features\/manual-ad\/manual-ad-description-core\.js",\s*"src\/features\/manual-ad\/manual-ad-source\.js"\s*\]/
);
assert.match(descriptionSource, /const pageChrome/);
assert.match(descriptionSource, /marketplace && !direct && !headed/);
assert.match(descriptionSource, /chooseDescription/);
assert.match(assistant, /manual-ad-description-core\.js/);
assert.match(source, /formattedTextFromElement/);
assert.match(source, /semanticDescriptionHeading/);
assert.match(source, /headedDescriptionCandidates/);
assert.match(source, /narrative/);
assert.match(source, /application\/ld\+json/);
assert.match(source, /color: "Color"/);
assert.match(source, /"vehicle colour": "exteriorColor"/);
assert.match(source, /record\.additionalProperty/);
assert.match(source, /record\.bodyType \|\| record\.bodyStyle/);
assert.match(source, /Visible vehicle type badge/);
assert.match(source, /a\[href\*="\?type="\],a\[href\*="&type="\]/);
assert.match(source, /\(\?:read\|show\)\\s\+\(\?:more\|less\)/);
assert.doesNotMatch(source, /kandy|lowmileage|idealcars|carsalfaris/i);
assert.doesNotMatch(source, /who\s+are\s+we|about\s+us|show\s*rooms/i);
assert.match(source, /type: "bodyType"/);
assert.match(source, /specs: "regionalSpec"/);
assert.match(source, /conflictedFields/);
assert.match(source, /capturedAt: new Date\(\)\.toISOString\(\)/);
assert.match(source, /access\[_-\]\?token/);
assert.doesNotMatch(source, /titleWithoutYear/);
assert.doesNotMatch(source, /observe\("listingName"/);
assert.doesNotMatch(assistant, /listingName|composeListingName/);
assert.doesNotMatch(fill, /#ad_title|Listing Name/);
assert.doesNotMatch(html, /data-manual-field="listingName"/);
assert.match(assistant, /LunaAyshei\.searchModelsFromMirror/);
assert.match(assistant, /LunaAyshei\.fetchTrimsFromMirror/);
assert.match(assistant, /captureVendorPage/);
assert.match(assistant, /\[role='tab'\],button,summary,a\[href\^='#'\]/);
assert.match(assistant, /LunaManualAdCore\.mergeCaptures/);
assert.match(assistant, /const resolveMissingFields = async/);
assert.match(assistant, /task: "field"/);
assert.match(assistant, /bounded inference from page facts/);
assert.match(assistant, /manual-ad-ai-disclosure-list/);
assert.match(assistant, /requiresImage: true/);
assert.match(assistant, /config\.requiresImage && !result\.imageUsed/);
const colorCandidates = assistant.match(/candidates:\s*\[\s*"Beige"[\s\S]*?\]/);
assert.ok(colorCandidates, "The color candidate list must be present.");
assert.doesNotMatch(colorCandidates[0], /"Other"/);
assert.match(read("sidepanel.html"), /AI-assisted information/);
assert.match(
  read("sidepanel.html"),
  /These values came from bounded AI logic, not an exact page field/
);
assert.match(read("src/features/manual-ad/manual-ad-assistant.css"), /\.manual-ad-ai-disclosure/);
assert.doesNotMatch(assistant, /carsalfaris|listing-detail-detail/i);
assert.match(read("src/features/work-queue/work-queue.js"), /LunaAyshei\.searchModels\(/);
assert.match(read("src/features/work-queue/work-queue.js"), /LunaAyshei\.fetchTrims\(/);
assert.doesNotMatch(
  read("src/features/work-queue/work-queue.js"),
  /searchModelsFromMirror|fetchTrimsFromMirror/
);
assert.ok(manifest.host_permissions.every((origin) => !origin.includes("example.invalid")));
assert.ok(manifest.optional_host_permissions.includes("https://*/*"));

console.log("Manual ad assistant tests passed.");
