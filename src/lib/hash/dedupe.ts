// Grouping near-identical photos from their perceptual hashes.
//
// Union-Find over all photos whose hashes fall within `threshold` bits of each
// other. Threshold ~10/64 catches burst frames and re-saves while leaving
// merely-similar shots (same location, different subject) apart. Within a group
// the "best shot" is chosen by a light heuristic: highest resolution, then
// largest file (proxy for least compression), then a user rating if present.

import type { DuplicateGroup, Photo } from "../../types";
import { hamming } from "./phash";
import { makeId } from "../util/misc";

export const DEFAULT_THRESHOLD = 10;

export function findDuplicates(
  photos: Photo[],
  threshold = DEFAULT_THRESHOLD
): DuplicateGroup[] {
  const hashed = photos.filter((p) => p.phash && !p.softDeleted);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // path compression
    let cur = x;
    while (parent.get(cur) !== r) {
      const next = parent.get(cur)!;
      parent.set(cur, r);
      cur = next;
    }
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));

  for (const p of hashed) parent.set(p.id, p.id);

  // O(n^2) pairwise — fine for personal libraries; bucketed for large ones
  // would prefix-index the hashes. Kept simple and correct here.
  for (let i = 0; i < hashed.length; i++) {
    for (let j = i + 1; j < hashed.length; j++) {
      if (hamming(hashed[i].phash!, hashed[j].phash!) <= threshold) {
        union(hashed[i].id, hashed[j].id);
      }
    }
  }

  const clusters = new Map<string, Photo[]>();
  for (const p of hashed) {
    const root = find(p.id);
    const list = clusters.get(root) ?? [];
    list.push(p);
    clusters.set(root, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const list of clusters.values()) {
    if (list.length < 2) continue;
    const ordered = [...list].sort(scoreBestFirst);
    let spread = 0;
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        spread = Math.max(spread, hamming(ordered[i].phash!, ordered[j].phash!));
      }
    }
    groups.push({
      id: makeId("dup-" + ordered.map((p) => p.id).join()),
      photoIds: ordered.map((p) => p.id),
      spread,
    });
  }

  // Biggest / tightest groups first.
  groups.sort((a, b) => b.photoIds.length - a.photoIds.length || a.spread - b.spread);
  return groups;
}

function scoreBestFirst(a: Photo, b: Photo): number {
  const resA = (a.exif.width ?? 0) * (a.exif.height ?? 0);
  const resB = (b.exif.width ?? 0) * (b.exif.height ?? 0);
  if (resA !== resB) return resB - resA;
  if (a.sizeBytes !== b.sizeBytes) return b.sizeBytes - a.sizeBytes;
  const rA = a.iptc.rating ?? 0;
  const rB = b.iptc.rating ?? 0;
  return rB - rA;
}
