// Core domain types for Peruse.
//
// A `Photo` is the in-memory catalog record for a single image on disk. Peruse
// is non-destructive: it never copies the pixel data into its own store. The
// bytes stay in the file the user pointed us at; a `Photo` only holds the
// handle needed to re-open it plus the metadata we derived from it.

export interface GpsCoord {
  lat: number;
  lon: number;
}

export interface PlaceTag {
  /** Nearest known city / locality. */
  city?: string;
  /** State, province, or region. */
  region?: string;
  country?: string;
  /** ISO 3166-1 alpha-2 country code, when resolvable. */
  countryCode?: string;
  /** Rough distance (km) from the coordinate to the matched locality. */
  approxKm?: number;
}

export interface ExifData {
  /** Capture time as epoch ms in the photo's local wall-clock, best effort. */
  takenAt?: number;
  /** Raw timezone offset string if present (e.g. "+02:00"). */
  timezone?: string;
  make?: string;
  model?: string;
  lensModel?: string;
  focalLength?: number;
  focalLength35?: number;
  fNumber?: number;
  exposureTime?: string;
  iso?: number;
  width?: number;
  height?: number;
  orientation?: number;
  gps?: GpsCoord;
  /** Resolved human-readable place from reverse geocoding. */
  place?: PlaceTag;
}

/** User-authored metadata, written back out as an XMP sidecar. */
export interface Iptc {
  caption?: string;
  people: string[];
  tags: string[];
  /** A verified / corrected location string the user typed or confirmed. */
  location?: string;
  rating?: number; // 0..5
}

export interface AiTag {
  label: string;
  score: number;
}

export type CatalogStage =
  | "queued"
  | "exif"
  | "thumb"
  | "hashed"
  | "tagged"
  | "ready";

export interface Photo {
  id: string;
  /** File name including extension. */
  name: string;
  /** Path relative to the scanned root, for display + rename context. */
  relPath: string;
  ext: string;
  sizeBytes: number;
  lastModified: number;
  /** True when a sibling motion file (e.g. .mov) makes this a Live Photo.
   *  Peruse catalogs the still and ignores the paired video. */
  isLivePhoto: boolean;
  /** Flagged from the filename (e.g. "Screenshot_2024…"). */
  isScreenshot: boolean;
  /** Camera RAW format (decoded preview may be unavailable in-browser). */
  isRaw: boolean;
  /** Resolved after EXIF: a real camera capture (has camera make/model,
   *  and not a screenshot). Undefined until EXIF has been read. */
  isCameraPhoto?: boolean;
  /** Handle used to re-open the file lazily (undefined in fallback mode). */
  handle?: FileSystemFileHandle;
  /** Handle of the containing directory, for writing sidecars in place. */
  dirHandle?: FileSystemDirectoryHandle;
  /** Fallback: the picked File object when FS Access API is unavailable. */
  file?: File;

  exif: ExifData;
  iptc: Iptc;
  aiTags: AiTag[];
  /** Semantic embedding for natural-language search (unit-normalised). */
  embedding?: Float32Array;

  /** Perceptual hash (64-bit dHash) as a hex string, for dedupe. */
  phash?: string;
  aspect: number; // width / height, defaults to 1 until measured

  /** Object URL for the generated thumbnail (revoked on unload). */
  thumbUrl?: string;

  stage: CatalogStage;
  softDeleted: boolean;
}

export interface DuplicateGroup {
  id: string;
  /** Photo ids in the group, best shot first. */
  photoIds: string[];
  /** Max hamming distance within the group. */
  spread: number;
}

export type TabId =
  | "library"
  | "thisDay"
  | "attributes"
  | "duplicates"
  | "settings";

export type Theme = "system" | "light" | "dark";

export type GridDensity = "compact" | "medium" | "detailed";

export interface Facet {
  key: string;
  label: string;
  count: number;
}
