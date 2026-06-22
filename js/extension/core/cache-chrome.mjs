/**
 * Extension storage backend for the store cache (Chrome/Edge + Firefox).
 * Mirrors cache-node.mjs's adapter shape: load(chain)->array|null, save(chain, array).
 */
const api = globalThis.browser ?? globalThis.chrome;

export function chromeStorageAdapter() {
  return {
    async load(chain) {
      const key = `stores:${chain}`;
      const obj = await api.storage.local.get(key);
      return obj[key] || null;
    },
    async save(chain, stores) {
      await api.storage.local.set({ [`stores:${chain}`]: stores });
    },
  };
}
