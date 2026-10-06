// Derive the level sets' OpenGL normals and roughness from their shipped tiling albedos.
// Needs ImageMagick (as mobile-assets.ts does). No downloaded art or Python dependencies.
// npm run pbr-maps [-- --set=backrooms/wall_cinderblock] [--check] [--preview=<outside-public-directory>]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PBR_SURFACES, pbrProfile, type PbrProfile } from "../src/app/look/pbrProfiles.ts";

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
/** Separable box convolution on a torus. Sliding sums keep each pass linear in pixel count. */
export function wrapBlur(a: Float32Array, w: number, h: number, rx: number, ry = rx): Float32Array {
  rx = Math.min(Math.floor(rx), Math.floor((w - 1) / 2)); ry = Math.min(Math.floor(ry), Math.floor((h - 1) / 2));
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    let sum = 0; const row = y * w, n = 2 * rx + 1;
    for (let i = -rx; i <= rx; i++) sum += a[row + (i + w) % w];
    for (let x = 0; x < w; x++) { tmp[row + x] = sum / n; sum += a[row + (x + rx + 1) % w] - a[row + (x - rx + w) % w]; }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0; const n = 2 * ry + 1;
    for (let i = -ry; i <= ry; i++) sum += tmp[((i + h) % h) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = sum / n; sum += tmp[((y + ry + 1) % h) * w + x] - tmp[((y - ry + h) % h) * w + x]; }
  }
  return out;
}
/** Three boxes approximate a Gaussian without adding a nonperiodic/clamped border. */
function blur(a: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius * Math.min(w, h) / 1024));
  return wrapBlur(wrapBlur(wrapBlur(a, w, h, r), w, h, r), w, h, r);
}
/** A narrow, smooth collar removes any baked illumination mismatch at the source's opposite edges.
 *  Two flat endpoint pixels give the height a matching derivative too. */
export function closeEdges(a: Float32Array, w: number, h: number): Float32Array {
  const out = a.slice(), width = Math.max(3, Math.round(Math.min(w, h) / 128));
  for (const axis of [0, 1]) {
    const n = axis === 0 ? w : h, rows = axis === 0 ? h : w;
    for (let j = 0; j < rows; j++) {
      const index = (i: number) => axis === 0 ? j * w + i : i * w + j;
      const edge = (out[index(0)] + out[index(1)] + out[index(n - 1)] + out[index(n - 2)]) / 4;
      for (let i = 0; i < Math.min(width, n / 2); i++) {
        const x = clamp((i - 1) / Math.max(1, width - 2)), k = 1 - x * x * (3 - 2 * x);
        for (const v of [i, n - 1 - i]) out[index(v)] = out[index(v)] * (1 - k) + edge * k;
      }
    }
  }
  return out;
}
function contrast(a: Float32Array, floor = 0.02): number {
  // A small deterministic histogram instead of sorting a million samples.
  const hist = new Uint32Array(1024);
  for (const v of a) hist[Math.min(1023, Math.floor(Math.abs(v) * 1023))]++;
  let n = 0; for (let i = 0; i < hist.length; i++) { n += hist[i]; if (n >= a.length * 0.97) return Math.max(floor, i / 1023); }
  return 1;
}
export type PbrFields = { height: Float32Array; roughness: Float32Array };
export function estimatePbr(rgb: Uint8Array, w: number, h: number, p: PbrProfile): PbrFields {
  if (rgb.length !== w * h * 3) throw new Error("Expected RGB pixels");
  const lum = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i++) lum[i] = (rgb[i * 3] * 0.2126 + rgb[i * 3 + 1] * 0.7152 + rgb[i * 3 + 2] * 0.0722) / 255;
  const smooth = blur(lum, w, h, 1), broad = blur(lum, w, h, 12), macro = blur(lum, w, h, 36);
  const hp = smooth.map((v, i) => v - broad[i]);
  const fineScale = contrast(hp), macroScale = contrast(smooth.map((v, i) => v - macro[i]), 0.04);
  // Coherent light OR dark lines can be mortar/grout. Reject the low frequencies of tile colours,
  // illumination and painted stains; very little fine texture becomes relief on fabric or plaster.
  const sx = Math.max(1, Math.round(w / 1024)), sy = Math.max(1, Math.round(h / 1024));
  const horiz = wrapBlur(hp, w, h, 9 * sx, sy), vert = wrapBlur(hp, w, h, sx, 9 * sy);
  const seam = hp.map((_, i) => Math.max(Math.abs(horiz[i]), Math.abs(vert[i])));
  const seamScale = contrast(seam, 0.035);
  const height = new Float32Array(lum.length), rough = new Float32Array(lum.length);
  const wetLum = blur(lum, w, h, 18), avg = lum.reduce((a, b) => a + b, 0) / lum.length;
  for (let i = 0; i < height.length; i++) {
    const fine = clamp(hp[i] / fineScale, -1, 1), coarse = clamp((smooth[i] - macro[i]) / macroScale, -1, 1);
    const joint = clamp((seam[i] / seamScale - 0.22) / 0.78);
    const cavity = clamp(-fine);
    let relief: number;
    if (p.relief === "seams") relief = 0.035 * coarse + 0.025 * fine - 0.22 * joint - 0.045 * cavity;
    else if (p.relief === "grooves") relief = 0.16 * coarse + 0.025 * fine;
    else relief = 0.035 * coarse + 0.04 * fine;
    height[i] = clamp(0.5 + relief);
    // Dark, coherent damp patches only on the damp/mud/alley sets, never a black checker tile or paint.
    const wet = clamp((avg - wetLum[i] - 0.035) / 0.16);
    rough[i] = clamp(p.roughness + p.variation * (Math.abs(fine) - 0.3) + (p.relief === "seams" ? 0.09 * joint : 0) - p.wet * wet * (0.6 + 0.4 * clamp((0.55 - height[i]) / 0.25)), 0.18, 0.99);
  }
  const closedHeight = closeEdges(blur(height, w, h, 1), w, h);
  return { height: closedHeight, roughness: closeEdges(blur(rough, w, h, 1), w, h) };
}
/** OpenGL / three.js tangent normal: image rows go down, texture V goes up after flipY.
 *  R=-dH/d(column), G=+dH/d(row), B points out of the surface. */
export function heightNormal(height: Float32Array, w: number, h: number, strength: number): Uint8Array {
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let nx = -(height[y * w + (x + 1) % w] - height[y * w + (x - 1 + w) % w]) * 0.5 * strength * w / 1024;
    let ny = (height[((y + 1) % h) * w + x] - height[((y - 1 + h) % h) * w + x]) * 0.5 * strength * h / 1024;
    const slope = Math.hypot(nx, ny), cap = Math.min(1, 0.65 / Math.max(slope, 1e-8)); nx *= cap; ny *= cap;
    const len = Math.hypot(nx, ny, 1);
    out[i * 3] = Math.round((nx / len * 0.5 + 0.5) * 255);
    out[i * 3 + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
    out[i * 3 + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
  }
  return out;
}
export function halfField(a: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h / 4);
  for (let y = 0; y < h / 2; y++) for (let x = 0; x < w / 2; x++) {
    const i = 2 * y * w + 2 * x; out[y * w / 2 + x] = (a[i] + a[i + 1] + a[i + w] + a[i + w + 1]) / 4;
  }
  return closeEdges(out, w / 2, h / 2);
}
export function encodePbr(f: PbrFields, w: number, h: number, strength: number): Record<"normal" | "roughness", Uint8Array> {
  return { normal: heightNormal(f.height, w, h, strength), roughness: Uint8Array.from(f.roughness, v => Math.round(v * 255)) };
}
function writeData(file: string, data: Uint8Array, size: number, gray = false): void {
  execFileSync("magick", ["-size", `${size}x${size}`, "-depth", "8", gray ? "gray:-" : "RGB:-", "-define", "webp:lossless=true", "-define", "webp:method=0", file], { input: data, env: { ...process.env, MAGICK_THREAD_LIMIT: "1" } });
}
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
export function main(): void {
  const root = path.resolve(import.meta.dirname, ".."), pub = path.join(root, "public");
  const args = process.argv.slice(2), check = args.includes("--check");
  const wanted = args.find(a => a.startsWith("--set="))?.slice(6);
  const preview = args.find(a => a.startsWith("--preview="))?.slice(10);
  const inputs = PBR_SURFACES.map(set => `textures/${set}.webp`);
  const selected = inputs.filter(f => !wanted || f === `textures/${wanted}.webp`);
  if (!selected.length) throw new Error(`No albedo for ${wanted}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rppbr-"));
  const records = [];
  try {
    for (const source of selected) {
      const file = path.join(pub, source), set = source.replace(/^textures\//, "").replace(/\.webp$/, "");
      const profile = pbrProfile(set)!;
      const rgb = execFileSync("magick", [file, "-resize", "1024x1024!", "-alpha", "off", "-depth", "8", "RGB:-"], { maxBuffer: 32 * 2 ** 20, env: { ...process.env, MAGICK_THREAD_LIMIT: "1" } });
      const fields = estimatePbr(rgb, 1024, 1024, profile);
      const outputs: Record<string, { sha256: string; bytes: number }> = {};
      for (const size of [1024, 512]) {
        const f = size === 1024 ? fields : { height: halfField(fields.height, 1024, 1024), roughness: halfField(fields.roughness, 1024, 1024) };
        const maps = size === 1024 ? encodePbr(f, size, size, profile.strength) : { roughness: Uint8Array.from(f.roughness, v => Math.round(v * 255)), normal: new Uint8Array() };
        for (const kind of ["normal", "roughness"] as const) {
          if (size === 512 && kind === "normal") continue;
          const name = `${path.basename(set)}_${kind}_${size}.webp`, target = path.join(path.dirname(file), name), staged = path.join(tmp, name);
          writeData(staged, maps[kind], size, kind === "roughness");
          const content = fs.readFileSync(staged);
          if (check) { if (!fs.existsSync(target) || !content.equals(fs.readFileSync(target))) throw new Error(`Outdated PBR map: ${path.relative(root, target)}`); }
          else fs.copyFileSync(staged, target);
          outputs[name] = { sha256: hash(content), bytes: content.length };
        }
      }
      if (preview && !check) {
        fs.mkdirSync(preview, { recursive: true });
        const gray = Uint8Array.from(fields.height, v => Math.round(v * 255));
        writeData(path.join(preview, `${set.replaceAll("/", "-")}_height.webp`), gray, 1024, true);
      }
      records.push({ source, albedoSha256: hash(fs.readFileSync(file)), profile, outputs });
      console.log(`${check ? "checked" : "made"} ${set} (${profile.kind}): normal at 1024; roughness at 1024 / 512`);
    }
    if (!check) {
      const manifest = path.join(root, "docs", "pbr-maps.json");
      const previous = wanted && fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, "utf8")).records as typeof records : [];
      const bySource = new Map(previous.map(r => [r.source, r]));
      for (const r of records) bySource.set(r.source, r);
      fs.writeFileSync(manifest, JSON.stringify({ version: 1, convention: "OpenGL +Y", encoding: "lossless WebP, linear data", records: [...bySource.values()].sort((a, b) => a.source.localeCompare(b.source)) }, null, 2) + "\n");
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
