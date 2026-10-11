# Changelog

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
