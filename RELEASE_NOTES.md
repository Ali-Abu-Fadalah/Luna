# Luna 2.6 public edition

Release date: 22 October 2026.

Auction import now adds pasted rows immediately, including headerless rows copied from the middle of a sheet. Matching fields are preserved, uncertain cells can be corrected in the form, and exact duplicates are skipped. A unique SharePoint folder can supply the photo source for headerless rows; known headers preserve the Descale Photoes and Description rules.

The optional local workbook reader lets you choose a worksheet and its rows without copying headers. It preserves hyperlinks, hidden columns, date systems and cached formula values. The workbook stays local, with packaged dependencies and bounded worker parsing.

The public edition includes local auction editing and workbook tools. Private account connections, authenticated downloads, saved-draft transports, backend deployments and work data are not included. Account-connected filling remains unavailable in this edition.

Chrome and package metadata use 2.6.0, with the interface and Chrome version name displaying 2.6. Build the reviewed package using `cd luna` followed by `npm run package`; the output is `dist/Luna-2.6.0-public.zip` with a SHA-256 checksum.

Reload Luna at chrome://extensions and reopen its side panel. Confirm the footer shows Luna 2.6.
