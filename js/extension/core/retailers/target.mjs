/** Target — ported from retailers/target.py (verified). */
import { Retailer, stateFromAddr } from "../base.mjs";
import { geocodeZip } from "../geo.mjs";

export class Target extends Retailer {
  domain = "target.com";
  categories = ["electronics", "grocery_household", "home_hardware", "toys_games", "pharmacy"];
  searchTmpl = "https://www.target.com/s?searchTerm={q}";
  finderTmpl = "https://www.target.com/store-locator/find-stores/{zip}";

  signalHints = {
    oos: /Out of stock|Sold out|not available/i,
    avail: /Add to cart|Pick up|Ready within|In stock/i,
    store: /"store_name"\s*:\s*"([^"]+)"|at\s+([A-Za-z .'-]+)\s+store/,
  };

  storeStock = true;
  pickupHints = {
    avail: /(pickup\s+ready (?:tomorrow|today|within|by)|ready (?:tomorrow|today|within|by)|for pickup inside the store|available for pickup)/i,
    oos: /(out of stock|sold out|not available|unavailable)/i,
    store: /Pick up at ([A-Za-z][A-Za-z .'-]{1,26}?)\s+(?:Check other stores|Ready|Sold|Out|Not|Pickup)/i,
    ready: /Ready\s+(today|tomorrow|within[^,.]{0,18}|by [A-Za-z]{3},?\s*[A-Za-z]{3}\s*\d{1,2})/i,
  };

  async parseStores(html) {
    const out = [], seen = new Set();
    const cards = (html || "").split('data-test="@store-locator/StoreCard"').slice(1);
    for (const block of cards) {
      const idm = /\/sl\/[^/"]+\/(\d{2,5})/.exec(block);
      if (!idm) continue;
      const sid = idm[1];
      if (seen.has(sid)) continue;
      seen.add(sid);
      const name = (/StoreCardTitle"[^>]*>([^<]+)</.exec(block) || [, ""])[1].trim();
      const addr = (/StoreAddress"[^>]*>([^<]+)</.exec(block) || [, ""])[1].trim();
      const zm = /\b(\d{5})(?:-\d{4})?\b/.exec(addr);
      const zc = zm ? zm[1] : null;
      const g = zc ? await geocodeZip(zc) : null;
      if (!g) continue;
      out.push({ num: sid, label: name || g.label, lat: g.lat, lng: g.lng, zip: zc, address: addr });
    }
    return out;
  }

  storeCookies(zip, storeId, rec, geo) {
    const lat = geo ? geo.lat : 0, lng = geo ? geo.lng : 0;
    const state = (rec && rec.state) || stateFromAddr(rec && rec.address) || "MA";
    const loc = `${zip || ""}|${lat.toFixed(3)}|${lng.toFixed(3)}|${state}|US`;
    const name = (rec && rec.label) || "";
    const szip = (rec && rec.zip) || zip || "";
    const fiats = `DSI_${storeId}|DSN_${name}|DSZ_${szip}`;
    const dom = ".target.com";
    return [
      { name: "GuestLocation", value: loc, domain: dom, path: "/" },
      { name: "UserLocation", value: loc, domain: dom, path: "/" },
      { name: "fiatsCookie", value: fiats, domain: dom, path: "/" },
    ];
  }
}
