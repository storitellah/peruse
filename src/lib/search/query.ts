// Unified search across every indexed field, plus optional semantic ranking.
//
// A query string is matched (case-insensitively, all terms must hit) against a
// per-photo "haystack" built from AI tags, device, place, caption, people,
// user tags, filename, and date. When the CLIP model is available and the query
// reads like natural language, results are additionally re-ranked by semantic
// similarity so "sunset over the road" surfaces the right frames even if none
// of those literal words appear in metadata.

import type { Photo } from "../../types";
import { normalizeDevice } from "../exif/extract";
import { formatDate, monthDayLabel } from "../util/misc";

export function haystack(photo: Photo): string {
  const parts: string[] = [
    photo.name,
    photo.relPath,
    normalizeDevice(photo.exif.make, photo.exif.model),
    photo.exif.make ?? "",
    photo.exif.lensModel ?? "",
    photo.iptc.caption ?? "",
    photo.iptc.location ?? "",
    ...photo.iptc.people,
    ...photo.iptc.tags,
    ...photo.aiTags.map((t) => t.label),
    photo.exif.place?.city ?? "",
    photo.exif.place?.region ?? "",
    photo.exif.place?.country ?? "",
  ];
  if (photo.exif.takenAt) {
    parts.push(formatDate(photo.exif.takenAt));
    parts.push(monthDayLabel(photo.exif.takenAt));
    parts.push(String(new Date(photo.exif.takenAt).getFullYear()));
  }
  return parts.join(" · ").toLowerCase();
}

/** Literal, all-terms substring match. Fast; no model required. */
export function literalMatch(photo: Photo, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = haystack(photo);
  return q.split(/\s+/).every((term) => hay.includes(term));
}

/** A heuristic for whether to also run semantic ranking. */
export function looksSemantic(query: string): boolean {
  const words = query.trim().split(/\s+/);
  return words.length >= 2;
}
