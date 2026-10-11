Luna 2.0.3 is a public-safe update to the calm Chrome side panel for organizing and reviewing vehicle-listing work.

## GCC-aware trim matching

When a listing is identified as GCC, automatic matching now prefers a live trim that is not labelled `NON GCC`. This applies to Work Queue Auto Fill and Manual Ad Get Data.

The complete live trim list is retained for manual review. If a catalog exposes only a `NON GCC` trim, Luna may use that remaining option instead of leaving the trim empty.

## Correct model and trim matching

Work Queue Auto Fill now keeps the full live model when an advertised identifier could otherwise be mistaken for a trim. For example, **Land Rover Defender 110** is selected as the model, and Luna then chooses only from that model's available trims.

The catalog lookup completes its small, evidence-based search plan before making a selection. It does not promote a model from mileage, separated numbers, related listings, or description text.

## A calmer workspace

The Soft Eclipse design brings light surfaces, pastel actions, consistent fields and menus, and a crescent icon. Work Queue views take less space, Inventory moves through connected steps, and notes keep their expanded section while you work through them.

## Tools that stay close to the task

The public edition includes local queues and notes, listing review, image tools, pasted-name inventory comparison, and batch-field preparation. Unlisted entries stay visible separately and are not added to total-work calculations. The reusable statistics controller also recovers from failed startup loads and refreshes stale data.

## What stays private

Company spreadsheet deployments, catalog connections, internal site addresses, private AI transports, credentials and work-specific documentation are not included. Features that require those connections are unavailable in this public edition. The repository starts with reviewed source and a clean public history.

## Install

Download **Luna-2.0.3-public.zip**, extract it, and select its **luna** folder through Chrome's **Load unpacked** control at `chrome://extensions`. Developer mode must be enabled. Chrome 116 or later is required; no build step is needed.

The matching **.sha256** file lets you verify the download. See the repository's README, privacy notice and security policy for permissions, limitations and safe reporting.
