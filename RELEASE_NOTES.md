# Luna 2.5.1 public edition

This update brings the latest applicable local extension changes into Luna's public-safe source.

- More precise model and trim evidence handling, including GLS 450 and Golf GTI regressions.
- Safer handling of generic Other options, missing trims and ambiguous AI recommendations in the shared matching code.
- Correct Work Queue field reset, persistence during slow saves and undo behavior.
- Vehicle capture that excludes related listings and retains explicit mechanical specifications.
- Updated reusable reporting logic for unlisted dates and cache invalidation.
- Version-aligned metadata, footer and repeatable ZIP packaging.

Company spreadsheet connections, private catalog and AI transports, backend deployments, internal addresses, credentials and private development history remain excluded. Features requiring those services are unavailable in the public edition. Regression fixtures use synthetic listing URLs and catalog identifiers; tests do not contact live services.

## Install

Build the reviewed package with `cd luna` followed by `npm run package`, then extract `dist/Luna-2.5.1-public.zip` from the repository root. In `chrome://extensions`, enable Developer mode and select the extracted `luna` folder using Load unpacked. Chrome 116 or later is required.

For an existing installation, replace the unpacked files, click Reload on Luna's extension card, and reopen its panel. Confirm the footer says Luna 2.5.1.

See README.md, PRIVACY.md and SECURITY.md for permissions and privacy details.
