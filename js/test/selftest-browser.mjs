#!/usr/bin/env node
/**
 * Browser self-test (dev): spawns the bridge + flatpak Chromium with the unpacked
 * extension, waits for the SW to connect, then exercises findStores + checkStore.
 * In-process timing (no `sleep` binary) so it survives the Bash sandbox.
 *
 * Env:
 *   STORECHECK_DISPLAY   X display (default :99 -> spawns its own Xvfb;
 *                        set to :0/:1 to use the real desktop, no Xvfb spawned)
 *   STORECHECK_XAUTH     XAUTHORITY file (for Xwayland), forwarded into flatpak
 *   STORECHECK_PROFILE   chromium user-data-dir (default /tmp/sc_selftest)
 *   STORECHECK_SITE      chain to test (default target.com)
 *   STORECHECK_ZIP       zip (default 01545)
 *   STORECHECK_PDP       product URL for checkStore (default a Target Charmin PDP)
 *   STORECHECK_KEEPOPEN  ms to leave the browser open after the run (default 0)
 */
import { spawn, spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { get } from "../extension/core/registry.mjs";

// per-chain PDP href patterns (to pick a real product from the search page)
const PDP_PAT = {
  "target.com": "A-\\d+",
  "bestbuy.com": "\\d+\\.p\\b",
  "lowes.com": "/pd/",
  "walmart.com": "/ip/",
  "homedepot.com": "/p/.*\\d{6,}",
};

const APP = "io.github.ungoogled_software.ungoogled_chromium";
const JS = dirname(dirname(fileURLToPath(import.meta.url))); // repo js/ (this file is js/test/)
const EXT = `${JS}/extension`;
const DISPLAY = process.env.STORECHECK_DISPLAY || ":99";
const XAUTH = process.env.STORECHECK_XAUTH || "";
const PROFILE = process.env.STORECHECK_PROFILE || "/tmp/sc_selftest";
const SITE = process.env.STORECHECK_SITE || "target.com";
const ZIP = process.env.STORECHECK_ZIP || "01545";
const PDP = process.env.STORECHECK_PDP || "https://www.target.com/p/-/A-53402416";
const KEEPOPEN = Number(process.env.STORECHECK_KEEPOPEN || 0);
const LOG = "/tmp/sc_chrome.log";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kids = [];
const spawnP = (cmd, args, opts = {}) => { const p = spawn(cmd, args, { stdio: "ignore", ...opts }); kids.push(p); return p; };
function cleanup() {
  for (const p of kids) { try { p.kill("SIGKILL"); } catch {} }
  spawnSync("pkill", ["-9", "-f", PROFILE]);
  if (DISPLAY === ":99") spawnSync("pkill", ["-9", "-f", "Xvfb :99"]);
}
async function rpc(cmd) {
  const r = await fetch("http://127.0.0.1:8788/rpc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cmd) });
  return r.json();
}

try {
  spawnP("node", ["server/bridge.mjs"], { cwd: JS, env: process.env });
  if (DISPLAY === ":99") { spawnP("/usr/bin/Xvfb", [":99", "-screen", "0", "1366x900x24", "-nolisten", "tcp", "-ac"]); await sleep(2000); }

  const chromeEnv = { ...process.env, DISPLAY };
  if (XAUTH) chromeEnv.XAUTHORITY = XAUTH;
  const chromeArgs = ["run", "--share=network", APP, "--no-first-run", "--no-default-browser-check",
    "--disable-gpu", `--user-data-dir=${PROFILE}`, `--load-extension=${EXT}`,
    `--disable-extensions-except=${EXT}`, "about:blank"];
  if (XAUTH) chromeArgs.splice(2, 0, `--env=XAUTHORITY=${XAUTH}`);
  const logfd = openSync(LOG, "w");
  spawnP("flatpak", chromeArgs, { env: chromeEnv, stdio: ["ignore", logfd, logfd] });
  console.log(`launching ${APP} on DISPLAY=${DISPLAY} profile=${PROFILE} (log: ${LOG})`);

  let connected = false;
  for (let i = 0; i < 25; i++) { await sleep(1500); try { if ((await (await fetch("http://127.0.0.1:8788/health")).json()).extensionConnected) { connected = true; break; } } catch {} }
  console.log("extension connected:", connected);
  if (!connected) { console.log("(check", LOG, "for X/display errors)"); }
  else {
    console.log(`=== findStores ${SITE} ${ZIP} ===`);
    const fs = await rpc({ type: "findStores", site: SITE, zip: ZIP, radius: 20 });
    console.log("cached", fs.cached, "known", fs.storeCountKnown, "near", fs.stores && fs.stores.length);
    for (const s of (fs.stores || []).slice(0, 5)) console.log(`  ${s.distMi}mi #${s.num} ${s.label} ${s.zip}`);
    const id = (fs.stores && fs.stores[0] && fs.stores[0].num) || "";
    // find a live PDP via search unless one is provided
    let pdp = process.env.STORECHECK_PDP || "";
    const query = process.env.STORECHECK_QUERY;
    if (!pdp && query) {
      const searchUrl = get(SITE).searchUrl(query);
      console.log(`=== searchLinks ${SITE} "${query}" ===`);
      const sr = await rpc({ type: "searchLinks", url: searchUrl, pattern: PDP_PAT[SITE] || "." });
      pdp = (sr.links || [])[0] || "";
      console.log("picked PDP:", pdp || "(none found)");
    }
    if (!pdp) pdp = PDP;
    if (id && pdp) {
      console.log(`=== checkStore ${id} ===`);
      console.log(JSON.stringify(await rpc({ type: "checkStore", site: SITE, storeId: id, zip: ZIP, productUrl: pdp }), null, 2));
    }
  }
  if (KEEPOPEN) { console.log(`leaving browser open ${KEEPOPEN}ms...`); await sleep(KEEPOPEN); }
} catch (e) {
  console.error("selftest error:", String((e && e.stack) || e));
} finally {
  cleanup();
  await sleep(500);
  process.exit(0);
}
