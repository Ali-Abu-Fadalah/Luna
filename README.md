# Luna

A calm Chrome side-panel assistant for vehicle-listing work.

Luna brings queues, notes, listing review, image tools, inventory comparison and batch preparation into one workspace. Its Soft Eclipse interface uses pale surfaces, gentle depth and a quiet lunar identity.

## What's in this release

- A saved Work Queue with review, listed, unlisted, later and pending views.
- Vendor notes that stay available between queues.
- Listing capture and review on supported public vehicle websites.
- Image collection and ordering tools.
- Inventory comparison using pasted advertisement names and inventory text.
- Batch parsing and separate field previews.
- Statistics and spreadsheet-export logic, with Unlisted kept separate from total work.
- A consistent light interface, accessible dropdowns and reduced-motion support.

This is the **public-safe edition of Luna 2.0.3**. Company spreadsheet connections, catalog endpoints, internal target sites, AI transport implementations and backend deployments are deliberately absent. Features that depend on those services are unavailable in this edition. This release does not connect to any organization's systems, provide access to work data, or include credentials.

## Install in Chrome

1. Download the latest `Luna-2.0.3-public.zip` from [Releases](https://github.com/Ali-Abu-Fadalah/Luna/releases).
2. Extract the ZIP to a folder you can keep on your computer.
3. Open `chrome://extensions` and turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted `luna` folder—the folder containing `manifest.json`.
5. Pin Luna if you want quick access, then click its crescent icon to open the side panel.

The extension has no build step. It requires Chrome 116 or later. Updates replace the unpacked files; use **Reload** on Luna's extension card afterward. Never add work URLs or keys to a tracked source file.

## Privacy and permissions

Queues, notes and drafts are stored in the local Chrome profile. The public build contains no analytics, remote logging or advertising code. It does not sign in to a company service or send listing data to a private backend.

Luna asks for side-panel, local-storage, active-tab and script-injection capabilities. Built-in site access is limited to supported public vehicle websites. Other HTTPS website access is optional and requires a separate Chrome permission grant. Page capture is an explicit action; granting site access does not start collection.

Read [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) before using Luna with sensitive information. Chrome profile storage is not a password vault.

## Development

Use Node.js 22 or later:

```sh
cd luna
npm test
npm run security:check
```

Tests use synthetic fixtures and mocked Chrome APIs. They do not contact live services. Optional formatting tools can be installed with `npm ci`, then checked with `npm run format:check`.

Create the reviewed runtime package with `npm run package`. It contains only extension runtime files and notices. The package command runs the publication checks first and writes a SHA-256 checksum alongside the ZIP.

## Repository layout

- `luna/` — loadable extension source, assets and local tests.
- `luna/scripts/` — test, security-check and packaging commands.
- `.github/workflows/` — read-only validation jobs.
- `CHANGELOG.md` — public release notes.

Private deployment source, work planning notes, local configuration and the original development history are not part of this repository.

## Notices

This repository does not grant a general open-source license for Luna's original code. Bundled third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Luna is an independent project and is not an official product of Chrome or any supported listing platform.
