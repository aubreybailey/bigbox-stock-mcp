import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  {
    // extension code runs in the browser / web-extension context
    files: ["extension/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.webextensions, chrome: "readonly", browser: "readonly" },
    },
  },
  {
    // node code: bridge, MCP server, tests, configs, and the fs cache backend
    files: ["server/**/*.mjs", "test/**/*.mjs", "extension/core/cache-node.mjs", "extension/icons/make-icons.mjs", "*.{js,mjs}"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node } },
  },
  {
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-assignment": "off", // FP-prone with the botwall reload/poll loops
    },
  },
];
