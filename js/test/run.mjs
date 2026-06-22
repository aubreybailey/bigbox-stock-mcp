#!/usr/bin/env node
/**
 * Generic RPC runner (dev): spawns bridge + flatpak Chromium + extension, waits
 * for the SW, sends one RPC (STORECHECK_CMD = JSON), prints the result. Optionally
 * writes result.body/.urls to STORECHECK_OUT. Fresh profile each run.
 *
 *   STORECHECK_CMD='{"type":"netLog","url":"https://www.cvs.com/store-locator/cvs-pharmacy-locations?searchText=01545","pattern":"json|api|locat|store"}' node test/run.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { openSync, writeFileSync, rmSync } from "node:fs";

const APP = "io.github.ungoogled_software.ungoogled_chromium";
const JS = "/home/aubreybailey/Downloads/grill/js";
const EXT = `${JS}/extension`;
const DISPLAY = process.env.STORECHECK_DISPLAY || ":99";
const PROFILE = process.env.STORECHECK_PROFILE || "/tmp/sc_run";
const OUT = process.env.STORECHECK_OUT;
const CMD = JSON.parse(process.env.STORECHECK_CMD || "{}");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kids = [];
const spawnP = (c, a, o = {}) => { const p = spawn(c, a, { stdio: "ignore", ...o }); kids.push(p); return p; };
function cleanup() { for (const p of kids) { try { p.kill("SIGKILL"); } catch {} } spawnSync("pkill", ["-9", "-f", PROFILE]); if (DISPLAY === ":99") spawnSync("pkill", ["-9", "-f", "Xvfb :99"]); }
const rpc = async (cmd) => (await fetch("http://127.0.0.1:8788/rpc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cmd) })).json();

try {
  if (!CMD.type) throw new Error("set STORECHECK_CMD='{\"type\":...}'");
  rmSync(PROFILE, { recursive: true, force: true });
  spawnP("node", ["server/bridge.mjs"], { cwd: JS, env: process.env });
  if (DISPLAY === ":99") { spawnP("/usr/bin/Xvfb", [":99", "-screen", "0", "1366x900x24", "-nolisten", "tcp", "-ac"]); await sleep(2000); }
  spawnP("flatpak", ["run", "--share=network", APP, "--no-first-run", "--no-default-browser-check", "--disable-gpu", `--user-data-dir=${PROFILE}`, `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`, "about:blank"], { env: { ...process.env, DISPLAY }, stdio: ["ignore", openSync("/tmp/sc_chrome.log", "w"), openSync("/tmp/sc_chrome.log", "a")] });
  let connected = false;
  for (let i = 0; i < 25; i++) { await sleep(1500); try { if ((await (await fetch("http://127.0.0.1:8788/health")).json()).extensionConnected) { connected = true; break; } } catch {} }
  if (!connected) { console.log("extension not connected (see /tmp/sc_chrome.log)"); }
  else {
    if (process.env.STORECHECK_CMD1) { const w = await rpc(JSON.parse(process.env.STORECHECK_CMD1)); console.log("warm:", JSON.stringify(w).slice(0, 200)); }
    const r = await rpc(CMD);
    if (OUT && (r.body || r.urls)) writeFileSync(OUT, r.body != null ? r.body : JSON.stringify(r.urls, null, 2));
    const preview = { ...r }; if (preview.body) preview.body = `<${preview.len} chars -> ${OUT || "(not saved)"}>`;
    console.log(JSON.stringify(preview, null, 2).slice(0, 4000));
  }
} catch (e) { console.error("run error:", String((e && e.stack) || e)); }
finally { cleanup(); await sleep(500); process.exit(0); }
