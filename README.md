# bigbox-stock-mcp

Check whether a product is **in stock for local pickup** at big-box / retail chains
(Target, Best Buy, Lowe's, Walmart, Home Depot, Walgreens, GameStop, …) by driving
**your real browser** through a Manifest V3 extension, exposed to agents as an **MCP
server**.

Running inside a real browser — your IP, fingerprint, cookies, logins, and you
present to solve a challenge — is what gets past the Akamai/PerimeterX bot walls and
the IP-geolocation store gating that a headless scraper cannot.

> The project lives under [`js/`](js/). See **[`js/README.md`](js/README.md)** for the
> full architecture, per-chain status/learnings, and the test/integration apparatus.

## Layers (MCP tools)
1. **What sells X?** — `find_retailers`, `list_retailers`
2. **What stores are near me?** — `find_stores` (drives the finder, caches the directory)
3. **Is it in stock at this store?** — `check_store_stock` (pins the store, reads pickup), `check_product`

## Quick start
```bash
cd js
npm install
npm run bridge                      # local WS bridge + /rpc (terminal 1)
# Chrome/Edge: chrome://extensions → Developer mode → Load unpacked → js/extension
# Firefox: copy manifest.firefox.json over manifest.json, then about:debugging → Load Temporary Add-on
node server/test-client.mjs findStores site=target.com zip=01545
claude mcp add bigbox-stock -- node "$PWD/server/mcp.mjs"
npm test                            # offline logic checks (parsers vs fixtures)
```

## Architecture (one line)
`agent → MCP (mcp.mjs) → /rpc bridge (bridge.mjs) → MV3 extension SW → your real browser`
(navigate `tabs` · read DOM `scripting` · pin store `cookies` · call chain APIs `fetch`).
Per-chain logic is one module each under `js/extension/core/retailers/`.

## Status
Verified live (real browser): **Target**, **Best Buy** (find + per-store pickup);
finders for **Walgreens**, **GameStop**, **Walmart**, **Home Depot**, **Lowe's**,
**Tractor Supply**. Client-rendered, auth-gated finders (CVS/Costco/Micro Center/Ace/
Harbor Freight/Menards) need DOM-scrape-after-render in a warm browser — see `js/README.md`.

## License
GPL (see [`LICENSE`](LICENSE)).
