import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

export default defineConfig({
  plugins: [react(), devSave()],
  server: { port: 4880, strictPort: false },
  preview: { port: 4881 },
  build: { chunkSizeWarningLimit: 4000 },
});
