// Build a compact country-borders dataset for precise, offline reverse
// geocoding. Converts Natural Earth 1:50m country polygons (via world-atlas
// TopoJSON) into a small GeoJSON-ish JSON of per-country polygons with ISO
// alpha-2 codes, rounded to ~110 m precision. Point-in-polygon against this
// gives the *correct country* for a GPS coordinate — no nearest-city guessing.
//
// Run: node scripts/build-borders.mjs  →  src/assets/borders.json

import { feature } from "topojson-client";
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const topo = require("world-atlas/countries-50m.json");
const countries = require("world-countries");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Map ISO 3166-1 numeric → { cc: alpha-2, name }.
const byNumeric = new Map();
for (const c of countries) {
  if (c.ccn3) byNumeric.set(String(Number(c.ccn3)), { cc: c.cca2, name: c.name.common });
}

const round = (n) => Math.round(n * 1000) / 1000;

function ring(coords) {
  const out = [];
  let prev = null;
  for (const [lng, lat] of coords) {
    const p = [round(lng), round(lat)];
    if (!prev || p[0] !== prev[0] || p[1] !== prev[1]) out.push(p);
    prev = p;
  }
  return out.length >= 4 ? out : null;
}

function bboxOf(rings) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return [minX, minY, maxX, maxY];
}

const fc = feature(topo, topo.objects.countries);
const result = [];
let skipped = 0;

for (const f of fc.features) {
  const meta = byNumeric.get(String(Number(f.id)));
  if (!meta) {
    skipped++;
    continue;
  }
  const geom = f.geometry;
  const rawPolys =
    geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];

  const polys = [];
  for (const poly of rawPolys) {
    const rings = [];
    for (const r of poly) {
      const rr = ring(r);
      if (rr) rings.push(rr);
    }
    if (rings.length) polys.push({ bbox: bboxOf(rings), rings });
  }
  if (!polys.length) continue;

  // Merge duplicate country entries (Natural Earth splits some).
  const existing = result.find((r) => r.cc === meta.cc);
  if (existing) {
    existing.polys.push(...polys);
    existing.bbox = bboxOf(existing.polys.flatMap((p) => p.rings));
  } else {
    result.push({ cc: meta.cc, name: meta.name, bbox: bboxOf(polys.flatMap((p) => p.rings)), polys });
  }
}

mkdirSync(join(root, "src", "assets"), { recursive: true });
const outPath = join(root, "src", "assets", "borders.json");
const json = JSON.stringify(result);
writeFileSync(outPath, json);

const totalPolys = result.reduce((n, r) => n + r.polys.length, 0);
console.log(
  `Wrote ${result.length} countries, ${totalPolys} polygons → src/assets/borders.json ` +
    `(${(json.length / 1024 / 1024).toFixed(2)} MB, ${skipped} unmatched geometries skipped)`
);
