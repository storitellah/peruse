// Offline reverse geocoding: coordinate -> nearest known locality.
//
// Nearest-neighbour over the embedded gazetteer using the haversine great-circle
// distance. No network, no external service. The result is deliberately coarse
// and always carries an approximate distance so the UI can be honest about
// confidence ("~12 km from Kyoto").

import type { GpsCoord, PlaceTag } from "../../types";
import { CITIES } from "./cities";

const R_EARTH_KM = 6371;

function haversine(a: GpsCoord, b: GpsCoord): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function reverseGeocode(coord: GpsCoord): PlaceTag | undefined {
  if (
    !Number.isFinite(coord.lat) ||
    !Number.isFinite(coord.lon) ||
    (coord.lat === 0 && coord.lon === 0)
  ) {
    return undefined;
  }

  let best = CITIES[0];
  let bestKm = Infinity;
  for (const city of CITIES) {
    const km = haversine(coord, city);
    if (km < bestKm) {
      bestKm = km;
      best = city;
    }
  }

  return {
    city: best.name,
    region: best.region,
    country: best.country,
    countryCode: best.cc,
    approxKm: Math.round(bestKm),
  };
}
