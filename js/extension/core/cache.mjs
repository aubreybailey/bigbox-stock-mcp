/**
 * Store directory cache + storesNear — ported from storecheck.py
 * (save_stores merge, stores_near ranking).
 *
 * Pure logic only: the storage backend is injected (an adapter with
 * load(chain)->array|null and save(chain, array)). Node uses cache-node.mjs;
 * the extension will use a chrome.storage adapter. This keeps the module loadable
 * in both runtimes (no node:fs / chrome imports here).
 */
import { geocodeZip, milesBetween } from "./geo.mjs";
import { get } from "./registry.mjs";

const COLS = ["num", "label", "lat", "lng", "zip", "address"];

/** Merge incoming into existing: dedupe by store# or rounded lat/lng; keep non-empty fields. */
export function mergeStores(existing, incoming) {
  const byKey = new Map();
  for (const s of [...(existing || []), ...(incoming || [])]) {
    const key = s.num || `${round3(s.lat)},${round3(s.lng)}`;
    const cur = byKey.get(key) || {};
    for (const c of COLS) if (s[c] !== undefined && s[c] !== "" && s[c] !== null) cur[c] = s[c];
    if (cur.num === undefined) cur.num = s.num || "";
    cur.lat = s.lat; cur.lng = s.lng;
    byKey.set(key, cur);
  }
  return [...byKey.values()];
}
const round3 = (x) => Math.round(x * 1000) / 1000;

export async function loadStores(chain, adapter) {
  return (await adapter.load(chain)) || null;
}
export async function saveStores(chain, stores, adapter) {
  const merged = mergeStores(await adapter.load(chain), stores);
  await adapter.save(chain, merged);
  return merged;
}

/** Add distMi, filter to radius, sort nearest-first. */
export function rankStores(stores, origin, radius) {
  const withDist = (stores || []).map((s) => ({
    ...s,
    distMi: origin ? Math.round(milesBetween(origin, { lat: s.lat, lng: s.lng }) * 10) / 10 : null,
  }));
  const near = withDist.filter((s) => s.distMi == null || s.distMi <= radius);
  near.sort((a, b) => (a.distMi == null ? 1 : 0) - (b.distMi == null ? 1 : 0) || (a.distMi || 1e9) - (b.distMi || 1e9));
  return near;
}

/**
 * storesNear(site, zip, radius, { adapter, fetchHtml, refresh }).
 * On cache miss, if a `fetchHtml(url)->html` callback is provided (the runtime
 * supplies it — Node fetch, or the extension navigating), the finder is fetched
 * and parsed, then cached. Returns ranked stores.
 */
export async function storesNear(site, zip, radius = 30, opts = {}) {
  const r = get(site);
  const adapter = opts.adapter;
  if (!adapter) throw new Error("storesNear requires a storage adapter");
  const g = await geocodeZip(zip);
  const origin = g ? { lat: g.lat, lng: g.lng } : null;
  let stores = opts.refresh ? null : await loadStores(r.domain, adapter);
  let cached = !!(stores && stores.length);
  if (!cached) {
    if (opts.fetchHtml && r.storeFinderUrl(zip)) {
      const html = await opts.fetchHtml(r.storeFinderUrl(zip));
      stores = await r.parseStores(html || "");
      if (stores.length) stores = await saveStores(r.domain, stores, adapter);
    } else {
      stores = stores || [];
    }
  }
  return {
    site: r.domain, zip, zipLabel: g ? g.label : null, radius,
    cached, storeCountKnown: stores.length, stores: rankStores(stores, origin, radius),
  };
}
