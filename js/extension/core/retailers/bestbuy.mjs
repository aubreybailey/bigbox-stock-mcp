/** Best Buy — ported from retailers/bestbuy.py (verified). */
import { Retailer } from "../base.mjs";
import { geocodeZip } from "../geo.mjs";

export class BestBuy extends Retailer {
  domain = "bestbuy.com";
  categories = ["electronics", "toys_games"];
  searchTmpl = "https://www.bestbuy.com/site/searchpage.jsp?st={q}";
  finderTmpl = "https://www.bestbuy.com/site/store-locator?zipCode={zip}";

  signalHints = {
    oos: /Sold Out|currently unavailable/i,
    avail: /Add to Cart|Pickup\s*<|Available (?:today|to ship|nearby)|Ready (?:within|in)/i,
    store: /"name"\s*:\s*"([^"]+?Best Buy[^"]*)"/,
  };

  storeStock = true;
  // Live PDP renders: "Availability Pickup Ready within 1 hour ... Pickup at Millbury".
  pickupHints = {
    avail: /(order now for pickup|available for pickup|ready (?:within|in|on|by|today|tomorrow)|pickup at [A-Za-z])/i,
    oos: /(sold out|not available (?:at|for pickup|nearby)|unavailable (?:nearby|at)|out of stock)/i,
    store: /Pickup at ([A-Za-z][A-Za-z .'-]{1,28}?)\s+(?:Sold by|Add to cart)|Your store\s+([A-Za-z][A-Za-z .'-]{1,28}?)\s+(?:Account|Sign|Shop|Deals|Support)/i,
    ready: /Ready\s+(within\s+\d+\s+\w+|today|tomorrow|in \d[^,.]{0,12}|[A-Za-z]{3},?\s+[A-Za-z]{3}\s+\d{1,2})/i,
  };

  async parseStores(html) {
    const out = [], seen = new Set();
    for (const m of (html || "").matchAll(/stores\.bestbuy\.com\/(\d{2,5})/g)) {
      const sid = m[1];
      if (seen.has(sid)) continue;
      seen.add(sid);
      const window = html.slice(Math.max(0, m.index - 1200), m.index + 200);
      const city = (/data-cy="LocationName"[^>]*>([^<]+)/.exec(window)?.[1] || "").trim();
      const zm = /\b([A-Z]{2})\s*<\/?[^>]*>?\s*(\d{5})\b/.exec(window) || /\b(\d{5})\b/.exec(window);
      const zc = zm ? zm[zm.length - 1] : null;
      const g = zc ? await geocodeZip(zc) : null;
      if (!g) continue;
      out.push({ num: sid, label: city || g.label, lat: g.lat, lng: g.lng, zip: zc || "", address: "" });
    }
    return out;
  }

  storeCookies(zip, storeId) {
    return [
      { name: "locDestZip", value: zip || "", domain: ".bestbuy.com", path: "/" },
      { name: "locStoreId", value: String(storeId), domain: ".bestbuy.com", path: "/" },
    ];
  }
}
