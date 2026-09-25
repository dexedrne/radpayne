// Bakes room 1's tiling textures procedurally (no image generation, no source files) into
// public/textures/*.webp. Every texture tiles seamlessly (all noise and patterns wrap on the tile).
//   node tools/textures.ts            (needs ImageMagick's `magick` for the webp encode)
//
// Scale (the level materials use world-space UVs, so repeatCount = tiles per metre):
//   asphalt 4 m, sidewalk 3 m (2x2 slabs), facades 13.2 m (floors 3.3 m), tower 25.6 x 51.2 m
//   (3.2 m cells), shutter 1.28 m, puddles 18 m (a mask the street look samples, not a material).
// Facade rule the look relies on: lit windows are the only texels brighter than ~0.45 luminance
// (linear); the "lit <gain>" material rule turns exactly those into emissive light.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

type RGB = [number, number, number];

// ---------- PNG writer (RGB8) ----------
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(b: Buffer): number {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, px: Float32Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(px[y * w * 3 + x] * 255)));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- tileable noise ----------
function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (a: number, n: number) => ((a % n) + n) % n;
const sstep = (t: number) => t * t * (3 - 2 * t);
/** Value noise at tile coords (u, v in 0..1) with px x py lattice cells, wrapping on the tile. */
function vnoise(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px, y = v * py;
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = sstep(x - ix), fy = sstep(y - iy);
  const h = (i: number, j: number) => hash(mod(i, px), mod(j, py), seed);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(u: number, v: number, px: number, py: number, oct: number, seed: number): number {
  let s = 0, a = 0.5, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise(u, v, px << o, py << o, seed + o * 101);
    n += a;
    a *= 0.5;
  }
  return s / n;
}
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- canvas ----------
class Img {
  readonly px: Float32Array;
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Float32Array(w * h * 3);
  }
  /** (x, y) with y up from the bottom row (world-UV v grows upward). */
  set(x: number, y: number, c: RGB): void {
    const xi = mod(Math.floor(x), this.w), yi = this.h - 1 - mod(Math.floor(y), this.h);
    const i = (yi * this.w + xi) * 3;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2];
  }
  get(x: number, y: number): RGB {
    const xi = mod(Math.floor(x), this.w), yi = this.h - 1 - mod(Math.floor(y), this.h);
    const i = (yi * this.w + xi) * 3;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }
  each(f: (x: number, y: number, u: number, v: number) => RGB): void {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, f(x, y, x / this.w, y / this.h));
  }
  rect(x0: number, y0: number, w: number, h: number, f: (x: number, y: number, lx: number, ly: number) => RGB | null): void {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++)
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) {
        const c = f(x, y, (x - x0) / w, (y - y0) / h);
        if (c) this.set(x, y, c);
      }
  }
  /** A 1-3 px random-walk line (cracks, tags), wrapping. */
  walk(x: number, y: number, steps: number, width: number, r: () => number, paint: (old: RGB) => RGB): void {
    let a = r() * Math.PI * 2;
    for (let i = 0; i < steps; i++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a);
      y += Math.sin(a);
      for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) this.set(x + dx, y + dy, paint(this.get(x + dx, y + dy)));
    }
  }
}
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------- textures ----------
function asphalt(): Img {
  const S = 512, img = new Img(S, S), r = rng(11);
  img.each((x, y, u, v) => {
    let k = 0.15 + (fbm(u, v, 4, 4, 3, 1) - 0.5) * 0.07 + (fbm(u, v, 24, 24, 2, 2) - 0.5) * 0.05;
    const s = hash(x, y, 3);
    if (s < 0.07) k += 0.04 + 0.09 * hash(x, y, 4); // aggregate
    else if (s > 0.95) k -= 0.035;
    if (fbm(u, v, 3, 3, 3, 5) > 0.63) k *= 0.72; // tar patches
    return [k * 0.97, k * 0.99, k * 1.05];
  });
  for (let i = 0; i < 7; i++) img.walk(r() * S, r() * S, 120 + r() * 220, 1 + (r() < 0.3 ? 1 : 0), r, c => mul(c, 0.5));
  return img;
}

function sidewalk(): Img {
  const S = 512, img = new Img(S, S), r = rng(21);
  img.each((x, y, u, v) => {
    let k = 0.4 + (fbm(u, v, 3, 3, 3, 7) - 0.5) * 0.08 + (hash(x, y, 8) - 0.5) * 0.05;
    if (fbm(u, v, 5, 5, 3, 9) > 0.64) k *= 0.8; // stains
    const jx = Math.min(mod(x, S / 2), S / 2 - mod(x, S / 2)), jy = Math.min(mod(y, S / 2), S / 2 - mod(y, S / 2));
    if (Math.min(jx, jy) < 1.6) k = 0.19; // slab joints
    else if (Math.min(jx, jy) < 3) k *= 0.85;
    return [k, k * 0.985, k * 0.95];
  });
  for (let i = 0; i < 40; i++) {
    const cx = r() * S, cy = r() * S, rad = 1.5 + r() * 2.5; // gum
    img.rect(cx - rad, cy - rad, rad * 2, rad * 2, (_x, _y, lx, ly) => ((lx - 0.5) ** 2 + (ly - 0.5) ** 2 < 0.25 ? [0.22, 0.21, 0.21] : null));
  }
  return img;
}

type Win = { w: number; h: number; sill: number; panes: [number, number]; frame: RGB; lintel: RGB; lintelH: number; sillC: RGB };
type Lit = { p: number; colors: Array<[RGB, number]>; };

function pickColor(colors: Array<[RGB, number]>, t: number): RGB {
  let acc = 0;
  for (const [c, w] of colors) { acc += w; if (t <= acc) return c; }
  return colors[colors.length - 1][0];
}

/** A facade tile: `wall` paints the masonry, then B bays x 4 floors of windows (3.3 m floors). */
function facade(size: number, bays: number, seed: number, wall: (x: number, y: number, u: number, v: number) => RGB, win: Win, lit: Lit): Img {
  const img = new Img(size, size);
  const ppm = size / 13.2;
  const r = rng(seed);
  img.each(wall);
  const bw = size / bays, fh = size / 4;
  for (let f = 0; f < 4; f++)
    for (let b = 0; b < bays; b++) {
      const w = win.w * ppm, h = win.h * ppm;
      const x0 = b * bw + (bw - w) / 2, y0 = f * fh + win.sill * ppm;
      // lintel + sill (kept below the glow threshold)
      img.rect(x0 - 0.1 * ppm, y0 + h, w + 0.2 * ppm, win.lintelH * ppm, () => mul(win.lintel, 0.9 + 0.2 * r()));
      img.rect(x0 - 0.08 * ppm, y0 - 0.1 * ppm, w + 0.16 * ppm, 0.1 * ppm, () => win.sillC);
      const on = r() < lit.p;
      const col = pickColor(lit.colors, r());
      const bright = 0.78 + 0.22 * r();
      const blinds = r() < 0.3, curtains = r() < 0.35, half = r() < 0.2;
      const sheen = r();
      img.rect(x0, y0, w, h, (x, y, lx, ly) => {
        const fr = 2.2;
        if (x - x0 < fr || x0 + w - x < fr || y - y0 < fr || y0 + h - y < fr) return win.frame;
        // mullions
        const [pc, pr] = win.panes;
        for (let i = 1; i < pc; i++) if (Math.abs(lx - i / pc) * w < 1.1) return win.frame;
        for (let i = 1; i < pr; i++) if (Math.abs(ly - i / pr) * h < 1.1) return win.frame;
        if (on && !(half && ly < 0.5)) {
          let c = mul(col, bright * (0.8 + 0.2 * ly));
          if (blinds && mod(y, 5) < 1.4) c = mul(c, 0.72);
          if (curtains && (lx < 0.2 || lx > 0.8)) c = mul(c, 0.5);
          return c;
        }
        const g = 0.035 + 0.035 * Math.max(0, Math.sin((lx + ly + sheen) * 3.1));
        return [g * 0.85, g, g * 1.45];
      });
    }
  return img;
}

function brickWall(size: number, seed: number, base: RGB, varK: number, mortar: RGB, grime: number): (x: number, y: number, u: number, v: number) => RGB {
  const courses = size / 8, per = 40, bw = size / per, ch = 8;
  return (x, y, u, v) => {
    const c = Math.floor(y / ch);
    const off = (c % 2) * bw / 2;
    const bi = mod(Math.floor((x + off) / bw), per);
    const bx = mod(x + off, bw), by = mod(y, ch);
    const g = 1 - grime * fbm(u, v, 6, 2, 3, seed + 9); // soot streaks (stretched vertically)
    if (bx < 1.4 || by < 1.4) return mul(mortar, g * (0.9 + 0.2 * hash(x, y, seed)));
    const k = (1 + varK * (hash(bi, mod(c, courses), seed) - 0.5)) * (0.92 + 0.16 * hash(x, y, seed + 1)) * g;
    return mul(base, k);
  };
}

function ashlarWall(size: number, seed: number, base: RGB, varK: number): (x: number, y: number, u: number, v: number) => RGB {
  const ch = 32, courses = size / ch;
  const cuts: number[][] = [];
  const r = rng(seed);
  for (let c = 0; c < courses; c++) {
    const cs: number[] = [];
    let x = r() * 60;
    while (x < size) { cs.push(x); x += 60 + r() * 60; }
    cuts.push(cs);
  }
  return (x, y, u, v) => {
    const c = Math.floor(y / ch) % courses;
    const by = mod(y, ch);
    const cs = cuts[c];
    let joint = by < 1.5;
    let bi = 0;
    for (let i = 0; i < cs.length; i++) { if (Math.abs(x - cs[i]) < 1.2) joint = true; if (x >= cs[i]) bi = i + 1; }
    const w = fbm(u, v, 8, 8, 3, seed + 3);
    if (joint) return mul(base, 0.55);
    const k = (1 + varK * (hash(bi, c, seed) - 0.5)) * (0.85 + 0.3 * w) * (0.95 + 0.1 * hash(x, y, seed + 2));
    return mul(base, k);
  };
}

function tower(): Img {
  const S = 512, img = new Img(S, S), r = rng(51);
  const cols = 8, rows = 16, cw = S / cols, rh = S / rows;
  const rowP = Array.from({ length: rows }, () => (r() < 0.25 ? 0.75 : 0.08 + r() * 0.35));
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const on = r() < rowP[j];
      const col: RGB = r() < 0.6 ? [0.88, 0.93, 1.0] : [1.0, 0.84, 0.6];
      const b = 0.55 + 0.45 * r();
      img.rect(i * cw, j * rh, cw, rh, (_x, _y, lx, ly) => {
        if (ly < 0.2) return [0.02, 0.022, 0.03]; // spandrel
        if (lx < 0.05 || lx > 0.95) return [0.03, 0.032, 0.04]; // mullions
        if (on) return mul(col, b * (0.85 + 0.15 * ly));
        const g = 0.03 + 0.02 * ly;
        return [g * 0.9, g, g * 1.5];
      });
    }
  return img;
}

function shutter(): Img {
  const S = 256, img = new Img(S, S), r = rng(61);
  img.each((x, y, u, v) => {
    const rib = 0.5 + 0.5 * Math.sin((y / 8) * Math.PI * 2);
    let k = 0.2 + 0.12 * rib;
    k *= 0.8 + 0.35 * fbm(u, v, 4, 8, 3, 62);
    return [k, k * 1.01, k * 1.04];
  });
  const tags: RGB[] = [[0.75, 0.12, 0.45], [0.1, 0.55, 0.62], [0.55, 0.62, 0.12]];
  for (let i = 0; i < 3; i++) {
    const c = tags[i];
    img.walk(r() * S, r() * S, 140, 3, r, () => c);
  }
  return img;
}

function puddles(): Img {
  const S = 256, img = new Img(S, S);
  img.each((_x, _y, u, v) => {
    const n = fbm(u, v, 3, 3, 5, 71) * 0.75 + fbm(u, v, 9, 9, 2, 72) * 0.25;
    const k = Math.max(0, Math.min(1, (n - 0.3) / 0.4));
    return [k, k, k];
  });
  return img;
}

// ---------- write ----------
const outDir = path.resolve(import.meta.dirname, "..", "public", "textures");
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rp-tex-"));
function save(name: string, img: Img, quality = 82): void {
  const p = path.join(tmp, `${name}.png`);
  fs.writeFileSync(p, png(img.w, img.h, img.px));
  const out = path.join(outDir, `${name}.webp`);
  execFileSync("magick", [p, "-quality", String(quality), "-define", "webp:method=6", out]);
  console.log(`${name}.webp ${img.w}x${img.h} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

const warm: RGB = [1.0, 0.79, 0.46], warmWhite: RGB = [1.0, 0.9, 0.72], tv: RGB = [0.58, 0.72, 1.0], pinkRoom: RGB = [1.0, 0.45, 0.78];
const homeLights: Lit = { p: 0.4, colors: [[warm, 0.55], [warmWhite, 0.27], [tv, 0.13], [pinkRoom, 0.05]] };

save("asphalt", asphalt());
save("sidewalk", sidewalk());
save("facade-brick", facade(1024, 4, 31,
  brickWall(1024, 31, [0.42, 0.2, 0.15], 0.35, [0.3, 0.28, 0.26], 0.45),
  { w: 1.15, h: 1.75, sill: 0.85, panes: [1, 2], frame: [0.07, 0.07, 0.08], lintel: [0.36, 0.33, 0.3], lintelH: 0.2, sillC: [0.33, 0.31, 0.28] },
  homeLights));
save("facade-brownstone", facade(1024, 6, 41,
  ashlarWall(1024, 41, [0.34, 0.23, 0.17], 0.18),
  { w: 0.95, h: 1.85, sill: 0.8, panes: [2, 2], frame: [0.1, 0.07, 0.06], lintel: [0.27, 0.18, 0.14], lintelH: 0.32, sillC: [0.3, 0.2, 0.15] },
  homeLights));
save("facade-club", facade(1024, 4, 91,
  brickWall(1024, 91, [0.24, 0.13, 0.11], 0.3, [0.17, 0.16, 0.16], 0.6),
  { w: 1.9, h: 2.1, sill: 0.7, panes: [4, 3], frame: [0.05, 0.05, 0.06], lintel: [0.2, 0.19, 0.18], lintelH: 0.18, sillC: [0.2, 0.19, 0.18] },
  { p: 0.3, colors: [[[1.0, 0.25, 0.75], 0.5], [[0.72, 0.35, 1.0], 0.3], [[0.25, 0.95, 1.0], 0.2]] }));
save("tower", tower());
save("shutter", shutter());
save("puddles", puddles(), 90);
fs.rmSync(tmp, { recursive: true, force: true });
