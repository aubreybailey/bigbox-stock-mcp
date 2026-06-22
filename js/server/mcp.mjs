#!/usr/bin/env node
/**
 * storecheck MCP server (JS) — exposes the layered tools to the agent.
 *
 * Chain-agnostic tools (find_retailers, list_retailers) are answered locally from
 * the ported core. Browser tools (find_stores, check_store_stock, check_product)
 * are forwarded to the bridge's /rpc, which relays to the extension running in the
 * user's real browser. Start the bridge and load the extension first (see ../README.md).
 *
 * Register:  claude mcp add bigbox-stock -- node "$(pwd)/server/mcp.mjs"   (run from the js/ dir)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { get, retailersFor, categoryDomains, allRetailers } from "../extension/core/registry.mjs";

const BRIDGE = process.env.STORECHECK_BRIDGE || "http://127.0.0.1:8788";

async function rpc(cmd) {
  try {
    const r = await fetch(`${BRIDGE}/rpc`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cmd) });
    return await r.json();
  } catch (e) {
    return { error: `bridge not reachable at ${BRIDGE} — start \`npm run bridge\` and load the extension in Chrome (${String(e.message || e)})` };
  }
}
const asText = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

const server = new McpServer({ name: "storecheck", version: "0.2.0" });

// ── layer 1: what sells X (local) ────────────────────────────────────────────────
server.tool(
  "find_retailers",
  "Given a free-text item (e.g. 'Charmin toilet paper', 'Nintendo Switch'), return candidate categories and the chains likely to carry it.",
  { item: z.string() },
  async ({ item }) => asText(retailersFor(item)),
);

server.tool(
  "list_retailers",
  "List supported retailers (optionally filtered by category) and their capabilities.",
  { category: z.string().optional() },
  async ({ category }) => {
    const catmap = categoryDomains();
    const domains = category ? (catmap[category] || []) : [...new Set(allRetailers().map((r) => r.domain))];
    return asText({
      category: category || null,
      retailers: domains.map((d) => {
        const r = get(d);
        return { site: d, searchable: !!r.searchTmpl, has_store_finder: !!r.finderTmpl, has_signal_hints: !!Object.keys(r.signalHints || {}).length, per_store_stock: !!r.storeStock };
      }),
    });
  },
);

// ── layer 2: stores near me (browser) ────────────────────────────────────────────
server.tool(
  "find_stores",
  "Stores of `site` within `radius_mi` of US `zip`, GPS-ranked. Drives the real browser to read the chain's store-finder; caches the directory.",
  { site: z.string(), zip: z.string(), radius_mi: z.number().optional(), refresh: z.boolean().optional() },
  async ({ site, zip, radius_mi = 30, refresh = false }) => asText(await rpc({ type: "findStores", site, zip, radius: radius_mi, refresh })),
);

// ── layer 3: in stock (browser) ──────────────────────────────────────────────────
server.tool(
  "check_store_stock",
  "Per-store pickup: pins the fulfillment store (store_id from find_stores) and reads whether `product_url` is available for pickup THERE, in the user's real browser.",
  { site: z.string(), product_url: z.string(), store_id: z.string(), zip: z.string().optional() },
  async ({ site, product_url, store_id, zip }) => asText(await rpc({ type: "checkStore", site, productUrl: product_url, storeId: store_id, zip })),
);

server.tool(
  "check_product",
  "Generic single-PDP verdict (available / out_of_stock / discontinued / blocked / inconclusive) for the IP-localized store, in the user's real browser.",
  { url: z.string(), zip: z.string().optional() },
  async ({ url }) => asText(await rpc({ type: "checkProduct", url })),
);

await server.connect(new StdioServerTransport());
