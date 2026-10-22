(() => {
  const LIBRARY = "vendor/xlsx-0.20.3.full.min.js";
  const ZIP_LIBRARY = "vendor/fflate-0.8.3.min.js";
  const VERSION = "0.20.3";
  const MAX_BYTES = 100 * 1024 * 1024;
  const MAX_SHEETS = 600;
  const MAX_ROWS = 5000;
  const MAX_COLUMNS = 256;
  const MAX_CELLS = 300000;
  const MAX_UNPACKED_BYTES = 128 * 1024 * 1024;
  const TIMEOUT_MS = 30000;

  const httpsUrl = (value) => {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && !url.username && !url.password && !url.port
        ? url.href
        : "";
    } catch {
      return "";
    }
  };
  const libraryReady = () => {
    if (globalThis.XLSX?.version !== VERSION || !globalThis.fflate?.unzipSync)
      throw new Error("The local spreadsheet reader is unavailable. Reload Luna and try again.");
    return globalThis.XLSX;
  };
  const createReader = (buffer) => {
    const xlsx = libraryReady();
    let bytes = new Uint8Array(buffer);
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
      throw new Error("Choose an Excel .xlsx workbook. Other file types are not supported.");
    const filteredZip = (includeSheets) => {
      let unpacked = 0;
      const entries = globalThis.fflate.unzipSync(bytes, {
        filter: (entry) => {
          if (
            !/\.(?:xml|rels)$/i.test(entry.name) ||
            (!includeSheets && /\/worksheets\//i.test(entry.name))
          )
            return false;
          unpacked += entry.originalSize;
          if (unpacked > MAX_UNPACKED_BYTES)
            throw new Error(
              "This workbook contains too much worksheet data. Copy the required rows instead."
            );
          return true;
        }
      });
      // A stored ZIP avoids inflating worksheets through SheetJS's slower
      // compatibility inflater. Embedded images are never decompressed/copied.
      return globalThis.fflate.zipSync(entries, { level: 0 });
    };
    const metadata = xlsx.read(filteredZip(false), {
      type: "array",
      bookSheets: true,
      bookProps: true
    });
    if (!metadata.SheetNames?.length || metadata.SheetNames.length > MAX_SHEETS)
      throw new Error(`Choose a workbook with between 1 and ${MAX_SHEETS} worksheets.`);
    const sheets = metadata.SheetNames.map((name, index) => ({ id: String(index), name }));
    let dataReady = false;
    const readSheet = (sheetId) => {
      if (!bytes) throw new Error("Reopen the workbook to read its worksheets.");
      const sheet =
        sheets.find((item) => item.id === String(sheetId)) ||
        sheets.find((item) => item.name === sheetId);
      if (!sheet) throw new Error("Choose an available worksheet.");
      // Restrict parsing to the selected worksheet. Formulas are only read as
      // text and cached values; no calculation engine or external link fetch runs.
      if (!dataReady) {
        bytes = filteredZip(true);
        dataReady = true;
      }
      const book = xlsx.read(bytes, {
        type: "array",
        sheets: Number(sheet.id),
        sheetRows: MAX_ROWS + 1,
        cellDates: false,
        cellNF: true,
        cellText: false,
        cellHTML: false,
        cellFormula: true,
        bookVBA: false,
        dense: false
      });
      const source = book.Sheets[sheet.name];
      if (!source) throw new Error("The selected worksheet could not be read.");
      const full = source["!fullref"] || source["!ref"];
      if (full && xlsx.utils.decode_range(full).e.r >= MAX_ROWS)
        throw new Error(
          `This worksheet exceeds ${MAX_ROWS.toLocaleString()} rows. Copy the required rows instead.`
        );
      const entries = Object.keys(source).filter((name) => /^[A-Z]+[1-9]\d*$/.test(name));
      let lastRow = -1,
        lastColumn = -1;
      for (const name of entries) {
        const cell = source[name];
        if (cell.v === undefined && !cell.l?.Target) continue;
        const address = xlsx.utils.decode_cell(name);
        lastRow = Math.max(lastRow, address.r);
        lastColumn = Math.max(lastColumn, address.c);
      }
      if (lastColumn >= MAX_COLUMNS || (lastRow + 1) * (lastColumn + 1) > MAX_CELLS)
        throw new Error(
          "This worksheet is too large to import together. Copy only the auction rows and columns instead."
        );
      if (lastRow < 0) return [];
      const date1904 = !!book.Workbook?.WBProps?.date1904;
      const rows = Array.from({ length: lastRow + 1 }, () =>
        Array.from({ length: lastColumn + 1 }, () => ({ text: "", url: "" }))
      );
      for (const name of entries) {
        const cell = source[name],
          address = xlsx.utils.decode_cell(name);
        if (address.r > lastRow || address.c > lastColumn) continue;
        let value = cell.v;
        if (typeof value === "number" && xlsx.SSF.is_date(cell.z || "")) {
          const date = xlsx.SSF.parse_date_code(value, { date1904 });
          value = date
            ? `${String(date.y).padStart(4, "0")}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`
            : "";
        } else if (cell.t === "d") {
          value =
            value instanceof Date
              ? value.toISOString().slice(0, 10)
              : String(value || "").slice(0, 10);
        } else if (cell.t === "e") {
          value = "";
        }
        rows[address.r][address.c] = {
          text: value === undefined || value === null ? "" : String(value),
          url: httpsUrl(cell.l?.Target)
        };
      }
      return rows;
    };
    return {
      sheets,
      readSheet,
      close: () => {
        bytes = null;
      }
    };
  };

  // The same local script is a dedicated worker entry point. Parsing a large
  // workbook never blocks the panel, and timeout/close discards its memory.
  if (typeof document === "undefined" && typeof importScripts === "function") {
    let reader;
    globalThis.onmessage = ({ data }) => {
      try {
        let result;
        if (data.operation === "open") {
          const localLibrary = new URL(`../../../${LIBRARY}`, globalThis.location.href).href;
          const localZipLibrary = new URL(`../../../${ZIP_LIBRARY}`, globalThis.location.href).href;
          if (data.libraryUrl !== localLibrary || data.zipUrl !== localZipLibrary)
            throw new Error("The local spreadsheet reader path changed.");
          importScripts(localZipLibrary, localLibrary);
          reader = createReader(data.buffer);
          result = reader.sheets;
        } else if (data.operation === "sheet") {
          if (!reader) throw new Error("Reopen the workbook first.");
          result = reader.readSheet(data.sheet);
        } else throw new Error("Unsupported workbook operation.");
        globalThis.postMessage({ id: data.id, ok: true, result });
      } catch (error) {
        globalThis.postMessage({
          id: data.id,
          ok: false,
          detail: error.message || "The workbook could not be read."
        });
      }
    };
    return;
  }

  let loadingLibrary;
  const loadLibrary = () => {
    if (globalThis.XLSX?.version === VERSION && globalThis.fflate?.unzipSync)
      return Promise.resolve();
    if (!loadingLibrary)
      loadingLibrary = new Promise((resolve, reject) => {
        const load = (resource) =>
          new Promise((loaded, failed) => {
            const script = document.createElement("script");
            script.src = chrome.runtime.getURL(resource);
            script.onload = loaded;
            script.onerror = () =>
              failed(new Error("Luna's local spreadsheet reader could not load."));
            document.head.append(script);
          });
        load(ZIP_LIBRARY)
          .then(() => load(LIBRARY))
          .then(() => libraryReady())
          .then(resolve, reject);
      }).catch((error) => {
        loadingLibrary = null;
        throw error;
      });
    return loadingLibrary;
  };
  globalThis.LunaAuctionWorkbook = Object.freeze({
    async open(file) {
      if (!file || !/\.xlsx$/i.test(file.name || "") || typeof file.arrayBuffer !== "function")
        throw new Error("Choose an Excel .xlsx workbook.");
      if (!Number.isSafeInteger(file.size) || file.size < 4 || file.size > MAX_BYTES)
        throw new Error("Choose an Excel workbook no larger than 100 MB.");
      const buffer = await file.arrayBuffer();
      if (buffer.byteLength !== file.size)
        throw new Error("The workbook could not be read completely. Choose it again.");
      if (typeof Worker !== "function") {
        await loadLibrary();
        return createReader(buffer);
      }
      const worker = new Worker(chrome.runtime.getURL("src/features/auctions/auction-workbook.js"));
      const pending = new Map();
      let sequence = 0,
        closed = false;
      const close = () => {
        closed = true;
        worker.terminate();
        for (const task of pending.values()) {
          clearTimeout(task.timer);
          task.reject(new Error("Reopen the workbook to continue."));
        }
        pending.clear();
      };
      const request = (data, transfer = []) =>
        new Promise((resolve, reject) => {
          if (closed) {
            reject(new Error("Reopen the workbook to continue."));
            return;
          }
          const id = ++sequence;
          const timer = setTimeout(() => {
            reject(
              new Error("The workbook took too long to read. Copy the required rows instead.")
            );
            pending.delete(id);
            close();
          }, TIMEOUT_MS);
          pending.set(id, { resolve, reject, timer });
          worker.postMessage({ ...data, id }, transfer);
        });
      worker.onmessage = ({ data }) => {
        const task = pending.get(data.id);
        if (!task) return;
        clearTimeout(task.timer);
        pending.delete(data.id);
        if (data.ok) task.resolve(data.result);
        else task.reject(new Error(data.detail || "The workbook could not be read."));
      };
      worker.onerror = () => close();
      try {
        const sheets = await request(
          {
            operation: "open",
            buffer,
            libraryUrl: chrome.runtime.getURL(LIBRARY),
            zipUrl: chrome.runtime.getURL(ZIP_LIBRARY)
          },
          [buffer]
        );
        return { sheets, readSheet: (sheet) => request({ operation: "sheet", sheet }), close };
      } catch (error) {
        close();
        throw error;
      }
    }
  });
})();
