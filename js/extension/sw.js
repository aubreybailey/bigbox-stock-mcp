/**
 * storecheck extension service worker (Phase C).
 *
 * Drives the user's REAL browser to answer the three layers, reusing the ported
 * core (registry + per-chain parse/cookies/pickup logic):
 *   findStores(site, zip)        -> navigate the finder, parseStores, cache, rank
 *   checkStore(site, url, id)    -> pin the store via api.cookies, read pickup
 *   checkProduct(url)            -> generic verdict for one PDP
 *
 * Running in real Chrome (real IP/fingerprint/cookies/logins, human can solve a
 * challenge) is what beats the bot walls and IP-geo limits the headless engine hit.
 */
import { get } from "./core/registry.mjs";
import { storesNear } from "./core/cache.mjs";
import { chromeStorageAdapter } from "./core/cache-chrome.mjs";
import { geocodeZip } from "./core/geo.mjs";
import { BOTWALL, classify, visibleText } from "./core/classify.mjs";

// Cross-browser: Firefox exposes promise-based `browser.*`; Chrome/Edge expose
// promise-based `chrome.*` (MV3). Aliasing lets the same code run in both.
const api = globalThis.browser ?? globalThis.chrome;

const WS_URL = "ws://127.0.0.1:8787";
let ws = null;

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => log("bridge connected");
  ws.onclose = () => { ws = null; setTimeout(connect, 2000); };
  ws.onerror = () => { try { ws.close(); } catch {} };
  ws.onmessage = async (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const handler = HANDLERS[msg.type];
    if (!handler) return;
    try { reply({ id: msg.id, ok: true, result: await handler(msg) }); }
    catch (e) { reply({ id: msg.id, ok: false, error: String((e && e.message) || e) }); }
  };
}
function reply(o) { try { ws && ws.send(JSON.stringify(o)); } catch {} }
function log(...a) { console.log("[storecheck]", ...a); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── tab helpers ────────────────────────────────────────────────────────────────
function waitForComplete(tabId, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { api.tabs.onUpdated.removeListener(l); resolve(); }, timeoutMs);
    function l(id, info) { if (id === tabId && info.status === "complete") { clearTimeout(t); api.tabs.onUpdated.removeListener(l); resolve(); } }
    api.tabs.onUpdated.addListener(l);
  });
}
async function readText(tabId) {
  try {
    const [{ result } = {}] = await api.scripting.executeScript({ target: { tabId }, func: () => (document.body ? document.body.innerText : "") });
    return result || "";
  } catch { return ""; }
}
async function readHtml(tabId) {
  try {
    const [{ result } = {}] = await api.scripting.executeScript({ target: { tabId }, func: () => document.documentElement.outerHTML });
    return result || "";
  } catch { return ""; }
}
async function reload(tabId) { await api.tabs.reload(tabId); await waitForComplete(tabId); }

// ── store pinning via real cookies ───────────────────────────────────────────────
function cookieUrl(domain) {
  const d = (domain || "").replace(/^\./, "").replace(/^www\./, "");
  return `https://www.${d}/`;
}
async function setCookies(cookies) {
  for (const c of cookies || []) {
    try { await api.cookies.set({ url: cookieUrl(c.domain), name: c.name, value: c.value, domain: c.domain, path: c.path || "/" }); }
    catch (e) { log("cookie set failed", c.name, String(e)); }
  }
}

// ── layer 2: stores near me ─────────────────────────────────────────────────────
async function findStores({ site, zip, radius = 30, refresh = false }) {
  const r = get(site);
  const adapter = chromeStorageAdapter();
  const fetchHtml = async (url) => {
    const tab = await api.tabs.create({ url, active: true });
    try {
      await waitForComplete(tab.id);
      await sleep(3000);
      let html = await readHtml(tab.id);
      for (let i = 0; i < 3 && BOTWALL.test(visibleText(html)); i++) { await sleep(6000); await reload(tab.id); await sleep(3000); html = await readHtml(tab.id); }
      return html;
    } finally { try { await api.tabs.remove(tab.id); } catch {} }
  };
  return await storesNear(site, zip, radius, { adapter, fetchHtml, refresh });
}

// ── layer 3: in stock at this store ──────────────────────────────────────────────
async function checkStore({ site, productUrl, storeId, zip }) {
  const r = get(site);
  if (!r.storeStock || !r.pickupHints || !r.pickupHints.avail)
    return { site: r.domain, storeId, pickup: "not_implemented", note: `per-store stock not wired for ${r.domain}` };

  const adapter = chromeStorageAdapter();
  const cached = (await adapter.load(r.domain)) || [];
  const rec = cached.find((s) => String(s.num) === String(storeId)) || null;
  const effZip = zip || (rec && rec.zip) || "";
  const g = effZip ? await geocodeZip(effZip) : null;
  const geo = g ? { lat: g.lat, lng: g.lng } : null;

  await setCookies(r.storeCookies(effZip, storeId, rec, geo));

  const { avail, oos, store: storeRe, ready: readyRe } = r.pickupHints;
  const tab = await api.tabs.create({ url: productUrl, active: true });
  let text = "";
  try {
    await waitForComplete(tab.id);
    await sleep(3000);
    text = await readText(tab.id);
    for (let i = 0; i < 4 && BOTWALL.test(text); i++) { await sleep(6000); await reload(tab.id); await sleep(6000); text = await readText(tab.id); }
    for (let i = 0; i < 12; i++) { if (avail.test(text) || oos.test(text) || BOTWALL.test(text)) break; await sleep(2000); text = await readText(tab.id); }
  } finally { try { await api.tabs.remove(tab.id); } catch {} }

  const t = text.replace(/\s+/g, " ");
  const verdict = BOTWALL.test(t) ? "blocked" : avail.test(t) ? "available" : oos.test(t) ? "out_of_stock" : "inconclusive";
  const sm = storeRe ? storeRe.exec(t) : null;
  const store = sm ? (sm.slice(1).find((x) => x) || null) : null;
  const rm = readyRe ? readyRe.exec(t) : null;
  const m = avail.exec(t) || oos.exec(t);
  const snippet = m ? `...${t.slice(Math.max(0, m.index - 15), m.index + 75).trim()}...` : null;
  return { site: r.domain, storeId: String(storeId), store, pickup: verdict, readyBy: rm ? rm[1] : null, snippet, productUrl };
}

// ── layer 3 (generic, no store pin) ──────────────────────────────────────────────
async function checkProduct({ url }) {
  const r = get(url);
  const tab = await api.tabs.create({ url, active: true });
  let html = "";
  try {
    await waitForComplete(tab.id);
    await sleep(3000);
    html = await readHtml(tab.id);
    for (let i = 0; i < 3 && BOTWALL.test(visibleText(html)); i++) { await sleep(6000); await reload(tab.id); await sleep(3000); html = await readHtml(tab.id); }
  } finally { try { await api.tabs.remove(tab.id); } catch {} }
  const { verdict, snippet } = classify(url, visibleText(html), html, r.signalHints || {});
  return { url, verdict, snippet };
}

// ── search: collect candidate product links from a chain's search page ───────────
async function searchLinks({ url, pattern, limit = 10 }) {
  const re = new RegExp(pattern || ".", "i");
  const tab = await api.tabs.create({ url, active: true });
  try {
    await waitForComplete(tab.id);
    await sleep(3500);
    let links = [];
    for (let i = 0; i < 6; i++) {
      const [{ result } = {}] = await api.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => [...document.querySelectorAll("a[href]")].map((a) => a.href),
      });
      links = [...new Set((result || []).filter((h) => re.test(h)))];
      if (links.length) break;
      await sleep(2000);
    }
    return { links: links.slice(0, limit) };
  } finally { try { await api.tabs.remove(tab.id); } catch {} }
}

// ── debug: capture the live rendered DOM (optionally with a store pinned) ─────────
async function dumpDom({ url, kind = "text", settle = 4000, tries = 8, interval = 1500, site, storeId, zip, cookies, max = 400000 }) {
  if (cookies) await setCookies(typeof cookies === "string" ? JSON.parse(cookies) : cookies);
  if (site && storeId) {
    const r = get(site);
    const cached = (await chromeStorageAdapter().load(r.domain)) || [];
    const rec = cached.find((s) => String(s.num) === String(storeId)) || null;
    const effZip = zip || (rec && rec.zip) || "";
    const g = effZip ? await geocodeZip(effZip) : null;
    await setCookies(r.storeCookies(effZip, storeId, rec, g ? { lat: g.lat, lng: g.lng } : null));
  }
  const tab = await api.tabs.create({ url, active: true });
  try {
    await waitForComplete(tab.id);
    await sleep(settle);
    let out = "";
    for (let i = 0; i < tries; i++) { out = kind === "html" ? await readHtml(tab.id) : await readText(tab.id); await sleep(interval); }
    return { len: out.length, body: out.slice(0, max) };
  } finally { try { await api.tabs.remove(tab.id); } catch {} }
}

// ── debug: list the network resources a page loads (to find an XHR/API endpoint) ─
async function netLog({ url, settle = 7000, pattern }) {
  const tab = await api.tabs.create({ url, active: true });
  try {
    await waitForComplete(tab.id);
    await sleep(settle);
    const [{ result } = {}] = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => performance.getEntriesByType("resource").map((e) => e.name),
    });
    let urls = [...new Set(result || [])];
    if (pattern) { const re = new RegExp(pattern, "i"); urls = urls.filter((u) => re.test(u)); }
    return { count: urls.length, urls: urls.slice(0, 200) };
  } finally { try { await api.tabs.remove(tab.id); } catch {} }
}

// ── debug: fetch a URL from the SW (host_permission → no CORS) ────────────────────
async function fetchJson({ url, max = 400000 }) {
  try {
    const r = await fetch(url, { credentials: "include" });
    const body = await r.text();
    return { status: r.status, len: body.length, body: body.slice(0, max) };
  } catch (e) { return { error: String((e && e.message) || e) }; }
}

const HANDLERS = { findStores, checkStore, checkProduct, searchLinks, dumpDom, netLog, fetchJson };

connect();
setInterval(() => { if (!ws || ws.readyState !== WebSocket.OPEN) connect(); }, 20000);
