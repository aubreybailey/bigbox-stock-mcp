#!/usr/bin/env node
/**
 * Phase B smoke test — verifies the ported core against the saved finder HTML
 * fixtures and known Python outputs. Run: `node test/smoke.mjs` (needs network
 * for geocoding). Exit 0 = all pass.
 */
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { geocodeZip, milesBetween } from "../extension/core/geo.mjs";
import { classify, domainOf, extractPrice } from "../extension/core/classify.mjs";
import { get, retailersFor, categoryDomains, REGISTRY } from "../extension/core/registry.mjs";
import { storesNear } from "../extension/core/cache.mjs";
import { nodeFsAdapter } from "../extension/core/cache-node.mjs";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = (f) => readFileSync(join(FIX, f), "utf8");
let pass = 0, fail = 0;
const ok = (name, cond, got) => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  (got: ${got})`}`); };

// geo
const g = await geocodeZip("01545");
ok("geocode 01545 -> Shrewsbury, MA", g && g.label === "Shrewsbury, MA", g && g.label);
ok("haversine 01545->01605 ~3.5mi", g && Math.abs(milesBetween(g, await geocodeZip("01605")) - 3.5) < 0.3);

// classify
ok("classify out_of_stock", classify("u", "This item is Out of stock").verdict === "out_of_stock");
ok("classify blocked (PX)", classify("u", "Robot or human? Press and hold").verdict === "blocked");
ok("domainOf www.target.com", domainOf("https://www.target.com/p/x") === "target.com");
ok("extractPrice json", extractPrice('"price":"49.98"') === "$49.98");

// registry
ok("registry has 19", REGISTRY.size === 19, REGISTRY.size);
ok("www.walmart.com -> Walmart", get("https://www.walmart.com/ip/x").constructor.name === "Walmart");
ok("retailersFor charmin -> grocery_household", retailersFor("charmin").categories.join() === "grocery_household");
ok("categories complete", Object.keys(categoryDomains()).sort().join(",") === "electronics,grocery_household,home_hardware,pharmacy,toys_games");

// parsers vs fixtures (must match the verified Python counts/ids)
const cases = [
  ["target.com", "locate_target_com.html", 20, "1348"],
  ["bestbuy.com", "locate_bestbuy_com.html", 15, null],
  ["lowes.com", "locate_lowes_com.html", 4, "1206"],
  ["walmart.com", "locate_walmart_com.html", 50, "2158"],
  ["homedepot.com", "locate_homedepot_com.html", 1, null],
  ["gamestop.com", "locate_gamestop_com.html", 6, "3780"],
  ["walgreens.com", "locate_walgreens_com.html", 49, "9233"],
];
for (const [dom, file, n, mustHaveId] of cases) {
  const st = await get(dom).parseStores(read(file));
  ok(`${dom} parseStores -> ${n}`, st.length === n, st.length);
  if (mustHaveId) ok(`${dom} has store #${mustHaveId}`, st.some((s) => s.num === mustHaveId));
}

// cache + storesNear
const dir = "/tmp/sc_js_cache_smoke";
rmSync(dir, { recursive: true, force: true });
const adapter = nodeFsAdapter(dir);
const tgtHtml = read("locate_target_com.html");
const r1 = await storesNear("target.com", "01545", 20, { adapter, fetchHtml: async () => tgtHtml });
ok("storesNear call1 parsed+ranked (Worcester closest)", !r1.cached && r1.stores[0].num === "1348", r1.stores[0] && r1.stores[0].num);
const r2 = await storesNear("target.com", "01545", 20, { adapter });
ok("storesNear call2 served from cache", r2.cached && r2.stores.length === r1.stores.length);
rmSync(dir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
