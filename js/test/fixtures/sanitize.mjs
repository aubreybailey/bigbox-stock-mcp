#!/usr/bin/env node
/**
 * Sanitize the saved finder-HTML fixtures before committing: strip <script>/<style>
 * blocks (where third-party API keys/tokens from the scraped pages live) and redact
 * any residual secret-shaped strings. Parsers read DOM structure (links/attrs/text),
 * not script content, so store counts are unchanged — EXCEPT GameStop, whose store
 * coords live in a script, so we keep its scripts and rely on redaction there.
 *
 * Run after capturing a fixture:  node test/fixtures/sanitize.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const KEEP_SCRIPTS = new Set(["locate_gamestop_com.html"]); // coords are in a script

const SECRET = new RegExp(
  [
    "AIza[0-9A-Za-z_-]{35}",                                    // Google API key
    "eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}", // JWT
    "(?:pk|sk|rk)_(?:live|test)_[0-9A-Za-z]{12,}",              // Stripe
    "AKIA[0-9A-Z]{16}",                                         // AWS access key id
    "gh[pousr]_[0-9A-Za-z]{36,}",                               // GitHub token
    "xox[baprs]-[0-9A-Za-z-]{10,}",                             // Slack
  ].join("|"),
  "g",
);
const stripBlocks = (h) =>
  h.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");

let changed = 0;
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".html"))) {
  const before = readFileSync(`${DIR}/${f}`, "utf8");
  let after = KEEP_SCRIPTS.has(f) ? before : stripBlocks(before);
  after = after.replace(SECRET, "REDACTED");
  if (after !== before) { writeFileSync(`${DIR}/${f}`, after); changed++; }
  const leaks = (after.match(SECRET) || []).length;
  console.log(`${f.padEnd(28)} ${(before.length / 1024 | 0)}KB -> ${(after.length / 1024 | 0)}KB  secrets-left:${leaks}`);
}
console.log(`sanitized ${changed} file(s)`);
