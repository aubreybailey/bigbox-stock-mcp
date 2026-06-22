#!/usr/bin/env node
/**
 * Generate the extension's PNG icons (no image deps): a rounded-rect badge with a
 * checkmark, 4x supersampled for smooth edges. Run: `node extension/icons/make-icons.mjs`.
 * Replace with real artwork before a public store listing if you like.
 */
import zlib from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const BG = [31, 111, 235]; // #1f6feb

const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function png(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; // RGBA/8
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function render(size) {
  const ss = 4, W = size * ss, big = new Uint8ClampedArray(W * W * 4);
  const margin = W * 0.06, r = W * 0.22, x0 = margin, y0 = margin, x1 = W - margin, y1 = W - margin;
  const inRR = (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const P = [[0.28, 0.53], [0.44, 0.69], [0.74, 0.33]].map(([a, b]) => [a * W, b * W]);
  const hw = W * 0.08;
  const distSeg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const onCheck = (x, y) => distSeg(x, y, ...P[0], ...P[1]) <= hw || distSeg(x, y, ...P[1], ...P[2]) <= hw;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, cx = x + 0.5, cy = y + 0.5;
    if (!inRR(cx, cy)) { big[i + 3] = 0; continue; }
    const c = onCheck(cx, cy) ? [255, 255, 255] : BG;
    big[i] = c[0]; big[i + 1] = c[1]; big[i + 2] = c[2]; big[i + 3] = 255;
  }
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let R = 0, G = 0, B = 0, A = 0;
    for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) {
      const i = ((y * ss + dy) * W + (x * ss + dx)) * 4, a = big[i + 3];
      R += big[i] * a; G += big[i + 1] * a; B += big[i + 2] * a; A += a;
    }
    const oi = (y * size + x) * 4, n = ss * ss;
    out[oi + 3] = A / n;
    if (A > 0) { out[oi] = R / A; out[oi + 1] = G / A; out[oi + 2] = B / A; }
  }
  return out;
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(`${DIR}/icon-${size}.png`, png(size, render(size)));
  console.log(`wrote icon-${size}.png`);
}
