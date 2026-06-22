/**
 * Geo helpers — ported from storecheck.py (geocode_zip, miles_between, store_matches).
 * Pure + fetch-only, so it runs unchanged in Node and the extension service worker.
 */

/** US ZIP -> {lat, lng, label:'City, ST'} via zippopotam.us (no key). null on fail. */
export async function geocodeZip(zip) {
  try {
    const r = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
    if (!r.ok) return null;
    const d = await r.json();
    const p = d.places[0];
    return {
      lat: parseFloat(p.latitude),
      lng: parseFloat(p.longitude),
      label: `${p["place name"]}, ${p["state abbreviation"]}`,
    };
  } catch {
    return null;
  }
}

/** Haversine distance in miles between {lat,lng} a and b. */
export function milesBetween(a, b) {
  const R = 3958.8;
  const rad = (x) => (x * Math.PI) / 180;
  const p1 = rad(a.lat), p2 = rad(b.lat);
  const dp = rad(b.lat - a.lat), dl = rad(b.lng - a.lng);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** True if `store` text contains any of the comma/array names (case-insensitive). */
export function storeMatches(store, names) {
  if (!store || !names || !names.length) return false;
  const s = store.toLowerCase();
  return names.some((n) => n && n.trim() && s.includes(n.trim().toLowerCase()));
}
