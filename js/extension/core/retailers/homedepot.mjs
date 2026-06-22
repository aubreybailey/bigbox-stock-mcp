/** Home Depot — ported from retailers/homedepot.py (dump-only / IP-local, partial).
 * parseStores yields the one IP-localized header store (no number). Pickup reads
 * the IP-local store. pickupEngine "dump" is Python parity; in the extension all
 * reads are real-browser, so this flag is informational for now. */
import { Retailer } from "../base.mjs";
import { geocodeZip } from "../geo.mjs";

export class HomeDepot extends Retailer {
  domain = "homedepot.com";
  categories = ["home_hardware"];
  finderEngine = "dump";
  pickupEngine = "dump";
  searchTmpl = "https://www.homedepot.com/s/{q}";
  finderTmpl = "https://www.homedepot.com/l/search/{zip}";

  signalHints = {
    oos: /fulfillment__out-of-stock|TrackOutOfStock|FulfillmentNotifyMe/i,
    avail: /fulfillment__(?:pickup|delivery)["']?>?\s*(?!out)/i,
    store: /"storeName"\s*:\s*"([^"]+)"\s*,\s*"storeZip"\s*:\s*"([0-9]+)"/,
  };

  storeStock = true;
  pickupHints = {
    avail: /(pickup today|pick ?up at [A-Za-z]|\d+\s+in stock|ready (?:today|tomorrow|by|within)|in stock at|free pickup)/i,
    oos: /(out of stock|unavailable for pickup|sold out|no longer available|not (?:available|sold)|notify me when|out of stock online)/i,
    store: /Pickup at ([A-Za-z][A-Za-z .'-]{1,28}?)\s+(?:Delivering|Pickup|FREE|Check|Today)/i,
    ready: /Pickup\s+(Today|Tomorrow|by [A-Za-z]{3}[^,.]{0,14})/i,
  };

  async parseStores(html) {
    const out = [];
    html = html || "";
    const m = /data-component="HeaderMyStore"[\s\S]*?<p[^>]*>([A-Za-z][A-Za-z .'-]{1,30})<\/p>/.exec(html);
    if (!m) {
      const jm = this.signalHints.store.exec(html);
      if (!jm) return out;
      const g = await geocodeZip(jm[2]);
      const sm = /"storeId"\s*:\s*"?(\d{2,5})/.exec(html);
      if (g) out.push({ num: sm ? sm[1] : "", label: jm[1], lat: g.lat, lng: g.lng, zip: jm[2], address: "" });
      return out;
    }
    const name = m[1].trim();
    const zm = /data-component="HeaderDeliveryZip"[\s\S]*?<p[^>]*>(\d{5})<\/p>/.exec(html);
    const zc = zm ? zm[1] : null;
    const g = zc ? await geocodeZip(zc) : null;
    if (!g) return out;
    out.push({ num: "", label: name, lat: g.lat, lng: g.lng, zip: zc, address: "" });
    return out;
  }

  storeCookies(zip, storeId, rec) {
    if (!storeId) return null;
    const dom = ".homedepot.com";
    return [
      { name: "THD_LOCALSTORE", value: String(storeId), domain: dom, path: "/" },
    ];
  }
}
