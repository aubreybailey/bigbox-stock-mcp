/** Walmart — ported from retailers/walmart.py.
 * parseStores verified; storeStock stays false (server re-derives store from IP;
 * cookie/param don't pin it — needs a "make my store" interaction, which the
 * real-browser extension can finally do). See walmart.py for the full writeup. */
import { Retailer } from "../base.mjs";
import { geocodeZip } from "../geo.mjs";

// "Walmart Supercenter 200 Otis St, Northborough, MA 01532" -> name + ST + ZIP
const ADDR_RE = /aria-label="(Walmart[^"]*?,\s*([A-Z]{2})\s*(\d{5}))"/g;
// "Store details Northborough Supercenter" ... href="/store/2158"
const DET_RE = /aria-label="Store details ([^"]+)"[^>]*?href="\/store\/(\d+)"/g;

export class Walmart extends Retailer {
  domain = "walmart.com";
  categories = ["electronics", "grocery_household", "home_hardware", "toys_games", "pharmacy"];
  searchTmpl = "https://www.walmart.com/search?q={q}";
  finderTmpl = "https://www.walmart.com/store/finder?location={zip}";

  signalHints = {
    oos: /Out of stock|not available/i,
    avail: /Add to cart|Pickup\b|Pick up today|In stock/i,
    store: /"locationText"\s*:\s*"([^"]+)"|"displayName"\s*:\s*"([^"]+)"/,
  };

  storeStock = false;   // see module note: needs an interactive "make my store"
  pickupHints = {
    avail: /(pickup as soon as|pickup,?\s+(?:today|tomorrow)|free pickup|available for pickup|ready (?:today|tomorrow|within|by)|how fast you can get it[^.]{0,40}pickup)/i,
    oos: /(pickup not available|out of stock|not available|currently unavailable|can't be (?:shipped|picked up))/i,
    store: /"locationText"\s*:\s*"([^"]+)"|pickup (?:not available |as soon as[^.]*?)at ([A-Za-z][A-Za-z .'-]{1,28}? (?:Supercenter|Store|Neighborhood Market))/i,
    ready: /(?:pickup as soon as|ready)\s+(\d{1,2}(?::\d{2})?\s*[ap]m|today|tomorrow|within[^,.]{0,18})/i,
  };

  async parseStores(html) {
    const addrs = [...(html || "").matchAll(ADDR_RE)].map((m) => [m.index, m[1], m[3]]);
    const dets = [...(html || "").matchAll(DET_RE)].map((m) => [m.index, m[1], m[2]]);
    const out = [], seen = new Set();
    for (const [dpos, name, sid] of dets) {
      if (seen.has(sid)) continue;
      const prev = addrs.filter((a) => a[0] < dpos);
      if (!prev.length) continue;
      const [, addr, zc] = prev[prev.length - 1];
      const g = zc ? await geocodeZip(zc) : null;
      if (!g) continue;
      seen.add(sid);
      out.push({ num: sid, label: name.trim() || g.label, lat: g.lat, lng: g.lng, zip: zc, address: addr });
    }
    return out;
  }

  storeCookies(zip, storeId, rec, geo) {
    const szip = (rec && rec.zip) || zip || "";
    const lat = geo ? geo.lat : 0, lng = geo ? geo.lng : 0;
    const loc = {
      intent: "PICKUP", storeIntent: "PICKUP", mergeFlag: true, isExplicitIntent: true,
      displayName: (rec && rec.label) || "", pickup: { nodeId: String(storeId) },
      postalCode: { base: szip }, validateKey: "true",
    };
    if (lat && lng) loc.address = { postalCode: szip, latitude: lat, longitude: lng, city: "", state: "" };
    const dom = ".walmart.com";
    return [
      { name: "assortmentStoreId", value: String(storeId), domain: dom, path: "/" },
      { name: "locGuestData", value: JSON.stringify(loc), domain: dom, path: "/" },
    ];
  }
}
