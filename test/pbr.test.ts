import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as generator from "../tools/pbr-maps.ts";
import { PBR_SURFACES, pbrMapPath } from "../src/app/look/pbrProfiles.ts";

test("surface maps fit the shipped download budget", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../docs/pbr-maps.json", import.meta.url), "utf8"));
  const files = new Map<string, number>();
  for (const r of manifest.records) for (const [name, output] of Object.entries(r.outputs)) {
    const file = `${r.source.slice(0, r.source.lastIndexOf('/'))}/${name}`;
    const actual = fs.statSync(new URL(`../public/${file}`, import.meta.url)).size;
    assert.equal(actual, (output as { bytes: number }).bytes, file);
    files.set(file, actual);
  }
  const shipped = fs.readdirSync(new URL('../public/textures/',import.meta.url),{recursive:true}) as string[];
  const maps = shipped.filter(f=>/_(normal|roughness|orm)_\d+\.webp$/.test(f));
  assert.deepEqual(maps.map(f=>`textures/${f}`).sort(), [...files.keys()].sort(), 'no obsolete or untracked surface maps ship');
  const bytes = [...files.values()].reduce((a, b) => a + b, 0);
  assert.ok(bytes <= 5_500_000, `${bytes} bytes of surface maps exceeds 5.5 MB`);
  for (const set of PBR_SURFACES) for (const [kind,low] of [['normal',false],['orm',false],['orm',true]] as const) {
    assert.ok(files.has(pbrMapPath(set,kind,low).slice(1)), `${set}/${kind}/${low} must resolve to a shipped map`);
  }
});

test("ORM packs linear roughness without changing ambient light or authored metalness", () => {
  const pack = (generator as unknown as { packOrm: (a: Float32Array) => Uint8Array }).packOrm;
  assert.equal(typeof pack, "function");
  assert.deepEqual([...pack(new Float32Array([0, 0.5, 1]))], [255, 0, 255, 255, 128, 255, 255, 255, 255]);
});
