# Privacy Policy — bigbox-stock

_Last updated: 2026-06-22_

bigbox-stock is a browser extension that checks **per-store pickup availability**
at retailer websites, driven locally by you (or by an agent via the bundled local
MCP server). It is designed to keep all data **on your machine**.

## What it does
- Opens retailer pages (Target, Best Buy, Lowe's, Walmart, Home Depot, Walgreens,
  GameStop, …) in your browser, reads the rendered page (store lists, pickup
  availability), and reports the result back to the locally-running companion
  process over a **localhost** WebSocket (`127.0.0.1`).
- Sets the retailer's own store-selection **cookies** (e.g. to pin a store for a
  pickup check) on that retailer's domain — the same cookies the site sets when
  you pick a store yourself.
- Caches the public store directory it scrapes in the browser's local
  `storage` so it doesn't re-fetch it every time.
- Geocodes US ZIP codes via the public `api.zippopotam.us` service (ZIP → lat/lng)
  to rank stores by distance. Only the ZIP you query is sent.

## What it does NOT do
- It does **not** send your browsing data, page contents, cookies, or any personal
  information to the extension's author or any third-party server. Results go only
  to the local companion process on `127.0.0.1`.
- It does **not** contain remotely-hosted or `eval`'d code. All logic ships in the
  extension package.
- It does **not** track you, run analytics, or display ads.
- It only acts on the retailer domains listed in the manifest's `host_permissions`,
  and only when you (or your local agent) ask it to check something.

## Permissions, and why
- `tabs` / `scripting` — open a retailer page and read its rendered content.
- `cookies` — set a retailer's store-selection cookie to check a specific store.
- `storage` — cache the scraped public store directory locally.
- `host_permissions` (specific retailer domains + `api.zippopotam.us`) — the sites
  it is allowed to read and the ZIP geocoder.

## Data retention
Nothing is retained off your device. The local store-directory cache lives in your
browser profile and you can clear it any time via the extension's storage / your
browser's "clear data".

## Contact
Issues: https://github.com/aubreybailey/bigbox-stock-mcp
