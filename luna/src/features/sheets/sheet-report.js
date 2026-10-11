globalThis.LunaSheetReport = (() => {
  const button = document.querySelector("#sheet-report-export");
  const status = document.querySelector("#sheet-report-message");
  const monthSelect = document.querySelector("#monthly-performance-month");
  let running = false;
  const setStatus = (message) => {
    status.textContent = message;
  };
  const fetchMonths = async (available, seed) => {
    const result = new Array(available.length);
    let nextIndex = 0;
    let completed = 0;
    const worker = async () => {
      while (nextIndex < available.length) {
        const index = nextIndex++;
        const month = available[index];
        result[index] =
          seed.connection.rangeStart.slice(0, 7) === month.key &&
          seed.connection.sourceTabState === "available"
            ? seed
            : await globalThis.LunaSheet.getMonthlyPerformance({ force: true, month: month.name });
        completed += 1;
        setStatus(`Reading monthly work tabs ${completed}/${available.length}...`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, available.length) }, worker));
    return result;
  };
  const download = async () => {
    if (running) return;
    running = true;
    button.disabled = true;
    button.textContent = "Preparing report...";
    setStatus(
      "Reading work, recent activity, and interactions from the read-only Sheet service..."
    );
    try {
      const [seed, recent, interactions] = await Promise.all([
        globalThis.LunaSheet.getMonthlyPerformance({ force: true }),
        globalThis.LunaSheet.testConnection(30, { force: true }),
        globalThis.LunaSheet.getDailyInteractions({ force: true })
      ]);
      const available = Array.isArray(seed.connection.availableMonths)
        ? seed.connection.availableMonths
        : [];
      if (!available.length) throw new Error("No monthly work tabs are available.");
      const months = await fetchMonths(available, seed);
      const selectedMonth =
        available.find((item) => item.name === monthSelect.value)?.key ||
        seed.connection.rangeStart.slice(0, 7);
      setStatus("Building the analysis and audit sheets...");
      const report = globalThis.LunaSheetReportCore.buildReport({
        months,
        recent,
        interactions,
        selectedMonth
      });
      const workbook = globalThis.LunaXlsxExportCore.buildWorkbook(report);
      const url = URL.createObjectURL(workbook);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Luna_Sheet_Statistics_${interactions.connection.rangeEnd}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus(
        `Report downloaded: ${report.months.length} work month${report.months.length === 1 ? "" : "s"}, recent tracker, and interaction history. See Audit for source checks.`
      );
    } catch (error) {
      const known =
        /^No monthly work tabs|^A monthly work source|^The recent|^The Auctions|^Daily interactions|^The interaction source|^Interaction source|^The Sheet Statistics report|^The report exceeds/.test(
          String(error?.message || "")
        );
      setStatus(
        known
          ? `Download stopped: ${error.message}`
          : "Download stopped: Luna could not read every required Sheet source. Check the work account and try again."
      );
    } finally {
      running = false;
      button.disabled = false;
      button.textContent = "Download full Excel report";
    }
  };
  button.addEventListener("click", download);
  return Object.freeze({ download });
})();
