import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { BRANDS, brandHtml, resolveGame, type GameId } from "./src/brands.ts";

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

/**
 * The game this build is (src/brands.ts): VITE_GAME=retardiopayne builds RetardioPayne, anything else
 * RadPayne. RetardioPayne's page head is its own (brandHtml), and its build puts brand/retardiopayne/*
 * (the favicon, the share image og.jpg) over public's at the root of dist. A dev or test page switched
 * with ?game= takes its icon from /brand/<game>/favicon.svg (served here in dev, copied into a test
 * build). A plain production build is RadPayne's, file for file.
 */
function gameBrand(game: GameId, mode: string): Plugin {
  const root = import.meta.dirname;
  const brandFile = (g: GameId, f: string) => {
    const own = path.join(root, "brand", g, f);
    return fs.existsSync(own) ? own : g === "radpayne" ? path.join(root, "public", f) : null;
  };
  let outDir = path.join(root, "dist"), build = false;
  return {
    name: "radpayne-game-brand",
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); build = c.command === "build"; },
    transformIndexHtml: html => brandHtml(html, game),
    configureServer(server) {
      server.middlewares.use("/brand", (req, res, next) => {
        const m = /^\/(radpayne|retardiopayne)\/(favicon\.svg|og\.jpg)$/.exec((req.url ?? "").split("?")[0]);
        const file = m ? brandFile(m[1] as GameId, m[2]) : null;
        if (!file) return next();
        res.setHeader("content-type", file.endsWith(".svg") ? "image/svg+xml" : "image/jpeg");
        res.end(fs.readFileSync(file));
      });
    },
    closeBundle() {
      // (a dev server calls this too when it closes: only a build writes into dist)
      if (!build || !fs.existsSync(outDir)) return;
      if (game !== "radpayne") for (const f of fs.readdirSync(path.join(root, "brand", game))) fs.copyFileSync(path.join(root, "brand", game, f), path.join(outDir, f));
      if (mode !== "production") for (const g of Object.keys(BRANDS) as GameId[]) {
        const file = brandFile(g, "favicon.svg");
        if (!file) continue;
        fs.mkdirSync(path.join(outDir, "brand", g), { recursive: true });
        fs.copyFileSync(file, path.join(outDir, "brand", g, "favicon.svg"));
      }
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const game = resolveGame(process.env.VITE_GAME, "production", "");
  // dev: no hashes (the editor saves levels while the page is open); build: every public runtime file
  const hashes = command === "build" ? assetHashes(import.meta.dirname) : null;
  return {
    plugins: [react(), devSave(), gameBrand(game, mode), ...(hashes ? [fontVersions(hashes)] : [])],
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
