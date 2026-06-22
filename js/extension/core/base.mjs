/**
 * Retailer interface — ported from retailers/base.py.
 *
 * Each chain subclasses Retailer and overrides only what diverges. The shared
 * core (geo, classifier, cache) and the runtime (Node bridge / MV3 extension)
 * ask the retailer object for every chain-specific decision. parseStores is
 * async here because geocoding a store's ZIP is a fetch.
 */

// Generic lat/lng pairing parser (default for chains with no override).
const LAT_RE = /"(?:lat|latitude)"\s*:\s*"?(-?\d{1,2}\.\d{3,})"?/gi;
const LNG_RE = /"(?:lng|lon|long|longitude)"\s*:\s*"?(-?\d{1,3}\.\d{3,})"?/gi;
const LABEL_RE = /"(?:city|storeName|name|displayName|store_name)"\s*:\s*"([^"]{2,40})"/gi;
const NUM_RE = /"(?:storenum|storeNumber|storeId|store_number|number)"\s*:\s*"?(\w{1,8})"?/gi;

export function genericParseStores(html) {
  const collect = (re) => [...(html || "").matchAll(re)].map((m) => [m.index, m[1]]);
  const lats = collect(LAT_RE).map(([i, v]) => [i, parseFloat(v)]);
  const lngs = collect(LNG_RE).map(([i, v]) => [i, parseFloat(v)]);
  const labels = collect(LABEL_RE);
  const nums = collect(NUM_RE);
  const nearest = (pos, pairs) =>
    pairs.length ? pairs.reduce((a, b) => (Math.abs(b[0] - pos) < Math.abs(a[0] - pos) ? b : a))[1] : null;
  const out = [], seen = new Set();
  for (const [pos, lat] of lats) {
    const lng = nearest(pos, lngs);
    if (lng == null || !(lat > 17 && lat < 72 && lng > -180 && lng < -64)) continue;
    const k = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ lat, lng, label: nearest(pos, labels) || "", num: nearest(pos, nums) || "", zip: "", address: "" });
  }
  return out;
}

export class Retailer {
  domain = "";
  categories = [];
  finderEngine = "auto";
  searchTmpl = null;
  finderTmpl = null;
  signalHints = {};           // {oos, avail, store}: RegExp (non-global)
  storeStock = false;
  pickupHints = {};           // {avail, oos, store, ready}: RegExp
  pickupEngine = "headful";   // "dump" for chains that botwall headful (HD) — Python parity

  searchUrl(query) {
    return this.searchTmpl ? this.searchTmpl.replace("{q}", encodeURIComponent(query)) : null;
  }
  storeFinderUrl(zip) {
    return this.finderTmpl ? this.finderTmpl.replace("{zip}", encodeURIComponent(zip)) : null;
  }
  /** Rendered store-finder HTML -> [{num,label,lat,lng,zip,address}]. Override per chain. */
  async parseStores(html) {
    return genericParseStores(html);
  }
  /** Cookies to pin store_id (used by the extension via chrome.cookies). null = not wired. */
  storeCookies(zip, storeId, rec, geo) {
    return null;
  }
}

export class GenericRetailer extends Retailer {
  constructor(domain, opts = {}) {
    super();
    this.domain = domain;
    this.categories = opts.categories || [];
    this.searchTmpl = opts.searchTmpl || null;
    this.finderTmpl = opts.finderTmpl || null;
    this.finderEngine = opts.finderEngine || "auto";
    this.signalHints = opts.signalHints || {};
  }
}

// shared helpers for chain store parsers
export function stateFromAddr(addr) {
  const m = /,\s*([A-Z]{2})\s+\d{5}/.exec(addr || "");
  return m ? m[1] : null;
}
export function cityFromAddr(addr) {
  const m = /,\s*([A-Za-z .'-]+?),\s*[A-Z]{2}\s+\d{5}/.exec(addr || "");
  return m ? m[1].trim() : null;
}
