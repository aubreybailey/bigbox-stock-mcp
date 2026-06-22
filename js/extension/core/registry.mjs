/**
 * Retailer registry — ported from retailers/__init__.py + the item routing that
 * lived in storecheck.py (ITEM_HINTS, retailers_for, category_domains).
 *
 * Dedicated chains have their own module; the long tail is GenericRetailer
 * instances configured by data. get(domain|url) returns a Retailer (an empty
 * GenericRetailer for unknowns, so the generic classifier still runs).
 */
import { Retailer, GenericRetailer } from "./base.mjs";
import { Target } from "./retailers/target.mjs";
import { BestBuy } from "./retailers/bestbuy.mjs";
import { Lowes } from "./retailers/lowes.mjs";
import { Walmart } from "./retailers/walmart.mjs";
import { HomeDepot } from "./retailers/homedepot.mjs";
import { GameStop } from "./retailers/gamestop.mjs";
import { Walgreens } from "./retailers/walgreens.mjs";

const DEDICATED = [new BestBuy(), new Target(), new Walmart(), new HomeDepot(), new Lowes(), new GameStop(), new Walgreens()];

const GENERIC = [
  new GenericRetailer("microcenter.com", {
    categories: ["electronics"],
    searchTmpl: "https://www.microcenter.com/search/search_results.aspx?N=0&NTK=all&Ntt={q}",
    finderTmpl: "https://www.microcenter.com/storelocator/storeLocator.aspx?zip={zip}",
    signalHints: {
      oos: /SOLD OUT|Out of Stock/i,
      avail: /In stock|IN STOCK|\d+\s+in stock/i,
      store: /Store:\s*([A-Za-z .,'-]+)/,
    },
  }),
  new GenericRetailer("cvs.com", {
    categories: ["grocery_household", "pharmacy"],
    searchTmpl: "https://www.cvs.com/search?searchTerm={q}",
    finderTmpl: "https://www.cvs.com/store-locator/cvs-pharmacy-locations?searchText={zip}",
    signalHints: { avail: /Add to (?:basket|cart)|In Stock|Pickup/i, oos: /Out of Stock|Currently unavailable/i },
  }),
  new GenericRetailer("staples.com", {
    categories: ["electronics"], searchTmpl: "https://www.staples.com/{q}/directory_{q}",
  }),
  new GenericRetailer("costco.com", {
    categories: ["electronics", "grocery_household", "toys_games"],
    searchTmpl: "https://www.costco.com/CatalogSearch?keyword={q}",
    finderTmpl: "https://www.costco.com/warehouse-locations?location={zip}",
  }),
  new GenericRetailer("samsclub.com", {
    categories: ["electronics", "grocery_household"],
    searchTmpl: "https://www.samsclub.com/s/{q}",
    finderTmpl: "https://www.samsclub.com/club-finder?singleLineAddr={zip}",
  }),
  new GenericRetailer("bjs.com", {
    categories: ["grocery_household"],
    searchTmpl: "https://www.bjs.com/search/{q}", finderTmpl: "https://www.bjs.com/clubLocator?zip={zip}",
  }),
  new GenericRetailer("meijer.com", {
    categories: ["grocery_household"],
    searchTmpl: "https://www.meijer.com/shopping/search.html?text={q}",
    finderTmpl: "https://www.meijer.com/shopping/store-finder.html?search={zip}",
  }),
  new GenericRetailer("riteaid.com", {
    categories: ["grocery_household", "pharmacy"],
    searchTmpl: "https://www.riteaid.com/shop/catalogsearch/result/?q={q}",
  }),
  new GenericRetailer("acehardware.com", {
    categories: ["home_hardware"],
    searchTmpl: "https://www.acehardware.com/search?query={q}",
    finderTmpl: "https://www.acehardware.com/store-details?zip={zip}",
  }),
  new GenericRetailer("menards.com", {
    categories: ["home_hardware"],
    searchTmpl: "https://www.menards.com/main/search.html?search={q}",
    finderTmpl: "https://www.menards.com/main/storeLocator.html?zip={zip}",
  }),
  new GenericRetailer("tractorsupply.com", {
    categories: ["home_hardware"],
    searchTmpl: "https://www.tractorsupply.com/tsc/search/{q}",
    finderTmpl: "https://www.tractorsupply.com/tsc/store-locator?q={zip}",
  }),
  new GenericRetailer("harborfreight.com", {
    categories: ["home_hardware"],
    searchTmpl: "https://www.harborfreight.com/search?q={q}",
    finderTmpl: "https://www.harborfreight.com/storelocator?q={zip}",
  }),
];

export const REGISTRY = new Map([...DEDICATED, ...GENERIC].map((r) => [r.domain, r]));

function norm(site) {
  let s = (site || "").toLowerCase().trim();
  s = s.split("//").pop().split("/")[0];
  if (s.startsWith("www.")) s = s.slice(4);
  const parts = s.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : s;
}

export function get(site) {
  const dom = norm(site);
  return REGISTRY.get(dom) || new GenericRetailer(dom);
}

export function allRetailers() {
  return [...REGISTRY.values()];
}

export function categoryDomains() {
  const cats = {};
  for (const r of REGISTRY.values())
    for (const c of r.categories) (cats[c] ||= []).push(r.domain);
  return cats;
}

// item -> category routing (ported from storecheck.py)
const ITEM_HINTS = {
  "toilet paper": "grocery_household", charmin: "grocery_household", "paper towel": "grocery_household",
  detergent: "grocery_household", diaper: "grocery_household", formula: "grocery_household",
  grocery: "grocery_household", snack: "grocery_household", soap: "grocery_household",
  switch: "electronics", playstation: "electronics", ps5: "electronics", xbox: "electronics",
  console: "electronics", tv: "electronics", laptop: "electronics", monitor: "electronics",
  headphone: "electronics", gpu: "electronics", ssd: "electronics", router: "electronics",
  drill: "home_hardware", lumber: "home_hardware", paint: "home_hardware", grill: "home_hardware",
  tool: "home_hardware", hose: "home_hardware",
  lego: "toys_games", toy: "toys_games", game: "toys_games", puzzle: "toys_games",
  ibuprofen: "pharmacy", tylenol: "pharmacy", vitamin: "pharmacy", prescription: "pharmacy", bandage: "pharmacy",
};

export function retailersFor(item) {
  const s = (item || "").toLowerCase();
  let cats = [...new Set(Object.entries(ITEM_HINTS).filter(([kw]) => s.includes(kw)).map(([, c]) => c))].sort();
  if (!cats.length) cats = ["electronics", "grocery_household", "home_hardware"];
  const catmap = categoryDomains();
  const sites = [], seen = new Set();
  for (const c of cats) for (const d of catmap[c] || []) if (!seen.has(d)) { seen.add(d); sites.push(d); }
  return { item, categories: cats, retailers: sites, searchable: sites.filter((d) => get(d).searchTmpl) };
}
