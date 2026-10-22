(async () => {
  const clean = (value) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const absoluteUrl = (value) => {
    try {
      const url = new URL(clean(value), location.href);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        `${url.origin}${url.pathname}${url.search}` ===
          `${location.origin}${location.pathname}${location.search}`
      ) {
        return "";
      }
      return url.href;
    } catch (error) {
      return "";
    }
  };
  // OneDrive folder tiles expose authenticated thumbnail URLs, not public
  // product galleries. Keep only image file tiles and request their originals.
  if (location.protocol === "https:" && /^[a-z0-9-]+\.sharepoint\.com$/i.test(location.hostname)) {
    const images = [];
    const seen = new Set();
    for (const row of document.querySelectorAll(
      "[role='gridcell'],[data-automationid='DetailsRow']"
    )) {
      if (!visible(row)) continue;
      const name = row.querySelector(
        "[data-automationid='name'],[data-automationid='FieldRenderer-name']"
      );
      const filename = clean(
        name?.getAttribute("title") || name?.getAttribute("aria-label") || name?.textContent
      );
      if (!/\.(?:jpe?g|png|webp|avif)$/i.test(filename)) continue;
      for (const image of row.querySelectorAll("img")) {
        try {
          const url = new URL(image.currentSrc || image.src, location.href);
          const itemPath = url.pathname.match(
            /^(\/_api\/v2\.0\/drives\/[^/]+\/items\/[^/]+)\/thumbnails\/[^/]+\/[^/]+\/content$/i
          )?.[1];
          if (url.origin !== location.origin || !itemPath) continue;
          const original = `${url.origin}${itemPath}/content`;
          if (seen.has(original)) continue;
          seen.add(original);
          images.push({ alt: filename, url: original });
        } catch {
          // Ignore decorative icons and unsupported/non-image rows.
        }
      }
    }
    // Main.jpeg is the cover in shared product folders; keep all other files
    // in the folder's displayed order and retain the existing review controls.
    images.sort(
      (left, right) =>
        Number(/^main\.(?:jpe?g|png|webp|avif)$/i.test(right.alt)) -
        Number(/^main\.(?:jpe?g|png|webp|avif)$/i.test(left.alt))
    );
    return {
      images: images.slice(0, 20),
      sourceTitle: clean(document.title),
      sourceUrl: location.href
    };
  }
  const originalSizeUrl = (value) => {
    const absolute = absoluteUrl(value);
    if (!absolute) return "";
    const url = new URL(absolute);
    if (url.hostname === "content.deal-drive.com") {
      url.pathname = url.pathname.replace(
        /(\/thumbs\/[a-f0-9]{32,}\/)(?:crop|fit)-[^/]+\.(?:avif|jpe?g|png|webp)$/i,
        "$1orig.webp"
      );
    }
    if (/\/wp-content\/uploads\//i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/-\d+x\d+(?=\.(?:avif|jpe?g|png|webp)$)/i, "");
    }
    return url.href;
  };
  const canonicalKey = (value) => {
    try {
      const url = new URL(originalSizeUrl(value) || value, location.href);
      url.hash = "";
      ["auto", "fit", "format", "h", "height", "q", "quality", "resize", "w", "width"].forEach(
        (parameter) => url.searchParams.delete(parameter)
      );
      url.searchParams.sort();
      return url.href;
    } catch (error) {
      return "";
    }
  };
  const excludedWords =
    /\b(?:avatar|badge|banner|brand|dealer|icon|logo|lowmilage-nbg|map|placeholder|profile|qr|spinner)\b/i;
  const unrelatedWords =
    /\b(?:also[-_\s]?like|other[-_\s]?vehicles?|recommend(?:ed|ations?)?|related|similar|suggest(?:ed|ions?)?)\b/i;
  const contextName = (element) =>
    clean(
      [
        element?.id,
        typeof element?.className === "string" ? element.className : "",
        element?.getAttribute?.("aria-label"),
        element?.getAttribute?.("data-testid")
      ].join(" ")
    );
  const isRelatedContext = (element) => {
    let current = element;
    for (let depth = 0; current && depth < 7; depth += 1) {
      if (unrelatedWords.test(contextName(current))) return true;
      current = current.parentElement;
    }
    const card = element.closest("article,li");
    if (!card || card.querySelectorAll("img").length > 3) return false;
    const heading = clean(card.querySelector("h2,h3,h4")?.textContent);
    const link = card.querySelector("a[href]");
    if (!heading || !link) return false;
    try {
      const target = new URL(link.href, location.href);
      return `${target.pathname}${target.search}` !== `${location.pathname}${location.search}`;
    } catch (error) {
      return false;
    }
  };
  const largestSrcset = (srcset) => {
    const candidates = clean(srcset)
      .split(",")
      .map((candidate) => {
        const [url, size = "0"] = candidate.trim().split(/\s+/);
        return { size: Number.parseFloat(size) || 0, url };
      })
      .filter((candidate) => candidate.url);
    candidates.sort((left, right) => right.size - left.size);
    return candidates[0]?.url || "";
  };
  const imageSources = (image) => {
    const values = [
      image.getAttribute("data-zoom-image"),
      image.getAttribute("data-full-src"),
      image.getAttribute("data-full"),
      image.getAttribute("data-large"),
      image.getAttribute("data-original"),
      largestSrcset(image.getAttribute("srcset")),
      ...[...(image.parentElement?.querySelectorAll?.("source[srcset]") || [])].map((source) =>
        largestSrcset(source.getAttribute("srcset"))
      ),
      image.getAttribute("data-lazy-src"),
      image.getAttribute("data-src"),
      image.currentSrc,
      image.src
    ];
    const link = image.closest("a[href]");
    if (link && /\.(?:avif|jpe?g|png|webp)(?:[?#]|$)/i.test(link.href)) {
      values.unshift(link.href);
    }
    return values.map(originalSizeUrl).filter(Boolean);
  };
  const dubiCarsPhotoKey = (value) => {
    try {
      const url = new URL(value);
      if (!/(^|\.)dubicars\.com$/i.test(url.hostname)) return "";
      const match = url.pathname.match(/^\/images\/[^/]+\/(?:w_\d+x\d+|\d+x\d+)\/(.+)$/i);
      return match ? `${url.origin}/${match[1].toLowerCase()}` : "";
    } catch (error) {
      return "";
    }
  };
  const dubiCarsLargeImages = new Map();
  const indexDubiCarsLargeImages = () => {
    if (!/(^|\.)dubicars\.com$/i.test(location.hostname)) return;
    [...document.querySelectorAll("img")].forEach((image) => {
      const large = imageSources(image).find((source) =>
        /\/w_(?:[6-9]\d\d|\d{4,})x(?:[4-9]\d\d|\d{4,})\//i.test(source)
      );
      const key = dubiCarsPhotoKey(large);
      if (key && !dubiCarsLargeImages.has(key)) dubiCarsLargeImages.set(key, large);
    });
  };
  const bestSourceFor = (image) => {
    const source = imageSources(image)[0] || "";
    return dubiCarsLargeImages.get(dubiCarsPhotoKey(source)) || source;
  };
  const embeddedDubizzleImages = () => {
    if (!/(^|\.)dubizzle\.com$/i.test(location.hostname)) return [];
    const found = [];
    const seen = new Set();
    const add = (value) => {
      if (typeof value !== "string" || !/dbz-images\.dubizzle\.com/i.test(value)) return;
      const url = originalSizeUrl(value);
      const key = canonicalKey(url);
      if (!key || seen.has(key)) return;
      seen.add(key);
      found.push({ alt: "", url });
    };
    const visit = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 12) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => visit(entry, depth + 1));
        return;
      }
      Object.entries(value).forEach(([key, entry]) => {
        if (key === "photos" && Array.isArray(entry)) entry.forEach(add);
        visit(entry, depth + 1);
      });
    };
    document
      .querySelectorAll("script[type='application/json'],script#__NEXT_DATA__")
      .forEach((script) => {
        try {
          visit(JSON.parse(script.textContent));
        } catch (error) {
          return;
        }
      });
    return found;
  };
  const waitForDotSelection = async (dot) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (dot.classList.contains("active")) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return dot.classList.contains("active");
  };
  const collectRotatingCarouselImages = async () => {
    const gallery = document.querySelector(".sell-car-slider-main .car-slider-top");
    const mainImage = gallery?.querySelector(".car-slider-left .slider-main-img");
    const dots = [
      ...(gallery?.querySelectorAll?.(".car-slider-left .mobile-dot-indicators .dot") || [])
    ];
    const declaredCount = Number.parseInt(
      clean(gallery?.querySelector(".car-slider-left .mobile-image-count span")?.textContent),
      10
    );
    const total = Math.min(
      20,
      dots.length || (Number.isInteger(declaredCount) ? declaredCount : 0)
    );
    if (!mainImage || total < 2) return [];

    const originalIndex = Math.max(
      0,
      dots.findIndex((dot) => dot.classList.contains("active"))
    );
    const collected = [];
    const seen = new Set();
    const addMainImage = () => {
      const url = bestSourceFor(mainImage);
      const key = canonicalKey(url);
      if (!key || seen.has(key)) return;
      seen.add(key);
      collected.push({ alt: clean(mainImage.alt), url });
    };
    const selectDot = async (index) => {
      const dot = dots[index];
      if (!dot) return false;
      dot.click();
      return waitForDotSelection(dot);
    };

    let currentIndex = originalIndex;
    for (let index = 0; index < total; index += 1) {
      if (index !== currentIndex && !(await selectDot(index))) break;
      currentIndex = index;
      addMainImage();
    }
    if (currentIndex !== originalIndex) {
      await selectDot(originalIndex);
    }
    return collected;
  };
  const eligibleImage = (image, allowThumbnail = false) => {
    if (!image || isRelatedContext(image)) return false;
    const identity = clean(
      [
        image.alt,
        image.title,
        image.id,
        typeof image.className === "string" ? image.className : ""
      ].join(" ")
    );
    if (excludedWords.test(identity)) return false;
    if (
      /lowmilage-nbg|shopify.*(?:logo|brand)|img\.youtube\.com|panorama|\/themes?\/.*(?:logo|icon|pdf)/i.test(
        image.currentSrc || image.src || ""
      )
    )
      return false;
    const width = image.naturalWidth || Number(image.getAttribute("width")) || 0;
    const height = image.naturalHeight || Number(image.getAttribute("height")) || 0;
    return allowThumbnail || !((width && width < 320) || (height && height < 200));
  };
  const thumbnailLike = (image) => {
    const raw = clean(
      image.getAttribute("src") || image.getAttribute("data-src") || image.currentSrc
    );
    const width = image.naturalWidth || Number(image.getAttribute("width")) || 0;
    const height = image.naturalHeight || Number(image.getAttribute("height")) || 0;
    return (
      /(?:thumb|thumbnail|crop-\d+x|fit-\d+x|-\d+x\d+\.(?:avif|jpe?g|png|webp))/i.test(raw) ||
      (width >= 120 && width <= 420 && height >= 75 && height <= 300)
    );
  };
  const imagesFrom = (root, preferStableThumbnails = false) => {
    const results = [];
    const seen = new Set();
    const add = (url, alt = "") => {
      const key = canonicalKey(url);
      if (!key || seen.has(key)) return;
      seen.add(key);
      results.push({ alt: clean(alt), url });
    };
    const candidates = [...root.querySelectorAll("img")].filter((image) =>
      eligibleImage(image, true)
    );
    const thumbnails = candidates.filter(thumbnailLike);
    const ordered = preferStableThumbnails && thumbnails.length >= 3 ? thumbnails : candidates;
    ordered.forEach((image) => {
      if (!preferStableThumbnails && !eligibleImage(image)) return;
      const bestSource = bestSourceFor(image);
      if (bestSource) add(bestSource, image.alt);
    });
    [...root.querySelectorAll("[style*='background-image']")].forEach((element) => {
      if (isRelatedContext(element)) return;
      const match = getComputedStyle(element).backgroundImage.match(/url\((?:"|')?(.+?)(?:"|')?\)/);
      if (match) add(absoluteUrl(match[1]), element.getAttribute("aria-label"));
    });
    return results;
  };

  const pageRoot = document.querySelector("main,[role='main']") || document.body;
  const overlaysBefore = new Set([
    ...document.querySelectorAll(
      "[role='dialog'],[aria-modal='true'],[class*='lightbox' i],[class*='modal' i]"
    )
  ]);
  const photoControl = [
    ...pageRoot.querySelectorAll("button,[role='button'],a[href^='#'],a[href^='javascript:']")
  ].find(
    (element) =>
      visible(element) &&
      /(?:show|view|see|open)\s+(?:(?:all|more)\s+)?(?:\d+\s+)?(?:car\s+)?(?:photos?|images?)/i.test(
        clean(element.getAttribute("aria-label") || element.textContent)
      )
  );
  if (photoControl) {
    photoControl.click();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  indexDubiCarsLargeImages();
  const dubizzleImages = embeddedDubizzleImages();
  const rotatingCarouselImages = await collectRotatingCarouselImages();

  const roots = new Set();
  const addRoot = (element) => {
    if (element && !isRelatedContext(element)) roots.add(element);
  };
  [
    ...document.querySelectorAll(
      "[role='dialog'],[aria-modal='true'],[class*='lightbox' i],[class*='gallery' i],[id*='gallery' i],[class*='photos' i],[id*='photos' i],[class*='carousel' i],[class*='slider' i],[class*='swiper' i],[data-testid*='gallery' i]"
    )
  ].forEach(addRoot);
  [...pageRoot.querySelectorAll("img")]
    .filter((image) => eligibleImage(image, true))
    .forEach((image) => {
      let current = image.parentElement;
      for (let depth = 0; current && depth < 5 && current !== pageRoot; depth += 1) {
        if (current.querySelectorAll("img").length >= 3) addRoot(current);
        current = current.parentElement;
      }
    });
  addRoot(pageRoot);

  const scored = [...roots]
    .map((root) => {
      const candidateImages = [...root.querySelectorAll("img")].filter((image) =>
        eligibleImage(image, true)
      );
      const stableThumbnails = candidateImages.filter(thumbnailLike).length >= 3;
      const images = imagesFrom(root, stableThumbnails);
      const name = contextName(root);
      const isNewOverlay =
        photoControl &&
        !overlaysBefore.has(root) &&
        (root.matches("[role='dialog'],[aria-modal='true']") || /lightbox|modal/i.test(name));
      const otherVehicleLinks = [...root.querySelectorAll("a[href]")].filter((link) => {
        if (!link.querySelector("img")) return false;
        try {
          const target = new URL(link.href, location.href);
          if (/\.(?:avif|jpe?g|png|webp)(?:[?#]|$)/i.test(target.href)) {
            return false;
          }
          return `${target.pathname}${target.search}` !== `${location.pathname}${location.search}`;
        } catch (error) {
          return false;
        }
      }).length;
      const semantic = /gallery|photos|carousel|slider|swiper|lightbox/i.test(name);
      const thumbnailSemantic = /thumb|thumbnail/i.test(name);
      const score =
        Math.min(images.length, 20) * 8 +
        (semantic ? 45 : 0) +
        (thumbnailSemantic ? 80 : 0) +
        (stableThumbnails ? 90 : 0) +
        (isNewOverlay ? 25 : 0) +
        (visible(root) ? 8 : 0) -
        otherVehicleLinks * 20 -
        (root === pageRoot ? 35 : 0);
      return { images, root, score };
    })
    .filter((candidate) => candidate.images.length)
    .sort((left, right) => right.score - left.score || right.images.length - left.images.length);

  let images = dubizzleImages.length
    ? [...dubizzleImages, ...rotatingCarouselImages, ...(scored[0]?.images || [])]
    : rotatingCarouselImages.length
      ? [...rotatingCarouselImages, ...(scored[0]?.images || [])]
      : scored[0]?.images || [];
  if (images.length < 3) {
    const fallback = [];
    const addFallback = (value, alt = "") => {
      const url = absoluteUrl(value);
      if (url) fallback.push({ alt: clean(alt), url });
    };
    document
      .querySelectorAll("meta[property='og:image'],meta[name='twitter:image']")
      .forEach((meta) => addFallback(meta.content, document.title));
    document.querySelectorAll("script[type='application/ld+json']").forEach((script) => {
      try {
        const visit = (value) => {
          if (!value || typeof value !== "object") return;
          if (Array.isArray(value)) {
            value.forEach(visit);
            return;
          }
          const type = clean(value["@type"]);
          if (/car|product|vehicle/i.test(type)) {
            (Array.isArray(value.image) ? value.image : [value.image]).forEach((image) =>
              addFallback(typeof image === "object" ? image?.url : image)
            );
          }
          Object.values(value).forEach(visit);
        };
        visit(JSON.parse(script.textContent));
      } catch (error) {
        return;
      }
    });
    images = [...images, ...fallback];
  }

  const seen = new Set();
  images = images
    .filter((image) => {
      const key = canonicalKey(image.url);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  if (photoControl) {
    const opened = scored.find(
      (candidate) =>
        !overlaysBefore.has(candidate.root) &&
        (candidate.root.matches("[role='dialog'],[aria-modal='true']") ||
          /lightbox|modal/i.test(contextName(candidate.root)))
    )?.root;
    const close = opened
      ? [...opened.querySelectorAll("button")].find((button) =>
          /^(?:close|×)$/i.test(clean(button.getAttribute("aria-label") || button.textContent))
        )
      : null;
    close?.click();
  }

  return {
    images,
    sourceTitle:
      clean(document.querySelector("main h1,[role='main'] h1,h1")?.textContent) ||
      clean(document.title),
    sourceUrl: location.href
  };
})();
