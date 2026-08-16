<div align="center">

# 🖼️ Peruse

### Organize, catalog, and archive your photos — entirely on your device.

**No cloud. No accounts. No uploads. Your photos never leave your machine.**

[![Live Demo](https://img.shields.io/badge/Live-peruse.pages.dev-007aff?style=for-the-badge&logo=cloudflare&logoColor=white)](https://peruse.pages.dev/)
&nbsp;
[![Download](https://img.shields.io/badge/Download-macOS_·_Windows-1d1d1f?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/storitellah/peruse/releases)
&nbsp;
[![License: MIT](https://img.shields.io/badge/License-MIT-34c759?style=for-the-badge)](./LICENSE)

</div>

---

Peruse is a **local-first, privacy-focused** photo cataloger. Everything —
metadata parsing, on-device AI tagging, reverse geocoding, duplicate detection —
runs on your machine. Security is a first-class feature: [read how it's
enforced](./SECURITY.md).

## Features

- 📂 **In-place ingestion** — scan local folders, add more anytime; nothing is copied or uploaded. Rejects video, keeps Live Photo stills.
- 🏷️ **EXIF/IPTC engine** — full metadata extraction; edits saved as non-destructive XMP sidecars.
- 🧠 **On-device AI** — optional CLIP for scene tagging and natural-language search ("sunset over a road").
- 🧬 **Deduplication** — perceptual-hash clustering with one-click "keep best shot".
- 🌍 **Offline places** — GPS → City/Region/Country, no network.
- 💾 **Secure backups** — compressed, optionally AES-256 encrypted, metadata-only catalog snapshots (daily/weekly). A library of thousands backs up in ~KBs.
- 📅 **This Day · Devices · Themes & Places** — flashbacks, a device matrix, and smart collections.

## Download

Grab the installer from the [**Releases**](https://github.com/storitellah/peruse/releases)
page — a `.dmg` for macOS and a `.exe` for Windows. Or try it in the browser at
**[peruse.pages.dev](https://peruse.pages.dev/)**.

## Develop

```bash
npm install
npm run dev          # web app → http://localhost:5173
npm run build        # production web build → dist/
npm run tauri:dev    # desktop app (requires Rust)
npm run tauri:build  # build a local installer
```

Releasing installers: push a `v*` tag and the [CI workflow](./.github/workflows/release.yml)
builds the macOS `.dmg` and Windows `.exe` on native runners.

## More

- 🔐 [Security & privacy model](./SECURITY.md)
- 🏛️ [Architecture](./docs/ARCHITECTURE.md)

<div align="center">
<sub>Built to keep your memories yours. · MIT licensed.</sub>
</div>
