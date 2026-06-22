/** Lowe's — ported from retailers/lowes.py (verified). headful runtime. */
import { Retailer, stateFromAddr, cityFromAddr } from "../base.mjs";
import { geocodeZip } from "../geo.mjs";
import { visibleText } from "../classify.mjs";

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export class Lowes extends Retailer {
  domain = "lowes.com";
  categories = ["home_hardware"];
  finderEngine = "headful";
  searchTmpl = "https://www.lowes.com/search?searchTerm={q}";
  finderTmpl = "https://www.lowes.com/store";   // IP-localized list; /store/MA/?zip 404s

  signalHints = {
    oos: /THIS ITEM IS OUT OF STOCK|no longer sold on Lowes/i,
    avail: />\s*Add to Cart\s*<|Free Pickup|Pick Up Today|In Stock/i,
    store: /([A-Za-z .'-]+? Lowe'?s)\b[\s\S]{0,40}?\b(\d{5})\b/i,
  };

  storeStock = true;
  pickupHints = {
    avail: /(FREE\s+)?Pickup\s+(?:at\s+[A-Za-z][A-Za-z .'-]{1,28}?\s+Lowe'?s|Today|Tomorrow|[A-Z][a-z]{2},\s*[A-Z][a-z]{2}\s*\d{1,2})/i,
    oos: /(Pickup\s+Available\s+Nearby|THIS ITEM IS OUT OF STOCK|out of stock|not available(?:\s+at)?|no longer sold)/i,
    store: /Pickup\s+at\s+([A-Za-z][A-Za-z .'-]{1,28}?\s+Lowe'?s)/i,
    ready: /Pickup\s+(Today|Tomorrow|[A-Z][a-z]{2},\s*[A-Z][a-z]{2}\s*\d{1,2})/i,
  };

  async parseStores(html) {
    const out = [], seen = new Set();
    const text = visibleText(html).replace(/\u00a0/g, " ");
    for (const m of (html || "").matchAll(/\/store\/([A-Z]{2})-([A-Za-z.-]+)\/(\d{3,4})/g)) {
      const [, st, cityRaw, num] = m;
      if (seen.has(num)) continue;
      seen.add(num);
      const city = cityRaw.replace(/-/g, " ");
      const zm = new RegExp(escapeRe(city) + ",\\s*" + st + "\\s+(\\d{5})", "i").exec(text);
      const zc = zm ? zm[1] : null;
      const am = new RegExp("([0-9][0-9A-Za-z .#-]{3,40}?)\\s+" + escapeRe(city) + ",\\s*" + st + "\\s+" + (zc || "\\d{5}"), "i").exec(text);
      const addr = am ? `${am[1].trim()}, ${city}, ${st} ${zc}` : "";
      const g = zc ? await geocodeZip(zc) : null;
      if (!g) continue;
      out.push({ num, label: `${city} Lowe's`, lat: g.lat, lng: g.lng, zip: zc || "", address: addr });
    }
    return out;
  }

  storeCookies(zip, storeId, rec) {
    rec = rec || {};
    const label = rec.label || "";
    const city = label.replace(/Lowe'?s/g, "").trim() || cityFromAddr(rec.address) || "";
    const szip = rec.zip || zip || "";
    const state = stateFromAddr(rec.address) || "MA";
    const sd = JSON.stringify({ id: String(storeId), zip: szip, city, state, name: label || `${city} Lowe's` });
    const dom = ".lowes.com";
    return [
      { name: "sn", value: String(storeId), domain: dom, path: "/" },
      { name: "nearbyid", value: String(storeId), domain: dom, path: "/" },
      { name: "zipcode", value: szip, domain: dom, path: "/" },
      { name: "zipstate", value: state, domain: dom, path: "/" },
      { name: "sd", value: encodeURIComponent(sd), domain: dom, path: "/" },
    ];
  }
}
