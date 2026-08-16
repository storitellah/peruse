# Architecture

Peruse keeps all logic in framework-agnostic modules under `src/lib/`, with a
thin React UI on top and an optional Tauri shell for desktop packaging.

```
src/
├── lib/
│   ├── fs/scanner.ts          Local, in-place directory scanning (FS Access API + fallback)
│   ├── exif/extract.ts        EXIF/IPTC/XMP extraction (exifr), normalised to domain types
│   ├── exif/xmpSidecar.ts     Non-destructive XMP sidecar writer
│   ├── geo/cities.ts          Embedded offline gazetteer
│   ├── geo/reverseGeocode.ts  Nearest-locality resolution (haversine)
│   ├── thumbs/decode.ts       Decode-time downscaling → thumbnail + hash buffer
│   ├── hash/phash.ts          dHash + Hamming distance
│   ├── hash/dedupe.ts         Union-Find duplicate clustering + best-shot heuristic
│   ├── ai/labels.ts           Scene/theme taxonomy (CLIP prompts)
│   ├── ai/vision.ts           Lazy on-device CLIP: image embeddings, zero-shot tags, text queries
│   ├── devices/classify.ts    make/model → device kind (for device glyphs)
│   ├── rename/template.ts     Metadata-token rename templating
│   ├── backup/catalog.ts      gzip + AES-256-GCM catalog snapshots
│   ├── backup/handleStore.ts  IndexedDB persistence of the backup folder handle
│   └── search/query.ts        Unified literal + semantic search
├── state/store.ts             Zustand store + staged enrichment pipeline + backup scheduler
├── components/                Apple-HIG React UI (sidebar, gallery, inspector, lightbox, tabs…)
├── styles/                    Design tokens + component styling (light/dark)
└── src-tauri/                 Rust desktop shell (Tauri v2) + release CI
```

## Enrichment pipeline

Imports flow through a single interleaved, **thumbnail-first** pass with bounded
concurrency (scaled to `hardwareConcurrency`):

```
open file once → decode thumbnail + perceptual hash → EXIF + reverse-geocode → (optional) AI tags
```

Each photo paints its thumbnail immediately, so the grid fills top-to-bottom
during a scan instead of after it. Photo records are replaced (not mutated) per
stage and batched on animation frames, so memoised tiles repaint precisely when
their own data changes. Decoding uses `createImageBitmap` resize options to
produce a ~512 px bitmap directly from a full-resolution photo.

## Ingestion

Two fully-local paths:

1. **File System Access API** (Chromium/Edge/WebView2) — live handles, so Peruse
   can re-read pixels lazily and write XMP sidecars and backups in place.
2. **`<input webkitdirectory>` fallback** (Safari/Firefox) — read-only `File`
   objects; sidecars and backups are offered as downloads.

Videos are rejected by extension; a still whose sibling is a motion file (e.g.
`.mov`) is flagged as a **Live Photo** and badged, while the paired video is
never ingested.

## Catalog backup

The catalog's value is its metadata, so backups snapshot metadata only — no
pixels, thumbnails, or embeddings — serialised to JSON, gzip-compressed via
`CompressionStream`, and optionally AES-256-GCM encrypted (PBKDF2 key). A 2,000
photo library compresses to ~26 KB. The `.peruse` container is framed
`PRSB1 | flag | [salt|iv] | payload`. Scheduling (Off/Daily/Weekly) is checked on
launch and on an interval; auto-backup writes to a remembered folder handle
(persisted in IndexedDB) when due. See [SECURITY.md](../SECURITY.md).

## Desktop packaging (Tauri)

`src-tauri/` wraps the built frontend in a Tauri v2 shell. The Rust side is
intentionally minimal (no custom commands, no fs/shell/http plugins); the webview
runs the same code as the web build under a strict CSP. Installers are produced
by `.github/workflows/release.yml`, which builds a universal macOS `.dmg` and a
Windows NSIS `.exe` on their native runners via `tauri-apps/tauri-action` and
attaches them to a draft GitHub Release. Trigger it by pushing a `v*` tag.

Icons for every platform (`.png`, `.ico`, `.icns`) are generated from
`public/favicon.svg` by `scripts/generate-icons.mjs` (`npm run icons`).

## On-device AI

CLIP (via Transformers.js / ONNX Runtime) serves two jobs: zero-shot tagging
(cosine similarity of the image embedding against pre-encoded label prompts,
softmaxed) and semantic search (encode the query, rank photos by cosine
similarity against stored image embeddings). The model is lazy-loaded and
optional; if it can't load, every other feature keeps working.
