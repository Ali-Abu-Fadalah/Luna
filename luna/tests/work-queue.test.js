const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const coreSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/work-queue/work-queue-core.js"),
  "utf8"
);
const uiSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/work-queue/work-queue.js"),
  "utf8"
);
const notesSource = fs.readFileSync(
  path.resolve(__dirname, "../src/features/work-queue/work-queue-notes.js"),
  "utf8"
);
const html = fs.readFileSync(path.resolve(__dirname, "../sidepanel.html"), "utf8");
const context = { Object, URL };
context.globalThis = context;
vm.runInNewContext(coreSource, context);

const {
  buildListedOutput,
  buildUnlistedOutput,
  getCounts,
  getNoonCategories,
  getNoonSubCategories,
  getNoonSubSubCategories,
  getReasonSuggestions,
  isDubiCarsUrl,
  isNoonUrl,
  isValidNoonSelection,
  NOON_CONDITION,
  parseCopiedRows
} = context.LunaWorkQueueCore;

const expectedNoonTaxonomy = {
  ELECTRONICS: {
    MOBILE_TABLETS: "MOBILE_PHONES TABLETS_EREADERS LANDLINES".split(" "),
    TELEVISIONS: "TVS PROJECTORS DVD_MEDIA_PLAYERS".split(" "),
    ACCESSORIES:
      "WEARABLE_TECHNOLOGY SPARE_PARTS CHARGERS_POWER_BANKS CASES_COVERS ROUTERS_HOME_NETWORK PRINTERS_SCANNERS PC_MOBILE_COMPONENTS".split(
        " "
      ),
    VIDEO_GAMES:
      "CONTROLLERS_GAMEPADS CONSOLES GAMES VR_HEADSETS GAME_ADDONS VIDEO_GAME_CASES_BOXES".split(
        " "
      ),
    AUDIO_EQUIPMENTS:
      "SPEAKERS HEADPHONES EARPHONES PORTABLE_AUDIO_REPLACEMENT_PARTS_TOOLS HOME_THEATER_SYSTEMS MP3_PLAYERS RADIOS_CASETTE_PLAYERS".split(
        " "
      ),
    CAMERAS:
      "DIGITAL_CAMERAS_CAMCORDERS CAMERA_DRONES LENSES_STABILIZERS_FILTERS SECURITY_CAMERAS STUDIO_PROFESSIONAL_EQUIPMENT BINOCULAR_OPTICAL_INSTRUMENTS".split(
        " "
      ),
    DESKTOPS_LAPTOPS: "LAPTOPS MONITORS KEYBOARDS_MICE DESKTOPS".split(" "),
    SMART_HOME_DEVICES:
      "SMART_LIGHTS SMART_APPLIANCES SMART_SPEAKERS SMART_GARDEN MEDIA_STREAMERS".split(" "),
    HOME_SURVEILLANCE_SYSTEMS: ["HOME_SECURITY_CAMERA_SYSTEMS"]
  },
  LIFESTYLE: {
    BEAUTY_HEALTH:
      "FRAGRANCE MAKEUP MEDICINE_HEALTH_PRODUCTS HAIR_CARE SKIN_CARE BABY_DIAPERS_SUPPLIES HYGIENE_PRODUCTS MANICURE_PEDICURE".split(
        " "
      ),
    SPORT:
      "BALL_GAMES GYM_FITNESS_EQUIPMENT BICYCLES_EBIKES WATER_SPORTS CAMPING_HIKING PROTECTION_GEAR SPORTS_NUTRITION ROLLERSKATES_SKATEBOARDING ESCOOTERS_HOVERBOARDS".split(
        " "
      ),
    FASHION_ACCESSORIES:
      "JEWELLERY WEDDING_APPAREL CLOTHING OTHER_FASHION_ACCESSORIES SHOES WATCHES HAND_BAGS COSTUMES_UNIFORMS SPORTSWEAR_SWIMWEAR".split(
        " "
      ),
    TRAVEL:
      "TAGS_HANDLE_WRAPS SHOE_TOILETRY_BAGS LUGGAGE_BACKSPACKS BABY_STROLLERS SCALES_STRAPS COSMETIC_BAGS_CONTAINERS ORGANIZERS SAFETY_LOCKS PASSPORT_COVERS".split(
        " "
      ),
    BOOKS: "NON_FICTION FICTION CHILDRENS_BOOKS BOOK_ACCESSORIES COMICS MAGAZINES TEXTBOOKS".split(
      " "
    )
  },
  HOME_GARDEN: {
    FURNITURE:
      "CARPETS_DOORMATS MIRRORS_WARDROBE TABLES_DESKS CABINETS_STORAGE PADS_PROTECTORS CURTAINS_BLINDS SOFAS_CHAIRS LIGHTS_CHANDELIERS BEDDING_CUSHIONS".split(
        " "
      ),
    TOOLS_APPLIANCES:
      "GENERAL_TOOLS_HOME_IMPROVEMENT AIR_CONDITIONERS_FANS VACUUM_CLEANERS IRONS_IRON_BOARDS WASHING_MACHINES_DRYERS".split(
        " "
      ),
    KITCHEN:
      "DRINKWARE_ACCESSORIES COOKWARE_UTENSILS MICROWAVES_OVENS DINNERWARE_CUTLERY REFRIGERATORS_WATER_COOLERS CONTAINERS_SUPPLIES DISHWASHERS_TRASH_COMPACTORS".split(
        " "
      ),
    PETS: "FOR_ADOPTION AQUARIUM CAT_FOOD DOG_FOOD LOST_FOUND_PETS PET_SUPPLIES".split(" "),
    DECORATIONS:
      "CANDLES_VASES PHOTO_ALBUMS_FRAMES CLOCKS_TAPESTRIES CLEANING_PRODUCTS_FRAGRANCES CHILDRENS_DECOR BATH_ACCESSORIES".split(
        " "
      ),
    GARDEN_OUTDOOR: "LAMPS_SHADES BBQ_SETS_FIREPLACE PLANTS_SEEDS POOLS_FOUNTAINS".split(" ")
  },
  ART_COLLECTIBLES: {
    ARTS_CRAFTS:
      "BEADING_JEWELRY_MAKING FABRICS_SEWING_KNITTING ARTS_CRAFTS_SUPPLIES OTHERS_IN_ARTS_CRAFTS PAINTINGS_DRAWINGS PARTY_DECORATIONS_SUPPLIES CRAFTING GIFT_WRAPPING_SUPPLIES PRINTMAKING_STAMPS".split(
        " "
      ),
    COLLECTIBLES:
      "MEMORABILIA OTHERS_IN_COLLECTIBLES PENS_WRITING_INSTRUMENTS TRADING_CARDS MODEL_CARS ROCKS_FOSSILS_ARTIFACTS ANTIQUES COINS".split(
        " "
      ),
    NFTS: ["OTHERS_IN_NFTS"],
    OTHERS_IN_ART_COLLECTIBLES: ["OTHERS_IN_ART_COLLECTIBLES"]
  },
  ENTERTAINMENT: {
    OTHERS_IN_ENTERTAINMENT: ["OTHER_IN_ENTERTAINMENT"],
    TICKETS_AND_VOUCHERS:
      "EVENTS VOUCHERS_GIFT_CARDS CONCERTS OTHERS_IN_TICKETS_AND_VOUCHERS ACTIVITIES_ATTRACTIONS CINEMA_THEATER TRAVEL_TOURS".split(
        " "
      ),
    TOYS: "EDUCATIONAL_BUILDING BOARD_GAMES_CARDS CLASSIC_VINTAGE BABY_PRESCHOOL DOLLS ACTION_FIGURES REMOTE_CONTROL_TOY_VEHICLES OTHERS_IN_TOYS".split(
      " "
    )
  }
};

assert.deepEqual(
  JSON.parse(JSON.stringify(getNoonCategories())),
  Object.keys(expectedNoonTaxonomy)
);
Object.entries(expectedNoonTaxonomy).forEach(([category, subCategories]) => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(getNoonSubCategories(category))),
    Object.keys(subCategories)
  );
  Object.entries(subCategories).forEach(([subCategory, subSubCategories]) => {
    assert.deepEqual(
      JSON.parse(JSON.stringify(getNoonSubSubCategories(category, subCategory))),
      subSubCategories
    );
  });
});
assert.equal(NOON_CONDITION, "NEW_WITH_TAGS");
assert.equal(isValidNoonSelection("ELECTRONICS", "ACCESSORIES", "WEARABLE_TECHNOLOGY"), true);
assert.equal(isValidNoonSelection("LIFESTYLE", "ACCESSORIES", "WEARABLE_TECHNOLOGY"), false);

const pastedRows = [
  [
    "7/27/2026",
    "Motors",
    "Vendor One",
    "First Ad",
    "Agent A",
    "https://example.com/ad-1",
    "ignored extra column"
  ].join("\t"),
  ["7/27/2026", "Motors", "Vendor Two", "Second Ad", "Agent B", "https://example.com/ad-2"].join(
    "\t"
  ),
  ["7/27/2026", "Motors", "Vendor Three", "إعلان عربي", "Agent C", "https://example.com/ad-3"].join(
    "\t"
  ),
  ["7/27/2026", "Motors", "Vendor Four", "Fourth Ad", "Agent D", "https://example.com/ad-4"].join(
    "\t"
  )
].join("\n");

const parsed = parseCopiedRows(pastedRows);
assert.equal(parsed.invalidLines.length, 0);
assert.equal(parsed.ads.length, 4);
assert.equal(parsed.ads[0].source.vendor, "Vendor One");
assert.equal(parsed.ads[0].source.url, "https://example.com/ad-1");
assert.equal(parsed.ads[1].source.adName, "Second Ad");
assert.equal(parsed.ads[2].source.adName, "إعلان عربي");
assert.deepEqual(JSON.parse(JSON.stringify(parsed.ads.map((ad) => ad.id))), [1, 2, 3, 4]);

const invalid = parseCopiedRows("7/27/2026\tMotors\tVendor\tAd\tAgent\tjavascript:alert(1)");
assert.equal(invalid.ads.length, 0);
assert.deepEqual(JSON.parse(JSON.stringify(invalid.invalidLines)), [1]);

parsed.ads[0].status = "listed";
Object.assign(parsed.ads[0].listed, {
  category: "USED",
  color: "Black",
  makeModel: "Mercedes A220",
  specs: "American",
  transmission: "AUTOMATIC",
  trim: "other"
});
parsed.ads[1].status = "unlisted";
parsed.ads[1].unlisted.date = "7/28/2026";
parsed.ads[1].unlisted.reason = "Sold";
parsed.ads[2].status = "review_later";

const listed = buildListedOutput(parsed.ads);
const listedLines = listed.text.split("\n");
assert.equal(listed.rowCount, 4);
assert.equal(listed.pendingCount, 1);
assert.equal(listedLines.length, 4);
assert.equal(
  listedLines[0],
  [
    "https://example.com/ad-1",
    "USED",
    "Mercedes A220",
    "other",
    "Black",
    "VERY_GOOD",
    "American",
    "AUTOMATIC"
  ].join("\t")
);
assert.equal(listedLines[1], "\t\t\t\t\t\t\t");
assert.equal(listedLines[2], "https://example.com/ad-3\t\t\t\t\t\t\t");
assert.equal(listedLines[3], "https://example.com/ad-4\t\t\t\t\t\t\t");

const dubiCarsAd = JSON.parse(JSON.stringify(parsed.ads[0]));
dubiCarsAd.source.url = "https://www.dubicars.com/2026/example-car";
dubiCarsAd.listed.specs = "GCC";
dubiCarsAd.listed.transmission = "AUTOMATIC";
const dubiCarsListed = buildListedOutput([dubiCarsAd]);
assert.equal(isDubiCarsUrl(dubiCarsAd.source.url), true);
assert.equal(isDubiCarsUrl("https://dubicars.com/car"), true);
assert.equal(isDubiCarsUrl("https://notdubicars.com/car"), false);
assert.equal(
  dubiCarsListed.text,
  [dubiCarsAd.source.url, "USED", "Mercedes A220", "other", "Black", "VERY_GOOD", "", ""].join("\t")
);

const noonAd = JSON.parse(JSON.stringify(parsed.ads[0]));
noonAd.source.url =
  "https://www.noon.com/uae-en/the-hume-band-2-0/N70395452V/p/?o=eb2ee51c86e1347e";
Object.assign(noonAd.listed, {
  noonCategory: "ELECTRONICS",
  noonCondition: "tampered-value",
  noonSubCategory: "ACCESSORIES",
  noonSubSubCategory: "WEARABLE_TECHNOLOGY"
});
const noonListed = buildListedOutput([noonAd]);
assert.equal(isNoonUrl(noonAd.source.url), true);
assert.equal(isNoonUrl("https://noon.com/product"), true);
assert.equal(isNoonUrl("https://uae.noon.com/product"), true);
assert.equal(isNoonUrl("https://noon.com.example.org/product"), false);
assert.equal(isNoonUrl("https://example.org/noon.com/product"), false);
assert.equal(
  noonListed.text,
  [noonAd.source.url, "ELECTRONICS", "ACCESSORIES", "WEARABLE_TECHNOLOGY", "NEW_WITH_TAGS"].join(
    "\t"
  )
);
const mixedListed = buildListedOutput([dubiCarsAd, noonAd]);
assert.equal(mixedListed.text.split("\n")[0].split("\t").length, 8);
assert.equal(mixedListed.text.split("\n")[1].split("\t").length, 5);

const pendingNoonAd = JSON.parse(JSON.stringify(noonAd));
pendingNoonAd.status = "pending";
assert.equal(buildListedOutput([pendingNoonAd]).text, `${pendingNoonAd.source.url}\t\t\t\t`);
const unlistedNoonAd = JSON.parse(JSON.stringify(noonAd));
unlistedNoonAd.status = "unlisted";
assert.equal(buildListedOutput([unlistedNoonAd]).text, "\t\t\t\t");

const unlisted = buildUnlistedOutput(parsed.ads);
assert.equal(unlisted.rowCount, 1);
assert.equal(unlisted.text, "7/28/2026\thttps://example.com/ad-2\tSold\tVendor Two");

const counts = getCounts(parsed.ads);
assert.deepEqual(JSON.parse(JSON.stringify(counts)), {
  listed: 1,
  pending: 1,
  reviewLater: 1,
  total: 4,
  unlisted: 1
});

const reasons = getReasonSuggestions(
  [
    { unlistedReason: "Body Type" },
    { unlistedReason: " sold " },
    { unlistedReason: "oThEr" },
    { unlistedReason: "" }
  ],
  parsed.ads
);
assert.equal(reasons.length, 3);
assert.ok(reasons.includes("Body Type"));
assert.ok(reasons.some((reason) => reason.toLowerCase() === "sold"));
assert.equal(reasons.at(-1), "oThEr");

assert.match(html, /class="work-queue-view"/);
assert.match(html, /id="queue-import-text"/);
assert.match(html, /id="queue-import-preview"/);
assert.match(html, /id="queue-confirm-import"/);
assert.match(html, /id="queue-auto-fill"/);
assert.match(html, />\s*Auto Fill\s*<\/button>/);
assert.doesNotMatch(
  html,
  /queue-extract-review|queue-apply-extraction|queue-cancel-extraction|Fill from DubiCars \/ Dubizzle/
);
assert.match(html, /id="queue-filter"/);
assert.doesNotMatch(html, /id="queue-next-pending"|>Next Pending</);
assert.doesNotMatch(uiSource, /nextPendingButton|queue-next-pending/);
assert.match(html, /Listed Output · Motors P:W \/ Noon 5 cells/);
assert.match(html, /Unlisted Output · K:N/);
assert.match(html, /Review Later/);
assert.match(html, /value="VERY_GOOD"/);
assert.match(html, /value="AUTOMATIC"/);
assert.match(html, /value="MANUAL"/);
assert.equal((html.match(/<option value="(?:USED|EXPORT|NEW)">/g) || []).length, 6);
assert.equal(
  (
    html.match(
      /<option value="(?:White|Black|Red|Orange|Yellow|Dark Green|Light Green|Blue|Blueberry|Purple|Pink|Beige|Cyan|Grey|Black matt|White Pearl|Dark Grey|Silver|Brown|Other)">/g
    ) || []
  ).length >= 20,
  true
);
assert.match(uiSource, /luna\.workQueue\.v1/);
assert.match(uiSource, /chrome\?\.storage\?\.local/);
assert.match(uiSource, /tabs\?\.create/);
assert.match(uiSource, /tabs\?\.update/);
assert.match(uiSource, /storage\?\.session/);
assert.match(uiSource, /LunaConnection\.isDataState/);
assert.match(uiSource, /listedSpecsField\.hidden = isDubiCars/);
assert.match(uiSource, /listedTransmissionField\.hidden = isDubiCars/);
assert.match(uiSource, /copyListed\.disabled = listed\.rowCount === 0/);
assert.match(html, /id="queue-listed-specs-field"/);
assert.match(html, /id="queue-listed-transmission-field"/);
assert.match(html, /id="queue-noon-listed-fields" hidden/);
assert.match(html, /id="queue-noon-category"/);
assert.match(html, /id="queue-noon-sub-category" disabled/);
assert.match(html, /id="queue-noon-sub-sub-category" disabled/);
assert.match(html, /id="queue-noon-condition"[^>]+value="NEW_WITH_TAGS"[^>]+readonly/);
assert.match(uiSource, /isNoonAd/);
assert.match(uiSource, /isValidNoonSelection/);
assert.match(html, /id="queue-open-url"/);
assert.match(html, /id="queue-open-hint"[^>]*>[^<]*reusable ad tab/i);
assert.match(html, /class="queue-open-icon"/);
assert.match(uiSource, /jenkinsBatchSize: 20/);
assert.match(uiSource, /Preview ready\. Saved work has not changed/);
assert.match(uiSource, /expectedUrl: ad\?\.source\?\.url/);
assert.match(uiSource, /vehicle-detail-page\.js/);
assert.match(uiSource, /Status remains/);
assert.match(html, /id="queue-ai-body-type"/);
assert.match(html, /id="queue-ai-model-trim"/);
assert.match(html, /id="queue-ai-fill"/);
assert.match(html, /id="queue-note-text"/);
assert.match(html, /id="queue-add-note"/);
assert.match(html, /id="home-notes-list"/);
assert.match(html, /id="queue-view-select"/);
assert.doesNotMatch(html, /id="queue-ayshei-verify"/);
assert.doesNotMatch(html, /class="queue-live-badge"/);
assert.match(uiSource, /luna:work-queue-note/);
assert.match(notesSource, /const openVendors = new Set/);
assert.match(notesSource, /card\.open = openVendors\.has\(vendor\)/);
assert.match(uiSource, /isPlainGreen/);
assert.match(uiSource, /dark-green/);
assert.match(uiSource, /light-green/);
assert.match(
  uiSource,
  /task === "trim"[\s\S]*String\(candidate\.trimCode\)[\s\S]*String\(candidate\.id\)/
);
assert.match(uiSource, /rankModelCandidates/);
assert.match(uiSource, /sameMakeModels/);
assert.match(uiSource, /nearestModelCandidates/);
assert.match(uiSource, /resolveWithGroq\("model", facts, nearest\.slice\(0, 24\), ""\)/);
assert.match(uiSource, /No live model for the advertised make was found/);
assert.match(uiSource, /fallbackTrim/);
assert.match(uiSource, /Model is the nearest same-make choice/);
assert.doesNotMatch(uiSource, /rankModelCandidates\(candidates, capture\)\.length\) break/);
const fillFlowSource = uiSource.slice(
  uiSource.indexOf("const autoFillCurrentAdvertisement"),
  uiSource.indexOf("startButton.addEventListener")
);
assert.doesNotMatch(
  fillFlowSource,
  /\bmarkAd\s*\(|\bmoveAfterSave\s*\(|\bsyncOpenAdTab\s*\(|\bopenOrUpdateAdTab\s*\(|\.click\s*\(/
);
assert.match(fillFlowSource, /Luna did not save, move to Next, or run a page action/);
assert.doesNotMatch(uiSource, /\bconfirm\s*\(/);
assert.doesNotMatch(uiSource, /\bfetch\s*\(/);

console.log("Work Queue tests passed.");
