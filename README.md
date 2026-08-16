# Peruse

**A local-first, privacy-focused app to organize, catalog, and archive your photos.**

Peruse reads your photos where they already live and does everything —
metadata extraction, AI scene tagging, reverse geocoding, duplicate detection —
**100% on your device**. Nothing is uploaded. There are no accounts, no cloud,
no telemetry. Your originals are never copied, moved, or transmitted.

<br>

## Why Peruse

Smartphone libraries grow into tens of thousands of unlabelled, half-duplicated
photos. Cloud services will happily organize them — by uploading everything.
Peruse takes the opposite stance: your photos stay yours, on your disk, and the
intelligence comes to them.

- 🔒 **Local-only.** All processing runs in-process. No network calls touch your
  images. The only optional download is a quantized vision model, fetched once
  and then cached for fully-offline inference.
- 🖼 **Non-destructive.** Edits are written as sidecar files (XMP), never by
  rewriting your originals. Renames are previewed and exported as a reviewable
  plan — Peruse won't mutate your files behind your back.
- 🍎 **Apple-inspired.** Translucent materials, SF-family typography, an
  aspect-preserving justified grid, a floating lightbox, and calm motion.

<br>

## Features

| Area | What it does |
| --- | --- |
| **Ingestion** | Scans a local folder in place via the File System Access API (Chromium/Edge), with a read-only directory-picker fallback for other browsers. |
| **EXIF / IPTC engine** | Extracts capture time & timezone, device make/model, lens, focal length, aperture, shutter, ISO, and GPS. Writes user captions, people, tags, verified location, and rating as standards-compliant **XMP sidecars**. |
| **Reverse geocoding** | Resolves GPS to City / Region / Country against an **embedded offline gazetteer** — no network, with an honest "≈ N km" confidence. |
| **On-device AI vision** | Zero-shot scene/theme tagging with a quantized **CLIP** model (Transformers.js / ONNX Runtime), plus **natural-language semantic search** ("sunset over a road"). Fully optional and lazily loaded. |
| **Deduplication** | Perceptual **dHash** + Hamming-distance clustering finds burst frames and re-saves. One-click "keep best shot, trash the rest". |
| **Batch renaming** | Metadata-token templates (`[YYYY]-[MM]-[DD]_[Device]_[AI_Tag]_[Counter]`) with live preview and an exportable, non-destructive rename plan. |
| **This Day** | Flashback feed of photos taken on today's calendar date across past years. |
| **Devices** | A breakdown matrix of every camera/phone model in the library, with counts, date spans, and one-tap filtering. |
| **Themes & Places** | Collection walls for AI themes and location hierarchies. |
| **Soft delete** | Non-destructive trash with restore, separate from permanent deletion. |

<br>

## Architecture

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

## Running

Requires Node 18+.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

Open the app, click **Choose a folder…**, and grant read access. For the full
experience (in-place metadata writing) use a Chromium-based browser, which
implements the File System Access API. In Safari/Firefox, Peruse falls back to a
read-only picker and offers metadata sidecars as downloads.

> **On-device AI is optional.** The first time you click *Auto-tag photos*,
> Peruse downloads a quantized CLIP model (~50 MB) once and caches it. All
> inference then runs locally with no further network access. If the model is
> unavailable, every other feature keeps working — tagging simply stays off.

<br>

## Privacy model

- Images are read through handles/`File` objects the user explicitly grants;
  Peruse walks only the chosen tree.
- No image bytes are sent anywhere. There is no backend and no analytics.
- Derived data (thumbnails, hashes, embeddings, edits) lives in memory for the
  session; persisted metadata is written only as sidecars beside the originals,
  and only when you ask.

<br>

## Packaging as a native desktop app (Tauri)

Peruse is architected as a self-contained front end with all logic in
framework-agnostic modules, so wrapping it in **Tauri** (Rust shell) is
straightforward and is the recommended path for a shippable desktop binary:

1. `npm create tauri-app` (or add `@tauri-apps/cli`) pointing `frontendDist` at
   `dist/` and `devUrl` at the Vite dev server.
2. Swap the `lib/fs` layer for Tauri's filesystem/dialog APIs to gain true
   in-place renames and native trash, and move `exif`/`hash`/`thumbs` work into
   Rust commands (`kamadak-exif`, `img_hash`, `image`) for native-speed
   decoding — the module boundaries already isolate these concerns.
3. Keep CLIP inference in the web layer (Transformers.js) or move it to
   `ort` (ONNX Runtime for Rust) / CoreML behind the same `lib/ai` interface.

The UI, state, search, dedupe, rename, and geocoding layers port unchanged.

<br>

## Tech stack

React 18 · TypeScript · Vite · Zustand · exifr · Transformers.js (CLIP / ONNX
Runtime) — no CSS framework, no component library; the Apple-style design system
is hand-built with CSS custom properties and is fully theme-aware.
