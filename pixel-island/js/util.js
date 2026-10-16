'use strict';
// ───────────── 共用小工具 ─────────────

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const angleDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

function weightedPick(list) {
  let total = 0;
  for (const it of list) total += it.w;
  let r = Math.random() * total;
  for (const it of list) { r -= it.w; if (r <= 0) return it; }
  return list[list.length - 1];
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 平滑數值噪聲（value noise）
function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const SIZE = 256;
  const vals = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < vals.length; i++) vals[i] = rnd();
  const f = (t) => t * t * (3 - 2 * t);
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = f(x - xi), yf = f(y - yi);
    const x0 = xi & 255, y0 = yi & 255, x1 = (x0 + 1) & 255, y1 = (y0 + 1) & 255;
    const a = vals[y0 * SIZE + x0], b = vals[y0 * SIZE + x1];
    const c = vals[y1 * SIZE + x0], d = vals[y1 * SIZE + x1];
    return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
  };
}
function fbm(noise, x, y, oct = 3) {
  let v = 0, amp = 0.5, fr = 1, norm = 0;
  for (let i = 0; i < oct; i++) { v += noise(x * fr, y * fr) * amp; norm += amp; amp *= 0.5; fr *= 2; }
  return v / norm;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
// 打包成 Uint32（little-endian ABGR）
function pack(r, g, b, a = 255) { return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0; }
const _packCache = {};
function packHex(hex) {
  if (_packCache[hex] === undefined) { const [r, g, b] = hexToRgb(hex); _packCache[hex] = pack(r, g, b); }
  return _packCache[hex];
}
function packShade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  return pack(clamp(Math.round(r * f), 0, 255), clamp(Math.round(g * f), 0, 255), clamp(Math.round(b * f), 0, 255));
}
function mixPacked(c1, c2, t) {
  const r = lerp(c1 & 255, c2 & 255, t), g = lerp((c1 >>> 8) & 255, (c2 >>> 8) & 255, t), b = lerp((c1 >>> 16) & 255, (c2 >>> 16) & 255, t);
  return pack(Math.round(r), Math.round(g), Math.round(b));
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function distToPolyline(px, py, pts) {
  let m = Infinity;
  for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, distToSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return m;
}

// localStorage 可能被封鎖，所有讀寫都包在 try/catch
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('pixel-isle:' + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('pixel-isle:' + key, JSON.stringify(value)); } catch (e) { /* 忽略 */ }
  },
};
