/**
 * Network-free unit tests (node --test) for the ported core logic.
 * Fast + deterministic — these run in the pre-push hook. The fixture-based parser
 * checks (which geocode over the network) live in ../smoke.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { classify, domainOf, extractPrice, visibleText } from "../../extension/core/classify.mjs";
import { milesBetween, storeMatches } from "../../extension/core/geo.mjs";
import { mergeStores, rankStores } from "../../extension/core/cache.mjs";
import { get, retailersFor, categoryDomains, REGISTRY } from "../../extension/core/registry.mjs";

test("classify verdicts (order: blocked > oos > available > inconclusive)", () => {
  assert.equal(classify("u", "This item is Out of stock").verdict, "out_of_stock");
  assert.equal(classify("u", "Pickup today at store").verdict, "available");
  assert.equal(classify("u", "Robot or human? Press and hold").verdict, "blocked");
  assert.equal(classify("u", "nothing relevant").verdict, "inconclusive");
});

test("text helpers", () => {
  assert.equal(domainOf("https://www.target.com/p/x"), "target.com");
  assert.equal(domainOf("https://shop.bestbuy.com/y"), "bestbuy.com");
  assert.equal(extractPrice('"price":"49.98"'), "$49.98");
  assert.equal(extractPrice("now $19.99 each"), "$19.99");
  assert.match(visibleText("<script>danger()</script><b>hi</b>"), /hi/);
  assert.doesNotMatch(visibleText("<script>danger()</script>"), /danger/);
});

test("geo math", () => {
  const shrewsbury = { lat: 42.2848, lng: -71.7205 };
  const worcester = { lat: 42.2626, lng: -71.8023 };
  const d = milesBetween(shrewsbury, worcester);
  assert.ok(d > 3 && d < 7, `distance ${d}`);
  assert.equal(storeMatches("Worcester Lowe's", ["worcester"]), true);
  assert.equal(storeMatches("Worcester", ["boston"]), false);
  assert.equal(storeMatches(null, ["x"]), false);
});

test("cache merge + rank", () => {
  const merged = mergeStores(
    [{ num: "1", label: "A", lat: 1, lng: 1, zip: "" }],
    [{ num: "1", lat: 1, lng: 1, zip: "01545" }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].zip, "01545");
  const ranked = rankStores(
    [{ num: "far", lat: 42.0, lng: -71.0 }, { num: "near", lat: 42.285, lng: -71.72 }],
    { lat: 42.2848, lng: -71.7205 },
    100,
  );
  assert.equal(ranked[0].num, "near");
  assert.ok(ranked[0].distMi < ranked[1].distMi);
});

test("registry routing", () => {
  assert.equal(REGISTRY.size, 19);
  assert.equal(get("https://www.walmart.com/ip/x").constructor.name, "Walmart");
  assert.equal(get("nosuch.example").constructor.name, "GenericRetailer");
  assert.equal(get("target.com").searchUrl("a b"), "https://www.target.com/s?searchTerm=a%20b");
  assert.deepEqual(retailersFor("charmin").categories, ["grocery_household"]);
  assert.ok(Object.keys(categoryDomains()).includes("electronics"));
});

test("dedicated chains expose per-store stock flags", () => {
  assert.equal(get("target.com").storeStock, true);
  assert.equal(get("bestbuy.com").storeStock, true);
  assert.equal(get("homedepot.com").pickupEngine, "dump");
});
