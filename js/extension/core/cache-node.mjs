/**
 * Node filesystem storage adapter for the store cache (used by the bridge / tests).
 * Stores one JSON file per chain under ~/.storecheck/stores_js/ (kept separate
 * from the Python TSV cache so the two don't clobber each other).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = process.env.STORECHECK_STORES_JS || join(homedir(), ".storecheck", "stores_js");

export function nodeFsAdapter(dir = DIR) {
  mkdirSync(dir, { recursive: true });
  const file = (chain) => join(dir, `${chain}.json`);
  return {
    async load(chain) {
      const f = file(chain);
      if (!existsSync(f)) return null;
      try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
    },
    async save(chain, stores) {
      writeFileSync(file(chain), JSON.stringify(stores, null, 2));
    },
  };
}
