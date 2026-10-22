# Auctions in Luna 2.6

Paste rows to add them immediately. Headerless TSV, rich clipboard tables and Markdown tables are supported. The importer preserves agreed fields, exposes source-cell choices for uncertain fields and skips exact duplicates.

For headerless rows, one unique SharePoint folder can supply the photo source. With actual headers, only Descale Photoes supplies the folder and only Description supplies the description. Missing or ambiguous amounts and dates remain editable. Numeric dates with one component above 12 are unambiguous; other numeric dates need the explicit date order in Import options.

Open spreadsheet optionally reads a local .xlsx workbook. Choose the worksheet and add all rows or physical worksheet row numbers such as 12-20, 24. Hidden columns, internal blanks, hyperlink targets, date systems and cached formula results are preserved. Formula evaluation, macros and external-link requests are not used. No workbook upload is performed.

The local reader uses packaged SheetJS and fflate libraries in a dedicated worker. Embedded media is omitted in memory for speed. Limits are 100 MB per file, 600 worksheets, 5,000 rows, 256 columns, 300,000 returned cells and 128 MB unpacked XML. Oversized sources are rejected rather than silently truncated.

This public edition includes local row import, editing and workbook tools. Private account connections, authenticated downloads and saved-draft transports are excluded. It cannot prepare or publish an auction on an organization's systems.
