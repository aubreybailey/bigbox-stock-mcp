#!/usr/bin/env node
/**
 * Debug DOM capture (dev): spawns bridge + flatpak Chromium + extension, navigates
 * to STORECHECK_URL (optionally pinning a store), writes the rendered text/HTML to
 * STORECHECK_OUT for inspection. Env mirrors selftest-browser.mjs.
 *
 *   STORECHECK_URL=... STORECHECK_OUT=/tmp/x.txt [STORECHECK_KIND=html] \
 *   [STORECHECK_SITE=bestbuy.com STORECHECK_STOREID=2506 STORECHECK_ZIP=01545] \
 *   node test/dumpdom.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { openSync, writeFileSync, rmSync } from "node:fs";

const APP = "io.github.ungoogled_software.ungoogled_chromium";
const JS = "/home/aubreybailey/Downloads/grill/js";
const EXT = `${JS}/extension`;
const DISPLAY = process.env.STORECHECK_DISPLAY || ":99";
const XAUTH = process.env.STORECHECK_XAUTH || "";
const PROFILE = process.env.STORECHECK_PROFILE || "/tmp/sc_selftest";
const URL = process.env.STORECHECK_URL;
const OUT = process.env.STORECHECK_OUT || "/tmp/sc_dom.txt";
const KIND = process.env.STORECHECK_KIND || "text";
const SITE = process.env.STORECHECK_SITE, STOREID = process.env.STORECHECK_STOREID, ZIP = process.env.STORECHECK_ZIP;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kids = [];
const spawnP = (c, a, o = {}) => { const p = spawn(c, a, { stdio: "ignore", ...o }); kids.push(p); return p; };
function cleanup() { for (const p of kids) { try { p.kill("SIGKILL"); } catch {} } spawnSync("pkill", ["-9", "-f", PROFILE]); if (DISPLAY === ":99") spawnSync("pkill", ["-9", "-f", "Xvfb :99"]); }
const rpc = async (cmd) => (await fetch("http://127.0.0.1:8788/rpc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cmd) })).json();

try {
  if (!URL) throw new Error("set STORECHECK_URL");
  rmSync(PROFILE, { recursive: true, force: true });   // fresh profile: avoid a cached/stale SW
  spawnP("node", ["server/bridge.mjs"], { cwd: JS, env: process.env });
  if (DISPLAY === ":99") { spawnP("/usr/bin/Xvfb", [":99", "-screen", "0", "1366x900x24", "-nolisten", "tcp", "-ac"]); await sleep(2000); }
  const env = { ...process.env, DISPLAY }; if (XAUTH) env.XAUTHORITY = XAUTH;
  const args = ["run", "--share=network", APP, "--no-first-run", "--no-default-browser-check", "--disable-gpu", `--user-data-dir=${PROFILE}`, `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`, "about:blank"];
  if (XAUTH) args.splice(2, 0, `--env=XAUTHORITY=${XAUTH}`);
  spawnP("flatpak", args, { env, stdio: ["ignore", openSync("/tmp/sc_chrome.log", "w"), openSync("/tmp/sc_chrome.log", "a")] });

  let connected = false;
  for (let i = 0; i < 25; i++) { await sleep(1500); try { if ((await (await fetch("http://127.0.0.1:8788/health")).json()).extensionConnected) { connected = true; break; } } catch {} }
  if (!connected) { console.log("extension not connected (see /tmp/sc_chrome.log)"); }
  else {
    const r = await rpc({ type: "dumpDom", url: URL, kind: KIND, site: SITE, storeId: STOREID, zip: ZIP, cookies: process.env.STORECHECK_COOKIES, max: process.env.STORECHECK_MAX ? Number(process.env.STORECHECK_MAX) : undefined });
    writeFileSync(OUT, r.body || "");
    console.log(`wrote ${OUT}  len=${r.len}`);
  }
} catch (e) { console.error("dumpdom error:", String((e && e.stack) || e)); }
finally { cleanup(); await sleep(500); process.exit(0); }
