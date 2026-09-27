// Apply the arsenal's per-room additions (tools/levels/arsenal.ts) to public/levels/room1-3.json in
// place. Idempotent: run it again after an edit to the additions. Then: npm run check-level roomN.
//   node tools/arsenal-levels.ts
import fs from "node:fs";
import path from "node:path";
import { applyArsenal } from "./levels/arsenal.ts";

for (const room of ["room1", "room2", "room3"]) {
  const file = path.resolve(import.meta.dirname, "..", "public", "levels", `${room}.json`);
  const prefab = JSON.parse(fs.readFileSync(file, "utf8"));
  applyArsenal(prefab, room);
  // the editor's layout (indent 1), with number arrays kept on one line (as the room tools write it)
  const json = JSON.stringify(prefab, null, 1).replace(/\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+)*)\s*\]/g, (_m, inner: string) => `[${inner.split(/,\s*/).join(", ")}]`);
  fs.writeFileSync(file, json + "\n");
  console.log(`patched ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}
