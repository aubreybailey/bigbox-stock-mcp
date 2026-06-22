/** Walgreens — store-finder (layer 2). Per-store pickup not yet researched.
 *
 * The locator is server-rendered: each store is an anchor
 * `/locator/walgreens-<street>-<city>-<st>-<zip>/id=<storeId>`. We parse the id +
 * city/state/zip from the href and geocode the zip (no lat/lng in the markup).
 */
import { Retailer } from "../base.mjs";
import { geocodeZip } from "../geo.mjs";

const STORE_RE = /\/locator\/walgreens-([^"/]+)\/id=(\d+)/gi;

export class Walgreens extends Retailer {
  domain = "walgreens.com";
  categories = ["grocery_household", "pharmacy"];
  searchTmpl = "https://www.walgreens.com/search/results.jsp?Ntt={q}";
  finderTmpl = "https://www.walgreens.com/storelocator/find.jsp?requestType=locator&q={zip}";

  signalHints = {
    avail: /Add to cart|In stock|Pickup/i,
    oos: /Out of stock|Currently unavailable/i,
  };

  async parseStores(html) {
    const out = [], seen = new Set();
    for (const m of (html || "").matchAll(STORE_RE)) {
      const id = m[2];
      if (seen.has(id)) continue;
      const parts = m[1].split("-");
      const zip = parts.at(-1), state = (parts.at(-2) || "").toUpperCase(), city = (parts.at(-3) || "").replace(/\+/g, " ");
      if (!/^\d{5}$/.test(zip) || !/^[A-Z]{2}$/.test(state)) continue;
      seen.add(id);
      const g = await geocodeZip(zip);
      if (!g) continue;
      const street = parts.slice(0, -3).join(" ").replace(/\+/g, " ").trim();
      out.push({ num: id, label: `${city.replace(/\b\w/g, (c) => c.toUpperCase())}, ${state}`, lat: g.lat, lng: g.lng, zip, address: street });
    }
    return out;
  }
}
