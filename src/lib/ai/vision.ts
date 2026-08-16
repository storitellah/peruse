// On-device semantic vision with a quantised CLIP model (Transformers.js).
//
// Everything here runs locally. Transformers.js executes the ONNX model through
// onnxruntime-web (WASM/WebGPU) in the browser; the model weights are fetched
// once from the HF hub and then cached in the browser's Cache Storage, after
// which inference is fully offline. If the library or model can't load, the
// module degrades gracefully: `isAvailable()` returns false and the app keeps
// working without AI tags — Peruse never blocks on the model.
//
// We use CLIP for two jobs:
//   1. Zero-shot tagging: cosine-similarity of the image embedding against the
//      pre-encoded text embeddings of our label taxonomy (softmaxed).
//   2. Semantic search: encode the user's query text and rank photos by cosine
//      similarity against their stored image embeddings.

import type { AiTag, Photo } from "../../types";
import { LABELS, MAX_TAGS, TAG_THRESHOLD } from "./labels";
import { readBlob } from "../fs/scanner";

// The library is optional; import lazily and tolerate its absence.
type AnyFn = (...args: unknown[]) => Promise<unknown>;

interface ClipState {
  imageEmbed: AnyFn;
  textEmbed: AnyFn;
  labelVecs: Float32Array[]; // one per LABELS entry, unit-normalised
}

const MODEL = "Xenova/clip-vit-base-patch32";

let statePromise: Promise<ClipState | null> | null = null;
let unavailable = false;
let loadListeners: Array<(s: LoadStatus) => void> = [];

export type LoadStatus =
  | { phase: "idle" }
  | { phase: "loading"; progress: number; note: string }
  | { phase: "ready" }
  | { phase: "unavailable"; reason: string };

let currentStatus: LoadStatus = { phase: "idle" };

export function onLoadStatus(cb: (s: LoadStatus) => void): () => void {
  loadListeners.push(cb);
  cb(currentStatus);
  return () => {
    loadListeners = loadListeners.filter((l) => l !== cb);
  };
}

function emit(s: LoadStatus) {
  currentStatus = s;
  for (const l of loadListeners) l(s);
}

function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  // Both expected unit-normalised → dot product is cosine similarity.
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

async function loadClip(): Promise<ClipState | null> {
  emit({ phase: "loading", progress: 0, note: "Loading vision runtime…" });
  let transformers: Record<string, unknown>;
  try {
    // Dynamic, vite-ignored so the optional dep never breaks a build without it.
    transformers = (await import(/* @vite-ignore */ "@xenova/transformers")) as Record<string, unknown>;
  } catch (err) {
    unavailable = true;
    emit({ phase: "unavailable", reason: "Vision model package not installed." });
    return null;
  }

  try {
    const env = transformers.env as { allowLocalModels?: boolean; useBrowserCache?: boolean };
    if (env) {
      env.allowLocalModels = false;
      env.useBrowserCache = true;
    }
    const pipeline = transformers.pipeline as (
      task: string,
      model: string,
      opts: Record<string, unknown>
    ) => Promise<AnyFn>;

    const progressCb = (p: { status?: string; progress?: number; file?: string }) => {
      if (p.status === "progress") {
        emit({
          phase: "loading",
          progress: Math.round(p.progress ?? 0),
          note: `Downloading model (${p.file ?? ""})…`,
        });
      }
    };

    const imageEmbed = await pipeline("image-feature-extraction", MODEL, {
      quantized: true,
      progress_callback: progressCb,
    });
    const textEmbed = await pipeline("text-feature-extraction", MODEL, {
      quantized: true,
      progress_callback: progressCb,
    });

    emit({ phase: "loading", progress: 100, note: "Encoding label taxonomy…" });
    const labelVecs: Float32Array[] = [];
    for (const l of LABELS) {
      const out = (await textEmbed(l.prompt, { pooling: "mean", normalize: true })) as {
        data: Float32Array;
      };
      labelVecs.push(normalize(Float32Array.from(out.data)));
    }

    emit({ phase: "ready" });
    return { imageEmbed, textEmbed, labelVecs };
  } catch (err) {
    unavailable = true;
    const reason = err instanceof Error ? err.message : "Model failed to initialise.";
    emit({ phase: "unavailable", reason });
    return null;
  }
}

/** Kick off (or reuse) model loading. Safe to call repeatedly. */
export function ensureClip(): Promise<ClipState | null> {
  if (unavailable) return Promise.resolve(null);
  if (!statePromise) statePromise = loadClip();
  return statePromise;
}

export function isAvailable(): boolean {
  return currentStatus.phase === "ready";
}

/** Encode a photo, returning its embedding + zero-shot tags. */
export async function analyzePhoto(
  photo: Photo
): Promise<{ embedding: Float32Array; tags: AiTag[] } | null> {
  const clip = await ensureClip();
  if (!clip) return null;

  const blob = await readBlob(photo);
  const url = URL.createObjectURL(blob);
  try {
    const out = (await clip.imageEmbed(url, { pooling: "mean", normalize: true })) as {
      data: Float32Array;
    };
    const embedding = normalize(Float32Array.from(out.data));

    // Softmax the cosine sims across all labels for calibrated scores.
    const sims = clip.labelVecs.map((v) => cosine(embedding, v));
    const scaled = sims.map((s) => Math.exp(s * 100)); // CLIP logit scale ~100
    const sum = scaled.reduce((a, b) => a + b, 0) || 1;
    const probs = scaled.map((s) => s / sum);

    const tags: AiTag[] = LABELS.map((l, i) => ({ label: l.label, score: probs[i] }))
      .filter((t) => t.score >= TAG_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_TAGS);

    return { embedding, tags };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Encode a free-text query for semantic search (unit-normalised). */
export async function encodeQuery(text: string): Promise<Float32Array | null> {
  const clip = await ensureClip();
  if (!clip) return null;
  const out = (await clip.textEmbed(text, { pooling: "mean", normalize: true })) as {
    data: Float32Array;
  };
  return normalize(Float32Array.from(out.data));
}
