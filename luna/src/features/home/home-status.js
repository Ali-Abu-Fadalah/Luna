globalThis.LunaHomeStatus = (() => {
  const storageKey = globalThis.LunaFoundation?.storageKeys.workQueue || "luna.workQueue.v1";
  const storageArea = globalThis.chrome?.storage?.local;
  const header = document.querySelector("#header-status");
  const headerLabel = document.querySelector("#header-overall-status");
  const summaryTitle = document.querySelector("#home-summary-title");
  const summaryMessage = document.querySelector("#home-summary-message");
  const queueStatus = document.querySelector("#home-work-queue-status");
  const queueDetail = document.querySelector("#home-work-queue-detail");
  const resumeButton = document.querySelector("#home-resume-work-queue");

  if (
    !header ||
    !headerLabel ||
    !summaryTitle ||
    !summaryMessage ||
    !queueStatus ||
    !queueDetail ||
    !resumeButton
  ) {
    return Object.freeze({ ready: Promise.resolve() });
  }

  const states = {
    ayshei: { state: "loading" },
    queue: { state: "loading" },
    sheet: { state: "loading" }
  };

  const updateOverall = () => {
    const hasError =
      !globalThis.LunaConfig?.publicBuild &&
      [states.sheet, states.ayshei].some((entry) => ["error", "failed"].includes(entry.state));
    const loading = Object.values(states).some((entry) => entry.state === "loading");

    if (hasError) {
      header.dataset.overallState = "attention";
      headerLabel.textContent = "Needs attention";
      summaryTitle.textContent = "Services need attention.";
      summaryMessage.textContent = "Review connections in Settings.";
      return;
    }

    if (loading) {
      header.dataset.overallState = "loading";
      headerLabel.textContent = "Checking";
      summaryTitle.textContent = "Checking your workspace.";
      summaryMessage.textContent = "Loading connections and saved work.";
      return;
    }

    header.dataset.overallState = "available";
    if (states.queue.state === "active") {
      headerLabel.textContent = "Work saved";
      summaryTitle.textContent = "Your saved Work Queue is ready.";
      summaryMessage.textContent = "Continue where you left off.";
      return;
    }

    headerLabel.textContent = "Available";
    summaryTitle.textContent = "Ready when you are.";
    summaryMessage.textContent = "Choose your next task.";
  };

  const sanitizeQueue = (value) => {
    if (value?.version !== 1 || !Array.isArray(value.ads) || !value.ads.length) {
      return null;
    }
    const counts = value.ads.reduce(
      (result, ad) => {
        const status = String(ad?.status || "pending");
        if (status === "listed" || status === "unlisted") {
          result.completed += 1;
        } else if (status === "review_later") {
          result.review += 1;
        } else {
          result.pending += 1;
        }
        return result;
      },
      { completed: 0, pending: 0, review: 0 }
    );
    const currentIndex = Math.min(
      Math.max(Number(value.currentIndex) || 0, 0),
      value.ads.length - 1
    );
    return {
      ...counts,
      current: currentIndex + 1,
      total: value.ads.length
    };
  };

  const renderQueue = (value) => {
    const summary = sanitizeQueue(value);
    const progress = document.querySelector("#home-queue-progress");
    const progressFill = document.querySelector("#home-queue-progress-fill");
    const percentage = summary ? Math.round((summary.completed / summary.total) * 100) : 0;
    progress?.setAttribute("aria-valuenow", String(percentage));
    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (!summary) {
      states.queue = { state: "empty" };
      queueStatus.dataset.queueState = "empty";
      queueStatus.textContent = "No saved queue";
      queueDetail.textContent = "Import advertisements in Work Queue to begin.";
      resumeButton.hidden = true;
      updateOverall();
      return;
    }

    states.queue = { state: "active" };
    queueStatus.dataset.queueState = "active";
    queueStatus.textContent = `${summary.completed}/${summary.total} completed`;
    queueDetail.textContent =
      `Ad ${summary.current} of ${summary.total} · ` +
      `${summary.pending} pending · ${summary.review} review`;
    resumeButton.textContent = `Resume Ad ${summary.current}`;
    resumeButton.hidden = false;
    updateOverall();
  };

  const refreshQueue = async () => {
    if (!storageArea?.get) {
      renderQueue(null);
      return;
    }
    try {
      const saved = await storageArea.get({ [storageKey]: null });
      renderQueue(saved[storageKey]);
    } catch (error) {
      renderQueue(null);
    }
  };

  const updateService = (area, detail) => {
    if (!["ayshei", "sheet"].includes(area) || !detail) return;
    states[area] = {
      state: String(detail.state || "loading")
    };
    updateOverall();
  };

  resumeButton.addEventListener("click", async () => {
    if (globalThis.LunaNavigation?.show) {
      await globalThis.LunaNavigation.show("work-queue");
      return;
    }
    document.querySelector('.nav-item[data-section="work-queue"]')?.click();
  });

  if (globalThis.chrome?.storage?.onChanged?.addListener) {
    globalThis.chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && Object.hasOwn(changes, storageKey)) {
        renderQueue(changes[storageKey].newValue);
      }
    });
  }

  const ready = refreshQueue();
  return Object.freeze({ ready, refreshQueue, updateService });
})();
