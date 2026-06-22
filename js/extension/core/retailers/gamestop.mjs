/** GameStop — store-finder (layer 2). Per-store pickup not yet researched.
 *
 * The finder renders cards with a `/store/us/<st>/<city>/<id>/` link, a
 * `.store-name` span, and lat/lng in JSON. The generic parser mislabels the
 * store number (it grabs the single preferred-store-id), so we pull the real id
 * from the link and pair name + coords by document position. NOTE: the finder
 * localizes by IP/real navigation, not the `?q=` zip — so in the real browser it
 * returns the user's region; ranking is by the parsed coords.
 */
import { Retailer } from "../base.mjs";

const LINK_RE = /\/store\/us\/([a-z]{2})\/([a-z0-9.-]+)\/(\d{2,5})\//gi;
const NAME_RE = /class="store-name">\s*([^<]+?)\s*</gi;
const LAT_RE = /"(?:lat|latitude)"\s*:\s*"?(-?\d{1,2}\.\d{3,})"?/gi;
const LNG_RE = /"(?:lng|lon|long|longitude)"\s*:\s*"?(-?\d{1,3}\.\d{3,})"?/gi;

export class GameStop extends Retailer {
  domain = "gamestop.com";
  categories = ["electronics", "toys_games"];
  searchTmpl = "https://www.gamestop.com/search/?q={q}";
  finderTmpl = "https://www.gamestop.com/stores/?q={zip}";

  signalHints = {
    oos: /out of stock|sold out|unavailable/i,
    avail: /add to cart|in stock|pick ?up|available/i,
  };

  async parseStores(html) {
    html = html || "";
    const at = (re) => [...html.matchAll(re)];
    const names = at(NAME_RE).map((m) => [m.index, m[1]]);
    const lats = at(LAT_RE).map((m) => [m.index, parseFloat(m[1])]);
    const lngs = at(LNG_RE).map((m) => [m.index, parseFloat(m[1])]);
    const nearest = (pos, pairs) => (pairs.length ? pairs.reduce((a, b) => (Math.abs(b[0] - pos) < Math.abs(a[0] - pos) ? b : a))[1] : null);
    const out = [], seen = new Set();
    for (const m of at(LINK_RE)) {
      const [, st, cityRaw, id] = m;
      if (seen.has(id)) continue;
      seen.add(id);
      const lat = nearest(m.index, lats), lng = nearest(m.index, lngs);
      if (lat == null || lng == null || !(lat > 17 && lat < 72 && lng > -180 && lng < -64)) continue;
      const city = cityRaw.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const nm = nearest(m.index, names);
      out.push({ num: id, label: (nm && nm.trim()) || `${city}, ${st.toUpperCase()}`, lat, lng, zip: "", address: "" });
    }
    return out;
  }
}
