// Offline reverse geocoding — country-accurate.
//
// The country is resolved by point-in-polygon against real border geometry, so
// it is correct (not the nearest listed city's country). The city/region are
// best-effort from the embedded gazetteer and are only attached when they are
// *consistent* with the resolved country and reasonably close — otherwise they
// are omitted rather than risk a wrong label. If there is no GPS at all, the
// caller never calls this and the location stays blank.

import type { GpsCoord, PlaceTag } from "../../types";
import { CITIES } from "./cities";
import { resolveCountry } from "./borders";

const R_EARTH_KM = 6371;

function haversine(a: GpsCoord, b: GpsCoord): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Only attach a city label when it's this close and in the right country. */
const CITY_MAX_KM = 120;

export async function reverseGeocode(coord: GpsCoord): Promise<PlaceTag | undefined> {
  if (
    !Number.isFinite(coord.lat) ||
    !Number.isFinite(coord.lon) ||
    Math.abs(coord.lat) > 90 ||
    Math.abs(coord.lon) > 180 ||
    (coord.lat === 0 && coord.lon === 0) // null-island sentinel, not a real place
  ) {
    return undefined;
  }

  const country = await resolveCountry(coord.lat, coord.lon);
  if (!country) return undefined; // couldn't determine the country → stay blank

  // Nearest gazetteer city, but only trust it if it's in the resolved country
  // and close enough. This keeps the country 100% authoritative while still
  // offering a city when we can be confident about it.
  let bestCity = "";
  let bestRegion = "";
  let bestKm = Infinity;
  for (const c of CITIES) {
    if (c.cc !== country.cc) continue;
    const km = haversine(coord, c);
    if (km < bestKm) {
      bestKm = km;
      bestCity = c.name;
      bestRegion = c.region;
    }
  }

  const tag: PlaceTag = {
    country: country.name,
    countryCode: country.cc,
  };
  if (bestCity && bestKm <= CITY_MAX_KM) {
    tag.city = bestCity;
    tag.region = bestRegion;
    tag.approxKm = Math.round(bestKm);
  }
  return tag;
}
