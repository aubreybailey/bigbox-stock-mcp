#!/usr/bin/env node
/**
 * Spike/Phase-C test trigger: POST an RPC command to the bridge and print the
 * extension's reply. Stands in for the MCP tool while validating the loop.
 *
 *   node server/test-client.mjs findStores  site=target.com zip=01545
 *   node server/test-client.mjs checkStore  site=target.com storeId=1348 zip=01545 productUrl=https://www.target.com/p/-/A-53402416
 *   node server/test-client.mjs checkProduct url=https://www.target.com/p/-/A-53402416
 */
const [, , type, ...rest] = process.argv;
if (!type) { console.error("usage: test-client.mjs <type> key=value ..."); process.exit(1); }
const cmd = { type };
for (const kv of rest) { const i = kv.indexOf("="); cmd[kv.slice(0, i)] = kv.slice(i + 1); }

const r = await fetch("http://127.0.0.1:8788/rpc", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(cmd),
}).catch((e) => { console.error("bridge not reachable on :8788 —", String(e.message || e)); process.exit(1); });

console.log(JSON.stringify(await r.json(), null, 2));
