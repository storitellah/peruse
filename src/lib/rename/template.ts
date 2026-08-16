// Batch renaming with metadata-token templates.
//
// A template is a string with [Token] placeholders. Peruse resolves each token
// from a photo's metadata and sanitises the result into a filesystem-safe name.
// Renaming is preview-only in the browser sandbox (the FS Access API cannot
// rename in place without a copy); Peruse shows the resolved names and can
// export a rename plan, keeping the operation non-destructive by default.

import type { Photo } from "../../types";
import { normalizeDevice } from "../exif/extract";
import { baseName } from "../util/misc";

export interface TokenDef {
  token: string;
  label: string;
  example: string;
}

export const TOKENS: TokenDef[] = [
  { token: "YYYY", label: "Year", example: "2025" },
  { token: "MM", label: "Month", example: "08" },
  { token: "DD", label: "Day", example: "16" },
  { token: "HH", label: "Hour", example: "14" },
  { token: "mm", label: "Minute", example: "05" },
  { token: "Device", label: "Device model", example: "iPhone 15 Pro" },
  { token: "Make", label: "Manufacturer", example: "Apple" },
  { token: "Location", label: "City", example: "Kyoto" },
  { token: "Country", label: "Country", example: "Japan" },
  { token: "AI_Tag", label: "Top AI tag", example: "Sunset" },
  { token: "OriginalName", label: "Original name", example: "IMG_4021" },
  { token: "Counter", label: "Sequence #", example: "001" },
  { token: "Ext", label: "Extension", example: "jpg" },
];

export const PRESET_TEMPLATES = [
  "[YYYY]-[MM]-[DD]_[Device]_[OriginalName]",
  "[YYYY][MM][DD]_[HH][mm]_[Location]",
  "[Location]_[AI_Tag]_[Counter]",
  "[YYYY]-[MM]-[DD]_[Counter]",
];

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

function sanitize(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]+/g, "-") // illegal on common filesystems
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
}

export function resolveName(photo: Photo, template: string, index: number): string {
  const d = new Date(photo.exif.takenAt ?? photo.lastModified);
  const device = normalizeDevice(photo.exif.make, photo.exif.model);
  const topTag = photo.aiTags[0]?.label ?? photo.iptc.tags[0] ?? "Untagged";
  const place = photo.iptc.location || photo.exif.place?.city || "NoLocation";

  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    Device: device,
    Make: photo.exif.make ?? "Unknown",
    Location: place,
    Country: photo.exif.place?.country ?? "",
    AI_Tag: topTag,
    OriginalName: baseName(photo.name),
    Counter: pad(index + 1, 3),
    Ext: photo.ext,
  };

  const body = template.replace(/\[(\w+)\]/g, (whole, key: string) =>
    key in map ? map[key] : whole
  );
  const safe = sanitize(body) || baseName(photo.name);
  return `${safe}.${photo.ext}`;
}

export interface RenamePlanEntry {
  id: string;
  from: string;
  to: string;
}

export function buildRenamePlan(photos: Photo[], template: string): RenamePlanEntry[] {
  const seen = new Map<string, number>();
  return photos.map((p, i) => {
    let to = resolveName(p, template, i);
    // De-duplicate collisions deterministically.
    const count = seen.get(to) ?? 0;
    seen.set(to, count + 1);
    if (count > 0) {
      const dot = to.lastIndexOf(".");
      to = `${to.slice(0, dot)}-${count + 1}${to.slice(dot)}`;
    }
    return { id: p.id, from: p.relPath, to };
  });
}
