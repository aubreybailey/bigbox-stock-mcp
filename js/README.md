# storecheck — JS / browser-extension rewrite

Check whether a product is **in stock for local pickup** at retail chains
(Target, Best Buy, Lowe's, Walmart, Home Depot, …) by driving the user's **real
browser** through a Manifest V3 extension. Running in a real browser — the user's
IP, fingerprint, cookies, logins, and a human present to solve a challenge — is
what beats the Akamai/PerimeterX bot walls and the IP-geolocation store gating
that a headless engine cannot.

This is the JS rewrite of the original Python tool (`../storecheck.py` +
`../retailers/`), kept as the verified reference. See `../FINDINGS.md` /
`../PLAN.md` and `~/.claude/plans/joyful-roaming-nebula.md` for the back-story.

---

## Why a real browser (the whole point of the pivot)
The headless path (flatpak Chromium + Xvfb + CDP) hit two walls it could not pass:
- **Behavioral bot walls** — Walmart's PerimeterX "press-and-hold" needs a human.
- **IP-geolocation store gating** — Home Depot **and Walmart** decide the store
  from the request IP; injecting a store cookie *or* a `?storeId=` URL param is
  **ignored** (the server re-derives the store from IP). Verified directly.

The fix isn't a better scraper or a different language — it's the **runtime**. A
browser extension runs *inside* the user's real browser, so: real residential IP
(stores near you, correct localization), real fingerprint (no bot wall on most
chains), warm logins/cookies (membership chains), and the user can solve a
challenge in the live tab. Same-origin/`host_permissions` `fetch` from the
extension can also call a chain's own availability API without CORS — a path the
page itself can't take.

---

## Architecture
```
agent ──MCP(stdio)──▶ mcp.mjs ──HTTP /rpc──▶ bridge.mjs ──WebSocket :8787──▶ extension SW
  (Claude)            (Node)                  (Node)                          (real browser)
                                                                               ├ api.tabs       navigate
                                                                               ├ api.scripting  read DOM / click
                                                                               ├ api.cookies    pin the store
                                                                               └ fetch()        chain API (no CORS)
```
- **`extension/`** — the MV3 extension (the real-browser engine).
  - `sw.js` — service worker / background: connects to the bridge over WS and
    handles RPCs (`findStores`, `checkStore`, `checkProduct`, `searchLinks`,
    `dumpDom`). Uses `api = browser ?? chrome` so it runs in Firefox and Chromium.
  - `core/` — the ported, runtime-agnostic logic (also runs in Node for tests):
    - `geo.mjs` `classify.mjs` `base.mjs` (Retailer interface) `registry.mjs`
      (`get`, `categoryDomains`, `retailersFor`, REGISTRY of 19 chains)
      `cache.mjs` (`storesNear`, `mergeStores`, `rankStores`) with backends
      `cache-node.mjs` (fs) and `cache-chrome.mjs` (`*.storage.local`).
    - `core/retailers/{target,bestbuy,lowes,walmart,homedepot}.mjs` — per-chain
      `parseStores`, `signalHints`, `pickupHints`, `storeCookies` (ported verbatim
      from the verified Python).
  - `manifest.json` (Chrome/Edge: `background.service_worker`) and
    `manifest.firefox.json` (Firefox: `background.scripts` module + gecko id).
- **`server/`** — Node helpers (not loaded by the browser):
  - `bridge.mjs` — WS server (extension connects) + HTTP `/rpc` relay + `/health`.
  - `mcp.mjs` — MCP server exposing the 5 tools; chain-agnostic ones answered
    locally from `core/`, browser ones forwarded to the bridge.
  - `test-client.mjs` — CLI to send one RPC (stands in for the agent).
- **`test/`** — `smoke.mjs` (logic vs fixtures), `selftest-browser.mjs` and
  `dumpdom.mjs` (drive a real browser end-to-end / capture live DOM).

---

## Setup & run (Chromium / ungoogled-chromium)
```bash
cd js
npm install                       # ws, @modelcontextprotocol/sdk, zod
npm run bridge                    # terminal 1 — leave running
```
Load the extension once: `chrome://extensions` → **Developer mode** → **Load
unpacked** → select `js/extension`. Keep a window open
(`curl localhost:8788/health` → `{"extensionConnected":true}`). Then:
```bash
node server/test-client.mjs findStores  site=target.com zip=01545 radius=20
node server/test-client.mjs checkStore  site=target.com storeId=1348 zip=01545 \
      productUrl=https://www.target.com/p/-/A-53402416
```

## Firefox
The single `manifest.json` is cross-browser: it declares both `background.service_worker`
(Chrome) and `background.scripts` (Firefox), and the SW uses `browser ?? chrome`. Load
via `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick
`extension/manifest.json`, or `npx web-ext run -s extension`. Needs Firefox ≥142
(the `data_collection_permissions` consent key). (Live web-ext run is a pending follow-up.)

## Store packaging & compliance
```bash
npm run lint:ext     # web-ext lint — Chrome Web Store / AMO compliance (0 errors)
npm run build:ext    # -> dist/bigbox_stock-<version>.zip  (upload to a store)
```
`lint:ext` runs in CI. The one remaining web-ext warning ("service_worker ignored by
Firefox") is expected — it's the cost of one manifest serving both engines. Store
notes:
- **Icons**: 16/32/48/128 PNG in `extension/icons/` (regenerate with
  `node extension/icons/make-icons.mjs`); swap in real artwork before a public listing.
- **Privacy**: see [`../PRIVACY.md`](../PRIVACY.md) — no data leaves the machine (results
  go only to the localhost bridge), no remote code, no analytics. Both stores require a
  privacy-policy URL; point the dashboard at that file's published URL.
- **Permissions justification** (you'll be asked in the dashboards): `tabs`/`scripting`
  = open + read a retailer page; `cookies` = set the retailer's own store-selection
  cookie to check a specific store; `storage` = cache the public store directory;
  per-domain `host_permissions` = the sites it may read + the ZIP geocoder.
- **Acceptance caveat**: this extension is *driven by a local companion process* (the
  MCP bridge) to navigate/read/scrape — an unusual shape for a consumer store listing.
  Expect in-depth review (1–4 wks) and possible questions; it's well-suited to unpacked
  / self-distribution or Enterprise/self-hosted, and is a clean candidate for AMO's
  self-distribution signing.

## MCP server (agent-facing)
```bash
claude mcp add storecheck-js -- node /home/aubreybailey/Downloads/grill/js/server/mcp.mjs
```
Tools: `find_retailers`, `list_retailers` (local from `core/`), `find_stores`,
`check_store_stock`, `check_product` (forwarded to the extension). Bridge must be
running and the extension loaded.

---

## Testing & integration apparatus
Three layers, increasingly end-to-end:

1. **`npm test`** (`test/smoke.mjs`) — no browser. Verifies the ported core
   against saved finder-HTML fixtures in `../storecheck_out/` and known outputs
   (20 checks: parser store counts/ids match Python — Target 20, Best Buy 15,
   Lowe's 4, Walmart 50, HD 1; geo; classifier incl. PerimeterX `BOTWALL`;
   registry; `storesNear` ranking + cache hit). Run after any core change.

2. **`test/selftest-browser.mjs`** — spawns bridge + Chromium (+ Xvfb if headless)
   + the unpacked extension, waits for the SW to connect, runs
   findStores → (searchLinks for a live PDP) → checkStore. In-process timing (no
   `sleep` binary) so it survives the Claude-Code Bash sandbox. Env:
   | var | default | meaning |
   |-----|---------|---------|
   | `STORECHECK_DISPLAY` | `:99` | `:99` spawns its own Xvfb (headless); set `:0`/`:1` to use the real desktop |
   | `STORECHECK_XAUTH` | — | XAUTHORITY file (Xwayland); forwarded into flatpak |
   | `STORECHECK_PROFILE` | `/tmp/sc_selftest` | chromium user-data-dir (use `~/.storecheck/chrome` to persist) |
   | `STORECHECK_SITE` / `STORECHECK_ZIP` | `target.com` / `01545` | chain + ZIP |
   | `STORECHECK_QUERY` | — | if set, searchLinks finds a live PDP for checkStore |
   | `STORECHECK_PDP` | a Target PDP | explicit PDP (overrides search) |
   | `STORECHECK_KEEPOPEN` | `0` | ms to leave the browser open (to watch/solve) |

   Headless example (no screen needed):
   ```bash
   STORECHECK_SITE=target.com STORECHECK_QUERY=charmin node test/selftest-browser.mjs
   ```
   On the real desktop (windows visible; this box is Wayland/Xwayland):
   ```bash
   STORECHECK_DISPLAY=:0 STORECHECK_XAUTH=/run/user/1000/.mutter-Xwaylandauth.* \
   STORECHECK_PROFILE=$HOME/.storecheck/chrome STORECHECK_SITE=bestbuy.com \
   STORECHECK_QUERY=airpods node test/selftest-browser.mjs
   ```

3. **`test/dumpdom.mjs`** — capture the live rendered DOM for tuning. Writes
   innerText (`STORECHECK_KIND=text`) or `outerHTML` (`=html`) to `STORECHECK_OUT`.
   Can pin a store first (`STORECHECK_SITE`+`STORECHECK_STOREID`+`STORECHECK_ZIP`)
   or pre-seed cookies (`STORECHECK_COOKIES='[{...}]'`). This is how the Best Buy
   pickup wording was found:
   ```bash
   STORECHECK_DISPLAY=:0 STORECHECK_XAUTH=/run/user/1000/.mutter-Xwaylandauth.* \
   STORECHECK_PROFILE=$HOME/.storecheck/chrome \
   STORECHECK_URL='https://www.bestbuy.com/site/.../6447385.p' \
   STORECHECK_SITE=bestbuy.com STORECHECK_STOREID=2506 STORECHECK_ZIP=01545 \
   STORECHECK_OUT=/tmp/bb.txt node test/dumpdom.mjs
   ```

Environment notes (this box, Ubuntu 26.04): browser is flatpak
`io.github.ungoogled_software.ungoogled_chromium` (launched via `flatpak run`);
Xvfb at `/usr/bin/Xvfb`; the active session is Wayland, so on-screen runs use
Xwayland `:0` with `/run/user/1000/.mutter-Xwaylandauth.*`. When running browser
steps through Claude-Code Bash, disable the sandbox (it kills Chromium networking).

---

## Per-chain status & learnings (verified live in real Chromium)
| Chain | findStores | per-store pickup | notes |
|-------|-----------|------------------|-------|
| **Target** | ✅ 20 | ✅ `available, within 2 hours` | `fiatsCookie` pins the store; cleanest chain |
| **Best Buy** | ✅ 15 | ✅ `available, within 1 hour` | pins via `locStoreId`; PDP says "Ready **within** … Pickup at <store>" |
| **Lowe's** | ⚠️ finder | store-pin/pickup logic ready | cold `/store` shows only the IP-nearest store, not a parseable nearby list; needs a warm profile or a zip-driven locator endpoint |
| **Walmart** | ✅ 50 | ⏳ needs human | server re-derives store from IP; real fix = a "make my store" click + solving the PerimeterX hold in the live tab |
| **Home Depot** | ~1 (IP-local) | ⏳ IP-local | `/l/search` returns only the localized store; store list is a GraphQL POST |
| **GameStop** | ✅ 6 | ⏳ not researched | dedicated parser (`/store/us/<st>/<city>/<id>/` + coords); finder ignores `?q=` and localizes by IP |
| **Walgreens** | ✅ 49 | ⏳ not researched | dedicated parser (SSR `/locator/walgreens-…-<city>-<st>-<zip>/id=<id>` → geocode zip) |
| **Tractor Supply** | ✅ (generic) | ⏳ not researched | finder exposes lat/lng JSON → the **generic** parser handles it, no dedicated module |

### Store-finder coverage: SSR vs client-rendered
A chain's `findStores` only works if its store-finder exposes store data we can read
from the rendered DOM — either **lat/lng JSON** (the generic parser pairs them) or
**SSR anchors/addresses** (a dedicated `parseStores`). Confirmed **client-rendered**
(store list fetched by XHR after load, *not* in the DOM even at full capture):
**CVS, Costco, Micro Center, Ace Hardware, Harbor Freight, Menards**. Supporting
those needs a different technique. **API-replay was tried for CVS and does not work
non-interactively:** the locator API (`/api/locator/v2/stores/search`) is Akamai- +
**bearer-token**-protected — a cold SW `fetch` (even after warming cookies by visiting
the finder) returns `403 Access Denied`; it needs the `Authorization` token the page's
JS gets from `/api/guest/v1/token`. So the realistic path for these chains is to let the
page's *own* JS call its API (with its token) and then **scrape the rendered DOM** — which
requires the SPA to render without an Akamai wall, i.e. the user's real/warm browser
(or longer settle + shadow-DOM traversal). Token-replay would mean capturing a live
bearer token (brittle, expires) — not pursued.

Dev tools used for this investigation (kept, in `extension/sw.js` + `test/run.mjs`):
`netLog` (list a page's `performance` resource URLs → find the XHR endpoint),
`fetchJson` (SW `fetch` a URL with host permission), and the generic
`STORECHECK_CMD='{...}' node test/run.mjs` runner (spawns the stack, sends any RPC,
optional `STORECHECK_CMD1` warm-up call on the same session). `dumpdom.mjs` uses a
fresh profile + configurable `STORECHECK_MAX` so big SPA pages capture fully.

Key learnings:
- **Tune pickup regexes from real DOM, not assumptions.** Best Buy returned
  `inconclusive` purely because the live PDP says "Ready **within** 1 hour" while
  the regex required "ready on/by/today/tomorrow". `dumpDom` made this obvious.
- **Store-name read-back** comes from `pickupHints.store`; pin success is visible
  there (e.g. `store: "Worcester"` vs `"Millbury"`).
- **IP geo is the hard limit for arbitrary stores** (HD/Walmart). The real browser
  gives you *your* area for free; targeting a *far* store still needs a UI "set
  store" action (which persists in a real profile) or a residential proxy.
- **Warm profile matters**: Lowe's (Akamai-heavy) is the likeliest to "just work"
  on the user's real profile vs a cold dedicated one.

## Adding a new chain
Create `extension/core/retailers/<chain>.mjs` extending `Retailer` (see
`target.mjs`): set `domain`, `categories`, `searchTmpl`, `finderTmpl`,
`signalHints`, and for per-store stock `storeStock = true` + `pickupHints` +
`storeCookies()` + a `parseStores()` override. Register it in
`core/registry.mjs`. Verify `parseStores` with `npm test` (add a fixture) and the
live flow with `selftest-browser.mjs`; tune `pickupHints` with `dumpdom.mjs`.
