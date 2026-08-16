// EXIF / IPTC / XMP extraction, on-device, via exifr.
//
// exifr is a compact, dependency-free metadata parser that runs entirely in
// the browser — no bytes leave the machine. We normalise its output into our
// own ExifData / Iptc shapes so the rest of the app never touches raw tags.

import exifr from "exifr";
import type { ExifData, Iptc } from "../../types";

interface RawExif {
  DateTimeOriginal?: Date | string;
  CreateDate?: Date | string;
  OffsetTimeOriginal?: string;
  Make?: string;
  Model?: string;
  LensModel?: string;
  FocalLength?: number;
  FocalLengthIn35mmFormat?: number;
  FNumber?: number;
  ExposureTime?: number;
  ISO?: number;
  ISOSpeedRatings?: number;
  ExifImageWidth?: number;
  ExifImageHeight?: number;
  ImageWidth?: number;
  ImageHeight?: number;
  Orientation?: number;
  latitude?: number;
  longitude?: number;
  // IPTC / XMP-ish fields exifr may surface:
  Caption?: string;
  ImageDescription?: string;
  description?: string;
  Keywords?: string | string[];
  Rating?: number;
  [k: string]: unknown;
}

function toEpoch(v?: Date | string): number | undefined {
  if (!v) return undefined;
  const d = v instanceof Date ? v : new Date(v);
  const t = d.getTime();
  return Number.isFinite(t) ? t : undefined;
}

function formatExposure(sec?: number): string | undefined {
  if (!sec || sec <= 0) return undefined;
  if (sec >= 1) return `${sec.toFixed(1)}s`;
  return `1/${Math.round(1 / sec)}s`;
}

export async function extractMetadata(
  blob: Blob,
  fallbackTime: number
): Promise<{ exif: ExifData; iptc: Partial<Iptc> }> {
  let raw: RawExif = {};
  try {
    raw =
      ((await exifr.parse(blob, {
        tiff: true,
        exif: true,
        gps: true,
        iptc: true,
        xmp: true,
        translateValues: true,
        reviveValues: true,
        mergeOutput: true,
      })) as RawExif) || {};
  } catch {
    raw = {};
  }

  const width = raw.ExifImageWidth || raw.ImageWidth;
  const height = raw.ExifImageHeight || raw.ImageHeight;

  const exif: ExifData = {
    takenAt: toEpoch(raw.DateTimeOriginal) ?? toEpoch(raw.CreateDate) ?? fallbackTime,
    timezone: raw.OffsetTimeOriginal,
    make: cleanStr(raw.Make),
    model: cleanStr(raw.Model),
    lensModel: cleanStr(raw.LensModel),
    focalLength: numOrUndef(raw.FocalLength),
    focalLength35: numOrUndef(raw.FocalLengthIn35mmFormat),
    fNumber: numOrUndef(raw.FNumber),
    exposureTime: formatExposure(numOrUndef(raw.ExposureTime)),
    iso: numOrUndef(raw.ISO ?? raw.ISOSpeedRatings),
    width,
    height,
    orientation: numOrUndef(raw.Orientation),
    gps:
      typeof raw.latitude === "number" && typeof raw.longitude === "number"
        ? { lat: raw.latitude, lon: raw.longitude }
        : undefined,
  };

  const iptc: Partial<Iptc> = {};
  const caption = cleanStr(raw.Caption ?? raw.ImageDescription ?? raw.description);
  if (caption) iptc.caption = caption;
  if (raw.Keywords) {
    iptc.tags = Array.isArray(raw.Keywords)
      ? raw.Keywords.map(String)
      : String(raw.Keywords)
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean);
  }
  if (typeof raw.Rating === "number") iptc.rating = raw.Rating;

  return { exif, iptc };
}

function cleanStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function numOrUndef(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Manufacturer strings are noisy; normalise a few common ones for grouping. */
export function normalizeDevice(make?: string, model?: string): string {
  const mk = (make || "").trim();
  const md = (model || "").trim();
  if (!md && !mk) return "Unknown device";
  // Apple models already read "iPhone 15 Pro"; don't prefix with "Apple".
  if (/iphone|ipad/i.test(md)) return md;
  if (mk && !md.toLowerCase().startsWith(mk.toLowerCase())) return `${mk} ${md}`.trim();
  return md || mk;
}
