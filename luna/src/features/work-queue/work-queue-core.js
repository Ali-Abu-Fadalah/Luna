globalThis.LunaWorkQueueCore = (() => {
  const normalizeText = (value) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("en");

  const cleanCell = (value) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .trim();

  const isDubiCarsUrl = (value) => {
    try {
      const hostname = new URL(String(value || "")).hostname.toLowerCase();
      return hostname === "dubicars.com" || hostname.endsWith(".dubicars.com");
    } catch (error) {
      return false;
    }
  };

  const isNoonUrl = (value) => {
    try {
      const hostname = new URL(String(value || "")).hostname.toLowerCase();
      return hostname === "noon.com" || hostname.endsWith(".noon.com");
    } catch (error) {
      return false;
    }
  };

  const NOON_CONDITION = "NEW_WITH_TAGS";
  const NOON_TAXONOMY = Object.freeze({
    ELECTRONICS: Object.freeze({
      MOBILE_TABLETS: Object.freeze(["MOBILE_PHONES", "TABLETS_EREADERS", "LANDLINES"]),
      TELEVISIONS: Object.freeze(["TVS", "PROJECTORS", "DVD_MEDIA_PLAYERS"]),
      ACCESSORIES: Object.freeze([
        "WEARABLE_TECHNOLOGY",
        "SPARE_PARTS",
        "CHARGERS_POWER_BANKS",
        "CASES_COVERS",
        "ROUTERS_HOME_NETWORK",
        "PRINTERS_SCANNERS",
        "PC_MOBILE_COMPONENTS"
      ]),
      VIDEO_GAMES: Object.freeze([
        "CONTROLLERS_GAMEPADS",
        "CONSOLES",
        "GAMES",
        "VR_HEADSETS",
        "GAME_ADDONS",
        "VIDEO_GAME_CASES_BOXES"
      ]),
      AUDIO_EQUIPMENTS: Object.freeze([
        "SPEAKERS",
        "HEADPHONES",
        "EARPHONES",
        "PORTABLE_AUDIO_REPLACEMENT_PARTS_TOOLS",
        "HOME_THEATER_SYSTEMS",
        "MP3_PLAYERS",
        "RADIOS_CASETTE_PLAYERS"
      ]),
      CAMERAS: Object.freeze([
        "DIGITAL_CAMERAS_CAMCORDERS",
        "CAMERA_DRONES",
        "LENSES_STABILIZERS_FILTERS",
        "SECURITY_CAMERAS",
        "STUDIO_PROFESSIONAL_EQUIPMENT",
        "BINOCULAR_OPTICAL_INSTRUMENTS"
      ]),
      DESKTOPS_LAPTOPS: Object.freeze(["LAPTOPS", "MONITORS", "KEYBOARDS_MICE", "DESKTOPS"]),
      SMART_HOME_DEVICES: Object.freeze([
        "SMART_LIGHTS",
        "SMART_APPLIANCES",
        "SMART_SPEAKERS",
        "SMART_GARDEN",
        "MEDIA_STREAMERS"
      ]),
      HOME_SURVEILLANCE_SYSTEMS: Object.freeze(["HOME_SECURITY_CAMERA_SYSTEMS"])
    }),
    LIFESTYLE: Object.freeze({
      BEAUTY_HEALTH: Object.freeze([
        "FRAGRANCE",
        "MAKEUP",
        "MEDICINE_HEALTH_PRODUCTS",
        "HAIR_CARE",
        "SKIN_CARE",
        "BABY_DIAPERS_SUPPLIES",
        "HYGIENE_PRODUCTS",
        "MANICURE_PEDICURE"
      ]),
      SPORT: Object.freeze([
        "BALL_GAMES",
        "GYM_FITNESS_EQUIPMENT",
        "BICYCLES_EBIKES",
        "WATER_SPORTS",
        "CAMPING_HIKING",
        "PROTECTION_GEAR",
        "SPORTS_NUTRITION",
        "ROLLERSKATES_SKATEBOARDING",
        "ESCOOTERS_HOVERBOARDS"
      ]),
      FASHION_ACCESSORIES: Object.freeze([
        "JEWELLERY",
        "WEDDING_APPAREL",
        "CLOTHING",
        "OTHER_FASHION_ACCESSORIES",
        "SHOES",
        "WATCHES",
        "HAND_BAGS",
        "COSTUMES_UNIFORMS",
        "SPORTSWEAR_SWIMWEAR"
      ]),
      TRAVEL: Object.freeze([
        "TAGS_HANDLE_WRAPS",
        "SHOE_TOILETRY_BAGS",
        "LUGGAGE_BACKSPACKS",
        "BABY_STROLLERS",
        "SCALES_STRAPS",
        "COSMETIC_BAGS_CONTAINERS",
        "ORGANIZERS",
        "SAFETY_LOCKS",
        "PASSPORT_COVERS"
      ]),
      BOOKS: Object.freeze([
        "NON_FICTION",
        "FICTION",
        "CHILDRENS_BOOKS",
        "BOOK_ACCESSORIES",
        "COMICS",
        "MAGAZINES",
        "TEXTBOOKS"
      ])
    }),
    HOME_GARDEN: Object.freeze({
      FURNITURE: Object.freeze([
        "CARPETS_DOORMATS",
        "MIRRORS_WARDROBE",
        "TABLES_DESKS",
        "CABINETS_STORAGE",
        "PADS_PROTECTORS",
        "CURTAINS_BLINDS",
        "SOFAS_CHAIRS",
        "LIGHTS_CHANDELIERS",
        "BEDDING_CUSHIONS"
      ]),
      TOOLS_APPLIANCES: Object.freeze([
        "GENERAL_TOOLS_HOME_IMPROVEMENT",
        "AIR_CONDITIONERS_FANS",
        "VACUUM_CLEANERS",
        "IRONS_IRON_BOARDS",
        "WASHING_MACHINES_DRYERS"
      ]),
      KITCHEN: Object.freeze([
        "DRINKWARE_ACCESSORIES",
        "COOKWARE_UTENSILS",
        "MICROWAVES_OVENS",
        "DINNERWARE_CUTLERY",
        "REFRIGERATORS_WATER_COOLERS",
        "CONTAINERS_SUPPLIES",
        "DISHWASHERS_TRASH_COMPACTORS"
      ]),
      PETS: Object.freeze([
        "FOR_ADOPTION",
        "AQUARIUM",
        "CAT_FOOD",
        "DOG_FOOD",
        "LOST_FOUND_PETS",
        "PET_SUPPLIES"
      ]),
      DECORATIONS: Object.freeze([
        "CANDLES_VASES",
        "PHOTO_ALBUMS_FRAMES",
        "CLOCKS_TAPESTRIES",
        "CLEANING_PRODUCTS_FRAGRANCES",
        "CHILDRENS_DECOR",
        "BATH_ACCESSORIES"
      ]),
      GARDEN_OUTDOOR: Object.freeze([
        "LAMPS_SHADES",
        "BBQ_SETS_FIREPLACE",
        "PLANTS_SEEDS",
        "POOLS_FOUNTAINS"
      ])
    }),
    ART_COLLECTIBLES: Object.freeze({
      ARTS_CRAFTS: Object.freeze([
        "BEADING_JEWELRY_MAKING",
        "FABRICS_SEWING_KNITTING",
        "ARTS_CRAFTS_SUPPLIES",
        "OTHERS_IN_ARTS_CRAFTS",
        "PAINTINGS_DRAWINGS",
        "PARTY_DECORATIONS_SUPPLIES",
        "CRAFTING",
        "GIFT_WRAPPING_SUPPLIES",
        "PRINTMAKING_STAMPS"
      ]),
      COLLECTIBLES: Object.freeze([
        "MEMORABILIA",
        "OTHERS_IN_COLLECTIBLES",
        "PENS_WRITING_INSTRUMENTS",
        "TRADING_CARDS",
        "MODEL_CARS",
        "ROCKS_FOSSILS_ARTIFACTS",
        "ANTIQUES",
        "COINS"
      ]),
      NFTS: Object.freeze(["OTHERS_IN_NFTS"]),
      OTHERS_IN_ART_COLLECTIBLES: Object.freeze(["OTHERS_IN_ART_COLLECTIBLES"])
    }),
    ENTERTAINMENT: Object.freeze({
      OTHERS_IN_ENTERTAINMENT: Object.freeze(["OTHER_IN_ENTERTAINMENT"]),
      TICKETS_AND_VOUCHERS: Object.freeze([
        "EVENTS",
        "VOUCHERS_GIFT_CARDS",
        "CONCERTS",
        "OTHERS_IN_TICKETS_AND_VOUCHERS",
        "ACTIVITIES_ATTRACTIONS",
        "CINEMA_THEATER",
        "TRAVEL_TOURS"
      ]),
      TOYS: Object.freeze([
        "EDUCATIONAL_BUILDING",
        "BOARD_GAMES_CARDS",
        "CLASSIC_VINTAGE",
        "BABY_PRESCHOOL",
        "DOLLS",
        "ACTION_FIGURES",
        "REMOTE_CONTROL_TOY_VEHICLES",
        "OTHERS_IN_TOYS"
      ])
    })
  });

  const getNoonCategories = () => Object.keys(NOON_TAXONOMY);

  const getNoonSubCategories = (category) => Object.keys(NOON_TAXONOMY[category] || {});

  const getNoonSubSubCategories = (category, subCategory) => [
    ...(NOON_TAXONOMY[category]?.[subCategory] || [])
  ];

  const isValidNoonSelection = (category, subCategory, subSubCategory) =>
    getNoonSubSubCategories(category, subCategory).includes(subSubCategory);

  const compareOptionLabels = (left, right) => {
    const leftIsOther = normalizeText(left) === "other";
    const rightIsOther = normalizeText(right) === "other";
    if (leftIsOther !== rightIsOther) return leftIsOther ? 1 : -1;
    return left.localeCompare(right, undefined, { sensitivity: "base" });
  };

  const makeAd = (cells, index) => ({
    id: index + 1,
    listed: {
      category: "",
      color: "",
      condition: "VERY_GOOD",
      availableTrims: [],
      makeCode: null,
      makeModel: "",
      modelCode: null,
      specs: "",
      transmission: "",
      trim: "",
      trimCode: null,
      verifiedAt: "",
      noonCategory: "",
      noonCondition: NOON_CONDITION,
      noonSubCategory: "",
      noonSubSubCategory: ""
    },
    source: {
      adName: cells[3] || "",
      agent: cells[4] || "",
      category: cells[1] || "",
      date: cells[0] || "",
      url: cells[5] || "",
      vendor: cells[2] || ""
    },
    status: "pending",
    unlisted: {
      date: "",
      reason: ""
    }
  });

  const parseCopiedRows = (text) => {
    const ads = [];
    const invalidLines = [];

    String(text ?? "")
      .replace(/\r/g, "")
      .split("\n")
      .forEach((line, lineIndex) => {
        if (!line.trim()) {
          return;
        }

        const cells = line.split("\t");

        if (cells.length < 6 || !/^https?:\/\//i.test(cleanCell(cells[5]))) {
          invalidLines.push(lineIndex + 1);
          return;
        }

        ads.push(makeAd(cells.slice(0, 6), ads.length));
      });

    return { ads, invalidLines };
  };

  const toTsv = (rows) => rows.map((row) => row.map(cleanCell).join("\t")).join("\n");

  const buildListedOutput = (ads) => {
    const rows = ads.map((ad) => {
      if (ad.status === "listed") {
        if (isNoonUrl(ad.source.url)) {
          return [
            ad.source.url,
            ad.listed.noonCategory,
            ad.listed.noonSubCategory,
            ad.listed.noonSubSubCategory,
            NOON_CONDITION
          ];
        }

        const isDubiCars = isDubiCarsUrl(ad.source.url);
        return [
          ad.source.url,
          ad.listed.category,
          ad.listed.makeModel,
          ad.listed.trim,
          ad.listed.color,
          "VERY_GOOD",
          isDubiCars ? "" : ad.listed.specs,
          isDubiCars ? "" : ad.listed.transmission
        ];
      }

      if (["pending", "review_later"].includes(ad.status)) {
        if (isNoonUrl(ad.source.url)) {
          return [ad.source.url, "", "", "", ""];
        }
        return [ad.source.url, "", "", "", "", "", "", ""];
      }

      if (isNoonUrl(ad.source.url)) {
        return ["", "", "", "", ""];
      }
      return ["", "", "", "", "", "", "", ""];
    });

    return {
      pendingCount: ads.filter((ad) => ad.status === "pending").length,
      rowCount: rows.length,
      text: toTsv(rows)
    };
  };

  const buildUnlistedOutput = (ads) => {
    const rows = ads
      .filter((ad) => ad.status === "unlisted")
      .map((ad) => [ad.unlisted.date, ad.source.url, ad.unlisted.reason, ad.source.vendor]);

    return {
      rowCount: rows.length,
      text: toTsv(rows)
    };
  };

  const getReasonSuggestions = (sheetRows, ads) => {
    const reasons = new Map();

    [...sheetRows.map((row) => row.unlistedReason), ...ads.map((ad) => ad.unlisted.reason)].forEach(
      (reason) => {
        const key = normalizeText(reason);

        if (key && !reasons.has(key)) {
          reasons.set(key, cleanCell(reason));
        }
      }
    );

    return [...reasons.values()].sort(compareOptionLabels);
  };

  const getCounts = (ads) => {
    const counts = {
      listed: 0,
      pending: 0,
      reviewLater: 0,
      total: ads.length,
      unlisted: 0
    };

    ads.forEach((ad) => {
      if (ad.status === "review_later") {
        counts.reviewLater += 1;
      } else if (Object.hasOwn(counts, ad.status)) {
        counts[ad.status] += 1;
      }
    });

    return counts;
  };

  return Object.freeze({
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
    normalizeText,
    parseCopiedRows
  });
})();
