// Precise, offline country resolution by point-in-polygon.
//
// The border dataset (Natural Earth 1:50m, ~110 m precision) is lazy-loaded
// once, then reused for every lookup. A coordinate is tested against each
// country's polygons (bbox-prefiltered for speed) using ray casting, with hole
// handling. This yields the *correct* country for a GPS point — no nearest-city
// guessing that could land a photo in the wrong country.

interface Poly {
  bbox: [number, number, number, number];
  rings: [number, number][][]; // ring[0] outer, rest are holes
}
interface Country {
  cc: string;
  name: string;
  bbox: [number, number, number, number];
  polys: Poly[];
}

export interface CountryHit {
  cc: string;
  name: string;
}

let dataPromise: Promise<Country[] | null> | null = null;

async function load(): Promise<Country[] | null> {
  try {
    const mod = await import("../../assets/borders.json");
    return (mod.default ?? mod) as unknown as Country[];
  } catch {
    return null;
  }
}

/** Preload the border data (call once when a library with GPS is imported). */
export function ensureBorders(): Promise<Country[] | null> {
  if (!dataPromise) dataPromise = load();
  return dataPromise;
}

function inBbox(x: number, y: number, b: [number, number, number, number]): boolean {
  return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
}

// Ray casting: is (x,y) inside the ring?
function inRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPoly(x: number, y: number, poly: Poly): boolean {
  if (!inBbox(x, y, poly.bbox)) return false;
  if (!inRing(x, y, poly.rings[0])) return false;
  for (let k = 1; k < poly.rings.length; k++) {
    if (inRing(x, y, poly.rings[k])) return false; // inside a hole
  }
  return true;
}

/**
 * Resolve the country containing (lat, lon). Returns undefined only when the
 * point genuinely falls in no country (e.g. open ocean) — in which case the
 * caller leaves the location blank rather than guessing.
 */
export async function resolveCountry(lat: number, lon: number): Promise<CountryHit | undefined> {
  const data = await ensureBorders();
  if (!data) return undefined;
  const x = lon;
  const y = lat;

  for (const c of data) {
    if (!inBbox(x, y, c.bbox)) continue;
    for (const p of c.polys) {
      if (inPoly(x, y, p)) return { cc: c.cc, name: c.name };
    }
  }

  // Coastal/offshore fallback: the point may sit just outside a simplified
  // coastline. Snap to the nearest country within ~15 km, but only if a single
  // candidate is clearly closest — otherwise stay blank rather than risk a
  // wrong country.
  const PAD = 0.2; // ~22 km search window
  let best: CountryHit | undefined;
  let bestD = Infinity;
  let secondD = Infinity;
  for (const c of data) {
    if (x < c.bbox[0] - PAD || x > c.bbox[2] + PAD || y < c.bbox[1] - PAD || y > c.bbox[3] + PAD)
      continue;
    let d = Infinity;
    for (const p of c.polys) {
      for (const [vx, vy] of p.rings[0]) {
        const dx = vx - x;
        const dy = vy - y;
        const dd = dx * dx + dy * dy;
        if (dd < d) d = dd;
      }
    }
    if (d < bestD) {
      secondD = bestD;
      bestD = d;
      best = { cc: c.cc, name: c.name };
    } else if (d < secondD) {
      secondD = d;
    }
  }
  // ~15 km (0.135°) and clearly closest than the runner-up.
  if (best && bestD < 0.018 && secondD > bestD * 1.8) return best;
  return undefined;
}
