# Changelog

## 3.0 — Auction import and release reliability

- Updated local auction parsing and exact-title plan validation with synthetic regression coverage.
- Sheet conditions such as Very good retain their exact supported choice.
- Chrome/package metadata uses 3.0.0; the visible version is 3.0.
- The public ZIP includes a SHA-256 checksum and passes publication checks.
- Private account-connected filling, photo recovery, background republishing, deployment source, organization configuration and work data remain excluded.

## 2.7 — Simpler auction batches

- Separate Republish and New placement previews; paste remains visible until Review rows.
- New imports replace old previews. Clear, Remove, Select all and Select none simplify row management.
- Cropped headerless Gold rows retain their correct initial/reserve columns.
- Compact summaries, inline editing, one main action and collapsed local History.
- Metadata is 2.7.0 with the displayed version 2.7. Private connections and work data remain excluded.

## 2.6 � Easier auction imports

- Pasted auction rows are added immediately, including headerless rows copied from the middle of a worksheet.
- Column inference preserves agreed fields and exposes uncertain values for editing; malformed amounts cannot select neighboring financial columns.
- Optional local .xlsx import preserves headers, hyperlink targets, hidden columns and workbook date systems. Dependencies are packaged locally and parsing runs in a dedicated worker.
- Image preparation confirms the main image before sending the remaining batch, with progress and retention checks.
- Version metadata is 2.6.0; the interface and Chrome version name display 2.6.
- Private account transports, production addresses, credentials, deployments, workbooks and development history remain excluded.

## 2.5.1 — Matching and queue reliability

- Model matching separates class names, full model identifiers and trim evidence, with regression coverage for GLS 450 and Golf GTI.
- Generic `Other` choices no longer compete with specific models. Trim fallback requires explicit evidence instead of choosing by word overlap or list position.
- Shared AI response parsing retains a uniquely recommended live trim and its uncertainty, while rejecting ambiguous, negative and out-of-catalog answers. Private AI connections remain unavailable in the public edition.
- Work Queue clears completed-ad fields before showing the next ad, preserves edits during slow saves, and restores the correct draft on undo.
- Vehicle capture excludes related-listing sections and records explicit engine, cylinder, fuel and drivetrain evidence.
- Reusable reporting logic attributes unlisted work to its own date and invalidates older cached results. Private spreadsheet connections remain excluded.
- Packaging derives the ZIP version from the extension manifest.

This update brings the applicable local 2.5.1 source into the public edition. Private backends, deployments, credentials and development history are excluded. New regression fixtures use synthetic listing URLs and catalog identifiers.

## 2.0.3 — GCC-aware trim matching

- Automatic trim matching now avoids `NON GCC` trims for a listing identified as GCC whenever a compatible live trim exists.
- The fallback remains safe: if the only available live trim is labelled `NON GCC`, it can still be selected.
- Manual Ad Get Data now applies the same rule across exact, AI-assisted, and nearest-match trim selection while keeping the full list available for manual choice.

## 2.0.2 — Work Queue and Dubizzle gallery

- Work Queue now places the full-width model and trim controls above an aligned two-column details grid.
- Dubizzle image collection reads the listing's embedded gallery so every available listing image is collected before the gallery is opened.

## 2.0.1 — Model matching correction

- Work Queue Auto Fill now keeps a full live model variant when an advertised identifier could otherwise be mistaken for a trim, such as `Land Rover Defender 110`.
- Model discovery completes its bounded set of evidence-based searches before selecting a catalog match.
- The identifier consumed by the selected model is removed from trim evidence, so trim matching only considers trims available for that full model.

## 2.0.0 — Public-safe release

Luna's first public release brings its Soft Eclipse interface and local review tools into a standalone Chrome side panel.

### Added and improved

- Soft grey surfaces, pastel actions, inset fields and consistent dropdowns throughout the workspace.
- A crescent icon for the Chrome toolbar and extension manager.
- Compact Work Queue views and connected Inventory steps.
- Copyable trim text, aligned queue fields and calmer transitions.
- Notes that keep their expanded section while individual items are removed.
- Shared Sheet-load recovery and stale-data handling in the reusable statistics code.
- Total-work calculations that exclude Unlisted while displaying it separately.
- Publication checks, repeatable runtime packaging and SHA-256 checksums.

### Public-release boundary

Private spreadsheet connections, backend source, API transport implementations, internal site addresses, credentials and work-specific documentation are excluded. Dependent integrations are unavailable in the public edition. Only reviewed source is included, with a fresh public Git history.
