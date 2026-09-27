import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

/**
 * Dev-only: POST /__radpayne/save?room=<id> writes public/levels/<id>.json (the editor's Save) and
 * prints the level check (tools/check-level.ts) back to the editor.
 */
function devSave(): Plugin {
  return {
    name: "radpayne-dev-save",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__radpayne/save", (req, res) => {
        const reply = (code: number, ok: boolean, message: string) => {
          res.statusCode = code;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok, message }));
        };
        if (req.method !== "POST") return reply(405, false, "POST only");
        const room = new URL(req.url ?? "", "http://localhost").searchParams.get("room") ?? "";
        if (!/^[a-z0-9][a-z0-9_-]{0,40}(\/[a-z0-9][a-z0-9_-]{0,40})?$/.test(room)) return reply(400, false, `bad room id: ${room}`);
        let body = "";
        req.on("data", c => (body += c));
        req.on("end", () => {
          try {
            JSON.parse(body);
          } catch (e) {
            return reply(400, false, `invalid JSON: ${String(e)}`);
          }
          const root = server.config.root;
          const file = path.join(root, "public", "levels", `${room}.json`);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, body);
          let message = `saved public/levels/${room}.json`;
          try {
            message += "\n" + execFileSync(process.execPath, [path.join(root, "tools", "check-level.ts"), room], { cwd: root, encoding: "utf8" }).trim();
          } catch (e) {
            message += `\nlevel check failed: ${String((e as { stdout?: string }).stdout ?? e)}`;
          }
          reply(200, true, message);
        });
      });
    },
  };
}

/** Content hashes of the runtime files in public/ (src/app/assets.ts appends them as ?v=): a changed
 *  file gets a new URL, so vercel.json can serve versioned URLs as immutable. */
function assetHashes(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out["/" + path.relative(path.join(root, "public"), p).split(path.sep).join("/")] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex").slice(0, 10);
    }
  };
  for (const d of ["models", "audio", "textures", "cutscenes", "ui", "levels", "fonts"]) walk(path.join(root, "public", d));
  return out;
}

/** Build: the fonts index.html asks for (the preloads and the @font-face urls, the same URL for both)
 *  by their versioned URLs too, so a changed font file is never an old copy from the browser's cache. */
function fontVersions(hashes: Record<string, string>): Plugin {
  return {
    name: "radpayne-font-versions",
    apply: "build",
    // before Vite's own pass, which takes the inline <style> through its CSS pipeline
    transformIndexHtml: {
      order: "pre",
      handler: html => html.replace(/\/fonts\/[A-Za-z0-9._-]+\.woff2/g, p => (hashes[p] ? `${p}?v=${hashes[p]}` : p)),
    },
  };
}

export default defineConfig(({ command }) => {
  // dev: no hashes (the editor saves levels while the page is open); build: every public runtime file
  const hashes = command === "build" ? assetHashes(import.meta.dirname) : null;
  return {
    plugins: [react(), devSave(), ...(hashes ? [fontVersions(hashes)] : [])],
    define: { __ASSET_V__: hashes ? JSON.stringify(hashes) : "undefined" },
    resolve: {
      alias: [
        // react-three-game's SoundManager makes an AudioContext at import; the game never uses it
        { find: /^.*\/helpers\/SoundManager(\.js)?$/, replacement: path.join(import.meta.dirname, "src/stubs/r3gSound.ts") },
      ],
    },
    server: { port: 4880, strictPort: false },
    preview: { port: 4881 },
    build: { chunkSizeWarningLimit: 4000 },
  };
});
