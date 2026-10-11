globalThis.LunaJenkinsPage = (() => {
  const fillJenkinsPage = (batch) => {
    try {
      const PAGE_CONFIG = {
        dubicars: {
          fields: ["SCRAPED_URLS", "CATEGORIES", "MAKES_MODELS", "TRIMS", "COLORS", "CONDITIONS"],
          jobName: "OPS Team - Dubicars Cars Scraping"
        },
        dubizzle: {
          fields: [
            "SCRAPED_URLS",
            "CATEGORIES",
            "MAKES_MODELS",
            "TRIMS",
            "COLORS",
            "CONDITIONS",
            "SPECS",
            "TRANSMISSION_TYPES"
          ],
          jobName: "OPS Team - Dubizzle Cars Scraping"
        },
        noon: {
          fields: [
            "SCRAPED_URLS",
            "CATEGORIES",
            "SUB_CATEGORIES",
            "SUB_SUB_CATEGORIES",
            "CONDITIONS"
          ],
          jobName: "OPS Team - Noon Scraping"
        }
      };
      const config = PAGE_CONFIG[batch?.type];
      if (!config || !Number.isInteger(batch?.rowCount) || batch.rowCount < 1) {
        throw new Error("The reviewed Jenkins batch is invalid. Prepare it again in Luna.");
      }

      const currentUrl = new URL(location.href);
      const decodedPath = decodeURIComponent(currentUrl.pathname)
        .replace(/\+/g, " ")
        .replace(/\/+$/, "");
      const expectedPath = `/job/${config.jobName}/build`;
      if (
        currentUrl.protocol !== "https:" ||
        currentUrl.hostname !== "jenkins.example.invalid" ||
        currentUrl.port !== "8080" ||
        decodedPath.toLowerCase() !== expectedPath.toLowerCase()
      ) {
        throw new Error(
          `Open the ${config.jobName} Build with Parameters page in the active tab, then try again.`
        );
      }

      const fields = batch.fields && typeof batch.fields === "object" ? batch.fields : {};
      config.fields.forEach((key) => {
        const lines = String(fields[key] ?? "").split("\n");
        if (lines.length !== batch.rowCount || lines.some((line) => !String(line).trim())) {
          throw new Error(
            `${key} does not contain exactly ${batch.rowCount} complete lines. Nothing was filled.`
          );
        }
      });

      const allTextareas = [...document.querySelectorAll("textarea")];
      const hiddenNames = [
        ...document.querySelectorAll('input[name="name"], input[type="hidden"]')
      ];
      const labelNodes = [
        ...document.querySelectorAll(
          "label, dt, .jenkins-form-label, .setting-name, [data-parameter-name]"
        )
      ];
      const normalize = (value) =>
        String(value ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .toUpperCase();
      const findTextareaIn = (root) => {
        if (!root) return null;
        if (root.tagName === "TEXTAREA") return root;
        return root.querySelector?.('textarea[name="value"], textarea') || null;
      };
      const findTarget = (key) => {
        const hidden = hiddenNames.find((node) => normalize(node.value) === key);
        if (hidden) {
          const roots = [
            hidden.parentElement,
            hidden.closest?.(".setting-main"),
            hidden.closest?.(".jenkins-form-item"),
            hidden.closest?.("tr"),
            hidden.closest?.("div")
          ];
          for (const root of roots) {
            const target = findTextareaIn(root);
            if (target) return target;
          }
        }

        const direct = allTextareas.find((textarea) =>
          [
            textarea.name,
            textarea.id,
            textarea.getAttribute?.("aria-label"),
            textarea.getAttribute?.("data-parameter-name")
          ].some((value) => normalize(value) === key)
        );
        if (direct) return direct;

        const label = labelNodes.find((node) =>
          [node.textContent, node.getAttribute?.("data-parameter-name")].some(
            (value) => normalize(value) === key
          )
        );
        if (!label) return null;
        const roots = [
          label.parentElement,
          label.closest?.(".jenkins-form-item"),
          label.closest?.("tr"),
          label.closest?.("div")
        ];
        for (const root of roots) {
          const target = findTextareaIn(root);
          if (target) return target;
        }
        return null;
      };

      const targets = new Map();
      config.fields.forEach((key) => {
        const target = findTarget(key);
        if (!target) {
          throw new Error(`${key} was not found on this Jenkins page. Nothing was filled.`);
        }
        if ([...targets.values()].includes(target)) {
          throw new Error(`Jenkins field matching was ambiguous at ${key}. Nothing was filled.`);
        }
        targets.set(key, target);
      });

      const nativeSetter = Object.getOwnPropertyDescriptor(
        globalThis.HTMLTextAreaElement?.prototype || {},
        "value"
      )?.set;
      targets.forEach((target, key) => {
        if (nativeSetter) nativeSetter.call(target, fields[key]);
        else target.value = fields[key];
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const unequal = [...targets.entries()].filter(
        ([, target]) => String(target.value).split("\n").length !== batch.rowCount
      );
      if (unequal.length) {
        throw new Error(
          `${unequal.map(([key]) => key).join(", ")} did not retain the expected line count. Review the page manually.`
        );
      }

      return {
        filledFields: config.fields.length,
        jobName: config.jobName,
        ok: true,
        rowCount: batch.rowCount
      };
    } catch (error) {
      return {
        detail: error?.message || "Luna could not fill the Jenkins parameters.",
        ok: false
      };
    }
  };

  return Object.freeze({ fillJenkinsPage });
})();
