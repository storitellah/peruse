<div align="center">

# 🖼️ Peruse

### Organize, catalog, and archive your photos — entirely on your device.

**No cloud. No accounts. No uploads. Nothing ever leaves your machine.**

<br>

[![Live Demo](https://img.shields.io/badge/Live-peruse.pages.dev-007aff?style=for-the-badge&logo=cloudflare&logoColor=white)](https://peruse.pages.dev/)
&nbsp;
[![License: MIT](https://img.shields.io/badge/License-MIT-34c759?style=for-the-badge)](./LICENSE)

![React](https://img.shields.io/badge/React_18-20232a?style=flat-square&logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646cff?style=flat-square&logo=vite&logoColor=white)
![On-device AI](https://img.shields.io/badge/CLIP-on--device-ff9500?style=flat-square)
![Privacy](https://img.shields.io/badge/100%25-local-1d1d1f?style=flat-square&logo=apple&logoColor=white)

</div>

<br>

> Smartphone libraries grow into tens of thousands of unlabelled, half-duplicated
> photos. Cloud services will happily organize them — by uploading everything.
> **Peruse takes the opposite stance:** your photos stay yours, on your disk, and
> the intelligence comes to them.

<br>

<table>
<tr>
<td width="33%" valign="top">

### 🔒 Local-only
All processing runs in-process. No network calls touch your images. The one
optional download is a quantized vision model, fetched once and then cached for
fully-offline inference.

</td>
<td width="33%" valign="top">

### 🪶 Non-destructive
Edits are written as **XMP sidecars**, never by rewriting your originals.
Renames are previewed and exported as a reviewable plan — Peruse won't mutate
your files behind your back.

</td>
<td width="33%" valign="top">

### 🍎 Apple-inspired
Translucent materials, SF-family typography, an aspect-preserving justified
grid, a floating lightbox, calm spring motion, and full light / dark theming.

</td>
</tr>
</table>

<br>

## ✨ Features

| Area | What it does |
| --- | --- |
| 📂 **Ingestion** | Scans a local folder **in place** via the File System Access API (Chromium / Edge), with a read-only directory-picker fallback for other browsers. |
| 🏷️ **EXIF / IPTC engine** | Extracts capture time & timezone, device make/model, lens, focal length, aperture, shutter, ISO, and GPS. Writes captions, people, tags, verified location, and rating as standards-compliant **XMP sidecars**. |
| 🌍 **Reverse geocoding** | Resolves GPS → City / Region / Country against an **embedded offline gazetteer** — no network, with an honest "≈ N km" confidence. |
| 🧠 **On-device AI vision** | Zero-shot scene / theme tagging with a quantized **CLIP** model (Transformers.js / ONNX Runtime) + **natural-language search** ("sunset over a road"). Fully optional, lazily loaded, graceful fallback. |
| 🧬 **Deduplication** | Perceptual **dHash** + Hamming-distance clustering finds burst frames and re-saves. One-click *keep best shot, trash the rest*. |
| ✏️ **Batch renaming** | Metadata-token templates (`[YYYY]-[MM]-[DD]_[Device]_[AI_Tag]_[Counter]`) with live preview and an exportable, non-destructive rename plan. |
| 📅 **This Day** | Flashback feed of photos taken on today's calendar date across past years. |
| 📱 **Devices** | A breakdown matrix of every camera / phone model in the library, with counts, date spans, and one-tap filtering. |
| 🗺️ **Themes & Places** | Collection walls for AI themes and location hierarchies. |
| 🗑️ **Soft delete** | Non-destructive trash with restore, separate from permanent deletion. |

<br>

## 🚀 Quick start

> Requires Node 18+.

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

Open the app, click **Choose a folder…**, and grant read access.

For the full experience (in-place metadata writing) use a Chromium-based
browser, which implements the File System Access API. In Safari / Firefox,
Peruse falls back to a read-only picker and offers metadata sidecars as
downloads.

> [!NOTE]
> **On-device AI is optional.** The first time you click *Auto-tag photos*,
> Peruse downloads a quantized CLIP model (~50 MB) **once** and caches it. All
> inference then runs locally with no further network access. If the model is
> unavailable, every other feature keeps working — tagging simply stays off.

<br>

## ☁️ Deploying to Cloudflare Pages

Peruse is a fully static build, so it drops straight onto **Cloudflare Pages** —
live at **[peruse.pages.dev](https://peruse.pages.dev/)**.

### Option A — Git integration (recommended)

1. Push this repo to GitHub/GitLab.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, and select the repo.
3. Set the build configuration:

   | Setting | Value |
   | --- | --- |
   | **Framework preset** | `Vite` (or `None`) |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |
   | **Node version** | `20` (pinned by [`.nvmrc`](./.nvmrc), or set env `NODE_VERSION=20`) |

4. **Save and Deploy.** Every push to the production branch triggers a new deploy;
   PR branches get preview URLs automatically.

### Option B — Wrangler CLI

```bash
npm run build
npx wrangler pages deploy dist --project-name peruse
```

### Why the `_headers` file matters

[`public/_headers`](./public/_headers) ships **cross-origin isolation** headers
(`COOP` + `COEP: credentialless`) so `onnxruntime-web` can run the CLIP model on
multiple WASM threads. `credentialless` keeps isolation on while still allowing
the one-time model download from the Hugging Face CDN. Vite copies this file to
`dist/` at build time, and Cloudflare applies it automatically — no dashboard
config needed. If isolation is ever unavailable, the model just runs
single-threaded; nothing breaks.

> **Privacy note:** hosting Peruse on Pages serves only the *app shell*. Your
> photos are still read locally in your browser and are **never** uploaded to
> Cloudflare or anywhere else. Cloudflare sees static asset requests only.

<br>

## 🏛️ Architecture

```
src/
├── lib/
│   ├── fs/scanner.ts          Local, in-place directory scanning (FS Access API + fallback)
│   ├── exif/extract.ts        EXIF/IPTC/XMP extraction (exifr), normalised to domain types
│   ├── exif/xmpSidecar.ts     Non-destructive XMP sidecar writer
│   ├── geo/cities.ts          Embedded offline gazetteer
│   ├── geo/reverseGeocode.ts  Nearest-locality resolution (haversine)
│   ├── thumbs/decode.ts       Hardware-accelerated decode → thumbnail + hash buffer
│   ├── hash/phash.ts          dHash + Hamming distance
│   ├── hash/dedupe.ts         Union-Find duplicate clustering + best-shot heuristic
│   ├── ai/labels.ts           Scene/theme taxonomy (CLIP prompts)
│   ├── ai/vision.ts           Lazy on-device CLIP: image embeddings, zero-shot tags, text queries
│   ├── rename/template.ts     Metadata-token rename templating
│   └── search/query.ts        Unified literal + semantic search
├── state/store.ts             Zustand store + staged enrichment pipeline
├── components/                Apple-HIG React UI (sidebar, gallery, inspector, lightbox, tabs…)
└── styles/                    Design tokens + component styling (light/dark)
```

**Enrichment pipeline.** Imports flow through staged, bounded-concurrency passes
so the UI fills in progressively and stays responsive on large libraries:

```
scan → EXIF + reverse-geocode → thumbnail + perceptual hash → (optional) AI tags
```

Photo records are replaced (not mutated) per stage and batched on animation
frames, so memoised tiles repaint precisely when their own data changes.

<br>

## 🔐 Privacy model

- Images are read through handles / `File` objects the user **explicitly grants**;
  Peruse walks only the chosen tree.
- **No image bytes are sent anywhere.** There is no backend and no analytics.
- Derived data (thumbnails, hashes, embeddings, edits) lives in memory for the
  session; persisted metadata is written only as sidecars beside the originals,
  and only when you ask.

<br>

## 🦀 Packaging as a native desktop app (Tauri)

Peruse keeps all logic in framework-agnostic modules, so wrapping it in **Tauri**
(Rust shell) is the recommended path to a shippable desktop binary:

1. `npm create tauri-app` (or add `@tauri-apps/cli`) pointing `frontendDist` at
   `dist/` and `devUrl` at the Vite dev server.
2. Swap the `lib/fs` layer for Tauri's filesystem/dialog APIs to gain true
   in-place renames and native trash, and move `exif` / `hash` / `thumbs` work
   into Rust commands (`kamadak-exif`, `img_hash`, `image`) for native-speed
   decoding — the module boundaries already isolate these concerns.
3. Keep CLIP inference in the web layer (Transformers.js) or move it to
   `ort` (ONNX Runtime for Rust) / CoreML behind the same `lib/ai` interface.

The UI, state, search, dedupe, rename, and geocoding layers port unchanged.

<br>

## 🧰 Tech stack

**React 18** · **TypeScript** · **Vite** · **Zustand** · **exifr** ·
**Transformers.js** (CLIP / ONNX Runtime) — no CSS framework, no component
library; the Apple-style design system is hand-built with CSS custom properties
and is fully theme-aware.

<div align="center">
<br>

*Built to keep your memories yours.*

</div>
