/**
 * Verdict classifier — ported from storecheck.py.
 *
 * Generic regexes run on user-visible text; per-domain hints (provided by the
 * caller from the retailer registry) run on raw HTML. Order matters:
 * blocked > discontinued > out-of-stock > available > inconclusive.
 */

export const BOTWALL = /(access denied|pardon our interruption|request unsuccessful|something went wrong|are you a human|verify you are|px-captcha|sec-if-cpt|protected by akamai|enable javascript and cookies|reference #\d|incident id|robot or human|press (?:and|&) hold|activate and hold|hold to (?:confirm|continue))/i;
export const DISCONTINUED = /(no longer (?:sold|available|carry)|item is discontinued|discontinued|we no longer offer)/i;
export const OUT_OF_STOCK = /(out of stock|sold out|currently unavailable|this item is unavailable|notify me when|back in stock|temporarily out of stock|not available)/i;
export const AVAILABLE = /(pick ?up today|free pickup|available for pickup|ready (?:within|in)\b|in stock at|pickup at|ship to store|in stock\b|add to cart)/i;

const PRICE_RE = /"price"\s*:\s*"?(\d{1,5}(?:\.\d{2})?)"?/;
const PRICE_TEXT_RE = /\$\s?(\d{1,4}(?:\.\d{2}))/;

/** Drop <script>/<style> bodies then tags, so machinery doesn't trip text regexes. */
export function visibleText(html) {
  return (html || "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

export function domainOf(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); }
  catch { host = String(url).toLowerCase(); }
  const parts = host.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : host;
}

export function extractPrice(textOrHtml) {
  const s = textOrHtml || "";
  let m = PRICE_RE.exec(s);
  if (m) return `$${m[1]}`;
  m = PRICE_TEXT_RE.exec(s);
  return m ? `$${m[1]}` : null;
}

function snip(src, idx) {
  return src.slice(Math.max(0, idx - 40), idx + 60).replace(/\s+/g, " ").trim().slice(0, 110);
}

/**
 * classify(url, text, html, hints) -> { verdict, snippet }
 * `hints` is the retailer's signalHints ({oos, avail, store} RegExp) or {}.
 * Generic regexes run on `text` (visible); hints run on raw `html`.
 */
export function classify(url, text, html = "", hints = {}) {
  const raw = html || "";
  let m;
  if ((m = BOTWALL.exec(text))) return { verdict: "blocked", snippet: snip(text, m.index) };
  if ((m = DISCONTINUED.exec(text))) return { verdict: "discontinued", snippet: snip(text, m.index) };
  if (hints.oos && (m = hints.oos.exec(raw))) return { verdict: "out_of_stock", snippet: snip(raw, m.index) };
  if ((m = OUT_OF_STOCK.exec(text))) return { verdict: "out_of_stock", snippet: snip(text, m.index) };
  if (hints.avail && (m = hints.avail.exec(raw))) return { verdict: "available", snippet: snip(raw, m.index) };
  if ((m = AVAILABLE.exec(text))) return { verdict: "available", snippet: snip(text, m.index) };
  return { verdict: "inconclusive", snippet: null };
}
