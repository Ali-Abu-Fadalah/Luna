(() => {
  const cleanText = (value) =>
    String(value ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");

  const absoluteUrl = (value) => {
    try {
      const url = new URL(value, globalThis.location.href);
      if (!["http:", "https:"].includes(url.protocol)) {
        return "";
      }
      if (!/^#(?:!\/|\/)/.test(url.hash)) {
        url.hash = "";
      }
      return url.href;
    } catch (error) {
      return "";
    }
  };

  const listingUrlKey = (value) => {
    try {
      const url = new URL(value, globalThis.location.href);
      if (!["http:", "https:"].includes(url.protocol)) {
        return "";
      }
      if (!/^#(?:!\/|\/)/.test(url.hash)) {
        url.hash = "";
      }
      [
        "fbclid",
        "gclid",
        "mc_cid",
        "mc_eid",
        "ref",
        "return_filters",
        "return_url",
        "source",
        "utm_campaign",
        "utm_content",
        "utm_medium",
        "utm_source",
        "utm_term"
      ].forEach((parameter) => url.searchParams.delete(parameter));
      url.searchParams.sort();
      return url.href;
    } catch (error) {
      return "";
    }
  };

  const isVisible = (element) => {
    if (!element || element.hidden || element.getAttribute("aria-hidden") === "true") {
      return false;
    }
    const style = globalThis.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  };

  const clearMarks = () => {
    document.querySelectorAll("[data-luna-scraper-mark]").forEach((element) => {
      element.style.removeProperty("outline");
      element.style.removeProperty("outline-offset");
      element.removeAttribute("data-luna-scraper-mark");
      element.removeAttribute("data-luna-scraper-reason");
    });
  };

  const mark = (element, type, reason) => {
    if (!element) {
      return;
    }
    const outlines = {
      accepted: "3px solid #79b7ff",
      excluded: "3px dashed #ef6b7a",
      unlisted: "3px dashed #f0a35b"
    };
    element.dataset.lunaScraperMark = type;
    element.dataset.lunaScraperReason = cleanText(reason) || type;
    element.style.setProperty("outline", outlines[type] || outlines.excluded, "important");
    element.style.setProperty("outline-offset", "2px", "important");
  };

  const makeCollector = (site, mode, options = {}) => {
    const accepted = [];
    const unlisted = [];
    const excluded = [];
    let detected = 0;

    const add = (card, item) => {
      detected += 1;
      const title = cleanText(item.title);
      const url = absoluteUrl(item.url);
      const price = cleanText(item.price);
      const statusText = cleanText(item.statusText).toLowerCase();
      const hasNumericPrice = /\d/.test(price);
      const sold = item.sold || /(^|\W)sold(\W|$)/i.test(statusText);
      const por =
        !hasNumericPrice &&
        (item.por ||
          /(?:^|\W)por(?:\W|$)|price\s+on\s+request|price\s+upon\s+request|call\s+for\s+price|contact\s+for\s+price/i.test(
            `${price} ${statusText}`
          ));

      if (!url) {
        excluded.push({ reason: "Invalid URL", title, url: "" });
        mark(card, "excluded", "Invalid URL");
        return;
      }
      if (!title) {
        excluded.push({ reason: "Missing title", title: "", url });
        mark(card, "excluded", "Missing title");
        return;
      }
      if (options.ignoreSoldAndPor !== true && (sold || por)) {
        unlisted.push({
          reason: sold ? "Sold" : "POR",
          title,
          url
        });
        mark(card, "unlisted", sold ? "Sold" : "POR");
        return;
      }

      accepted.push({
        id: `listing-${accepted.length + 1}`,
        price,
        title,
        url
      });
      mark(card, "accepted", "Accepted");
    };

    return {
      add,
      result() {
        return {
          accepted,
          detected,
          excluded,
          mode,
          pageTitle: document.title,
          pageUrl: globalThis.location.href,
          site,
          unlisted
        };
      }
    };
  };

  const dubizzleAdapter = {
    matches(hostname) {
      return hostname === "dubizzle.com" || hostname.endsWith(".dubizzle.com");
    },
    scrape() {
      const collector = makeCollector("Dubizzle", "adapter");
      const cards = [...document.querySelectorAll('a[data-testid^="listing-"]')].filter(
        (card) =>
          isVisible(card) &&
          /\/motors\/used-cars\/[^?]+\/\d{4}\//.test(card.getAttribute("href") || "")
      );

      cards.forEach((card) => {
        const titleElement = card.querySelector('[data-testid="subheading-text"], h2');
        const priceText = cleanText(
          card.querySelector('[data-testid="listing-price"]')?.textContent
        );
        collector.add(card, {
          price: priceText && !/\bAED\b/i.test(priceText) ? `AED ${priceText}` : priceText,
          statusText: card.textContent,
          title: titleElement?.getAttribute("title") || titleElement?.textContent,
          url: card.getAttribute("href")
        });
      });

      return collector.result();
    }
  };

  const dubicarsAdapter = {
    matches(hostname) {
      return hostname === "dubicars.com" || hostname.endsWith(".dubicars.com");
    },
    scrape() {
      const collector = makeCollector("DubiCars", "adapter");
      const currencyPricePattern =
        /(?:\b(?:AED|DHS?|USD|SAR)\s*[\d,.]+|[$€£]\s*[\d,.]+|[\d,.]+\s*(?:AED|DHS?|USD|SAR)\b)/i;
      const findDisplayedPrice = (card) => {
        const dedicatedPriceSelectors = [
          "[data-price]",
          '[itemprop="price"]',
          ".price strong",
          '[class~="price"] strong',
          ".price",
          '[class~="price"]'
        ];

        for (const selector of dedicatedPriceSelectors) {
          const element = card.querySelector(selector);
          const text = cleanText(element?.innerText || element?.textContent);
          if (isVisible(element) && /\d/.test(text)) {
            return text;
          }
        }

        const legacyPrice = card.querySelector("strong.text-dark");
        const legacyText = cleanText(legacyPrice?.innerText || legacyPrice?.textContent);
        const legacyMatch = legacyText.match(currencyPricePattern);
        if (isVisible(legacyPrice) && legacyMatch) {
          return legacyMatch[0];
        }

        const cardMatch = cleanText(card.innerText || card.textContent).match(currencyPricePattern);
        return cardMatch?.[0] || "";
      };
      const cards = [
        ...document.querySelectorAll("#serp-list li.serp-list-item[data-item-id]")
      ].filter(isVisible);

      cards.forEach((card) => {
        const link = card.querySelector(
          'a.image-container[href], a[href$=".html"], a[href*=".html?"]'
        );
        collector.add(card, {
          price: findDisplayedPrice(card),
          statusText: card.innerText,
          title:
            card.getAttribute("data-item-title") ||
            card.querySelector("img[alt]")?.getAttribute("alt"),
          url: link?.getAttribute("href")
        });
      });

      return collector.result();
    }
  };

  const noonAdapter = {
    matches(hostname) {
      return hostname === "noon.com" || hostname.endsWith(".noon.com");
    },
    scrape() {
      const collector = makeCollector("Noon", "adapter", {
        ignoreSoldAndPor: true
      });
      const cards = [...document.querySelectorAll('[data-qa="plp-product-box"]')].filter(isVisible);

      cards.forEach((card) => {
        const link = card.querySelector('a[href*="/p/"]');
        const titleElement = card.querySelector('[data-qa="plp-product-box-name"]');
        const priceElement = card.querySelector('[data-qa="plp-product-box-price"]');
        const amount = cleanText(priceElement?.querySelector("strong")?.textContent);

        collector.add(card, {
          price: amount ? (/\b(?:AED|DHS?)\b/i.test(amount) ? amount : `AED ${amount}`) : "",
          statusText: card.innerText || card.textContent,
          title: titleElement?.getAttribute("title") || titleElement?.textContent,
          url: link?.getAttribute("href")
        });
      });

      return collector.result();
    }
  };

  const bayutAdapter = {
    matches(hostname) {
      return hostname === "bayut.com" || hostname.endsWith(".bayut.com");
    },
    scrape() {
      const collector = makeCollector("Bayut", "adapter");
      const titleElements = [...document.querySelectorAll('[aria-label="Title"]')].filter(
        isVisible
      );

      const findListingContainer = (titleElement) => {
        let current = titleElement;
        let container = titleElement.parentElement || titleElement;

        for (let depth = 0; depth < 10 && current; depth += 1) {
          const titleCount = current.querySelectorAll?.('[aria-label="Title"]').length || 0;
          if (titleCount > 1) {
            break;
          }
          if (current.querySelector?.('a[aria-label="Listing link"][href*="/property/details-"]')) {
            container = current;
          }
          current = current.parentElement;
        }

        return container;
      };

      titleElements.forEach((titleElement) => {
        const card = findListingContainer(titleElement);
        const link = card.querySelector('a[aria-label="Listing link"][href*="/property/details-"]');
        if (!link) {
          return;
        }
        const amount = cleanText(card.querySelector('[aria-label="Price"]')?.textContent);
        const currency = cleanText(card.querySelector('[aria-label="Currency"]')?.textContent);

        collector.add(card, {
          price:
            amount && currency && !amount.toLowerCase().startsWith(currency.toLowerCase())
              ? `${currency} ${amount}`
              : amount,
          statusText: card.innerText || card.textContent,
          title: titleElement.textContent,
          url: link?.getAttribute("href")
        });
      });

      return collector.result();
    }
  };

  const genericAdapter = {
    matches() {
      return true;
    },
    scrape() {
      const siteName = globalThis.location.hostname.replace(/^www\./i, "");
      const collector = makeCollector(siteName, "generic");
      const pricePattern =
        /(?:\b(?:AED|DHS?\.?|USD|SAR|QAR|OMR|KWD|BHD)\s*[\d,.]+|[$€£]\s*[\d,.]+|[\d,.]+\s*(?:AED|DHS?\.?|USD|SAR|QAR|OMR|KWD|BHD)\b)/i;
      const detailPattern =
        /\b(?:view|show|see)\s+(?:details?|more)\b|\b(?:vehicle|inventory|listing|car)\s+details?\b|عرض\s+(?:التفاصيل|السيارة)/i;
      const routePattern =
        /(?:\/(?:vehicle|vehicles|inventory|listing|listings|cars?|motors?|product|products)\/[^/?#]+|[?&](?:vehicle|listing|ad|item|product|car|id)=[^&#]+|#(?:!\/|\/).*(?:vehicle|listing|details?|cars?)\/?[^?#]*)/i;
      const excludedRoutePattern =
        /\/(?:search|category|categories|dealer|dealers|news|blog|contact|about|login|register|privacy|terms)(?:\/|$)/i;

      const findPrice = (container) => {
        const explicit = container?.querySelector(
          '[data-price], [itemprop="price"], [class*="price"], [class*="Price"]'
        );
        const explicitText = cleanText(explicit?.textContent);
        if (pricePattern.test(explicitText)) {
          return explicitText.match(pricePattern)?.[0] || explicitText;
        }

        const match = cleanText(container?.textContent).match(pricePattern);
        return match?.[0] || "";
      };

      const cleanTitleCandidate = (value) => {
        const title = cleanText(value);
        if (
          title.length < 3 ||
          title.length > 300 ||
          /^(?:19|20)\d{2}$/.test(title) ||
          /^(?:(?:view|show|see|read|learn)\s+(?:vehicle\s+|listing\s+|car\s+)?(?:details?|more)|details?|more|whats\s*app|contact|call(?:\s+now)?)$/i.test(
            title
          )
        ) {
          return "";
        }
        return title;
      };

      const titleFromLabel = (value) => {
        const label = cleanText(value);
        const match = label.match(
          /^(?:view|show|see)\s+(?:vehicle\s+|listing\s+|car\s+)?(?:details?|more)\s+(?:for|about)\s+(.+)$/i
        );
        return cleanTitleCandidate(match?.[1]);
      };

      const anchors = [...document.querySelectorAll("a[href]")]
        .filter(isVisible)
        .filter((anchor) => {
          if (anchor.closest("header, nav, footer")) {
            return false;
          }

          const url = absoluteUrl(anchor.getAttribute("href"));
          if (!url) {
            return false;
          }

          const parsed = new URL(url);
          const route = `${parsed.pathname}${parsed.search}${parsed.hash}`;
          if (
            parsed.origin !== globalThis.location.origin ||
            excludedRoutePattern.test(parsed.pathname) ||
            url === absoluteUrl(globalThis.location.href)
          ) {
            return false;
          }

          return (
            routePattern.test(route) ||
            detailPattern.test(cleanText(anchor.textContent)) ||
            detailPattern.test(cleanText(anchor.getAttribute("aria-label")))
          );
        });
      const anchorKeys = new Map();
      const groups = new Map();

      anchors.forEach((anchor) => {
        const key = listingUrlKey(anchor.getAttribute("href"));
        if (!key) {
          return;
        }
        const url = absoluteUrl(anchor.getAttribute("href"));
        anchorKeys.set(anchor, key);
        if (!groups.has(url)) {
          groups.set(url, []);
        }
        groups.get(url).push(anchor);
      });

      const findContainer = (anchor, key) => {
        let current = anchor;
        let best = anchor.parentElement || anchor;

        for (let depth = 0; depth < 10 && current; depth += 1) {
          if (
            current === document.body ||
            current === document.documentElement ||
            current.matches("main, [role='main']")
          ) {
            break;
          }

          const containedKeys = new Set();
          anchorKeys.forEach((candidateKey, candidate) => {
            if (current.contains(candidate)) {
              containedKeys.add(candidateKey);
            }
          });

          if (containedKeys.size > 1) {
            break;
          }
          if (
            containedKeys.size === 1 &&
            containedKeys.has(key) &&
            cleanText(current.textContent).length <= 2500
          ) {
            best = current;
          }
          current = current.parentElement;
        }

        return best;
      };

      const findTitle = (group, container) => {
        for (const anchor of group) {
          const title = titleFromLabel(anchor.getAttribute("aria-label"));
          if (title) {
            return title;
          }
        }

        for (const anchor of group) {
          const title = cleanTitleCandidate(anchor.textContent);
          if (title) {
            return title;
          }
        }

        for (const anchor of group) {
          const label = cleanTitleCandidate(anchor.getAttribute("aria-label"));
          if (label && !detailPattern.test(label)) {
            return label;
          }
        }

        const localTitle = container?.querySelector(
          '[itemprop="name"], [data-title], h1, h2, h3, h4, h5, h6, [role="heading"], [class*="title"], [class*="Title"]'
        );
        const localTitleText = cleanTitleCandidate(
          localTitle?.getAttribute("data-title") ||
            localTitle?.getAttribute("title") ||
            localTitle?.textContent
        );
        if (localTitleText) {
          return localTitleText;
        }

        for (const anchor of group) {
          const title = cleanTitleCandidate(
            anchor.getAttribute("data-title") || anchor.getAttribute("title")
          );
          if (title) {
            return title;
          }
        }

        for (const anchor of group) {
          const imageTitle = cleanTitleCandidate(
            anchor.querySelector("img[alt]")?.getAttribute("alt")
          );
          if (imageTitle) {
            return imageTitle;
          }
        }

        return cleanTitleCandidate(container?.querySelector("img[alt]")?.getAttribute("alt"));
      };

      groups.forEach((group) => {
        const anchor = group[0];
        const key = anchorKeys.get(anchor);
        const container = findContainer(anchor, key);

        collector.add(container || anchor, {
          price: findPrice(container),
          statusText: container?.textContent,
          title: findTitle(group, container),
          url: anchor.getAttribute("href")
        });
      });

      return collector.result();
    }
  };

  const honeyJidoshaAdapter = {
    matches(hostname) {
      return hostname === "honeyjidoshamotors.com" || hostname.endsWith(".honeyjidoshamotors.com");
    },
    scrape() {
      const collector = makeCollector("Honey Jidosha Motors", "adapter");
      const cards = [...document.querySelectorAll(".filter-item")].filter(isVisible);
      cards.forEach((card) => {
        const link = card.querySelector('a[href*="/car/"]');
        collector.add(card, {
          price: cleanText(card.querySelector("h6")?.textContent),
          statusText: card.innerText,
          title: cleanText(
            card.querySelector("h3 a")?.textContent ||
              link?.querySelector("img[alt]")?.getAttribute("alt")
          ),
          url: link?.getAttribute("href")
        });
      });
      return collector.result();
    }
  };

  clearMarks();
  const hostname = globalThis.location.hostname.toLowerCase();
  const adapters = [
    dubizzleAdapter,
    dubicarsAdapter,
    noonAdapter,
    bayutAdapter,
    honeyJidoshaAdapter,
    genericAdapter
  ];
  const adapter = adapters.find((candidate) => candidate.matches(hostname));
  return adapter.scrape();
})();
