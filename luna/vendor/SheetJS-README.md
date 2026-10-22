# SheetJS Community Edition

Luna vendors the unmodified SheetJS CE **0.20.3** standalone browser bundle.

- Source: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
- Authoritative release and vendoring documentation: https://docs.sheetjs.com/docs/getting-started/installation/standalone/
- License: Apache 2.0, copied from https://cdn.sheetjs.com/xlsx-0.20.3/package/LICENSE into `SheetJS-LICENSE.txt`.
- Bundle SHA-256: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`.
- Downloaded: 22 October 2026. The source bundle has not been modified.

Auctions loads this packaged file only when the user opens a local `.xlsx` workbook. No CDN runtime request, workbook upload, external-link request, formula evaluation or macro execution is used. Large-file parsing runs in a local dedicated worker. Only the selected worksheet is parsed into auction cells, including hidden columns, internal blanks and saved hyperlink targets. Date cells are normalized to ISO calendar dates using the workbook's 1900/1904 epoch. Cached formula values are used without recalculation.

The reader caps files at 100 MB, workbooks at 600 worksheets and selected sheets at 5,000 rows, 256 columns and 300,000 output cells. Workbook bytes remain in memory until the reader is closed or the panel closes; the reader does not write storage.

## Local ZIP filtering

The reader also vendors the unmodified **fflate 0.8.3** browser UMD bundle to skip embedded media and accelerate local ZIP decompression. The filtered ZIP is held only in memory and read by SheetJS; worksheet XML is not parsed by custom code. Metadata reads skip worksheet entries. The first selected-sheet read normalizes worksheet entries to stored ZIP form, then SheetJS parses only the selected worksheet. Later selections reuse that memory package. Decompressed XML and relationship entries are capped at 128 MB.

- Official project and API documentation: https://github.com/101arrowz/fflate
- Package source: https://registry.npmjs.org/fflate/-/fflate-0.8.3.tgz, member `package/umd/index.js`.
- License: MIT, copied from the package into `fflate-LICENSE.txt`.
- Bundle SHA-256: `462ef8041fc970e3615a20a9dd2b2e3047a073b2da729ef4f02b634bba8b7b83`.
- Downloaded: 22 October 2026. No source changes.
