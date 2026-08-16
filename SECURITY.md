# Security & Privacy

Peruse is built so your photos **never leave your device**. This document
explains what that means concretely and how it is enforced — not just promised.

## The core guarantee: no photos are ever uploaded

- Peruse has **no backend**. There is no Peruse server, account, login, or
  telemetry. Nothing about your library is reported anywhere.
- Every operation — EXIF/IPTC parsing, thumbnail decoding, perceptual hashing,
  AI tagging, reverse geocoding, search — runs **locally**, in your browser or
  in the desktop app's webview.
- Image bytes are read from the files you explicitly grant and are held only in
  memory for the session. They are never copied into app storage and never sent
  over the network.

### Enforced, not just intended

The hosted web build ships a strict **Content-Security-Policy**
(`public/_headers`). Its `connect-src` allows only:

- `'self'` (the app's own assets), and
- the read-only model CDNs used to download the optional AI model.

Arbitrary network destinations are blocked at the browser level, so there is no
path by which photo data could be exfiltrated to a third-party server — even in
the event of a compromised dependency. `default-src 'self'`, `object-src
'none'`, `frame-ancestors 'none'`, and `form-action 'none'` further lock the
page down against injection, clickjacking, and form-based exfiltration.

The **desktop app** (Tauri) applies the same CSP in `tauri.conf.json` and
registers **no** filesystem, shell, HTTP, or dialog plugins — the native attack
surface is deliberately minimal. Local file access is mediated solely by the
webview's File System Access API.

## The one optional download: the AI model

The only thing Peruse ever fetches is the **quantized CLIP model**, and only if
you choose to run *Auto-tag photos*. It is downloaded once from the Hugging Face
CDN, cached locally, and thereafter runs fully offline. This is a *download of
model weights*, never an *upload of your data*. If you never enable AI tagging,
Peruse makes no network requests for functionality at all.

## Backups are metadata-only and can be encrypted

- Catalog backups contain **only metadata** (captions, tags, people, ratings,
  locations, AI labels, perceptual hashes, EXIF) — never pixel data. A library
  of thousands of photos backs up in tens of kilobytes.
- Backups are written locally as gzip-compressed `.peruse` files, to a folder
  you choose. They are never uploaded.
- Optional **AES-256-GCM encryption** protects a backup with a passphrase, using
  a PBKDF2-derived key (210,000 iterations, SHA-256), all via the Web Crypto
  API. The passphrase is held in memory for the session only — it is never
  written to disk and never placed in application state.

## Non-destructive by design

Peruse never rewrites your original image files. Metadata edits are written as
sidecar `.xmp` files next to the originals; deletes are soft (to Trash) unless
you explicitly confirm permanent removal; batch renames are previewed and
exported as a reviewable plan rather than applied silently.

## Reporting a vulnerability

If you find a security issue, please open a private report via GitHub Security
Advisories on this repository, or open an issue describing the problem without
sensitive details and we'll follow up. Please do not disclose exploitable
details publicly until a fix is available.
