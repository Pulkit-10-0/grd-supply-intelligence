import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-synthetic-demo-login",
      configureServer(server) {
        server.middlewares.use("/__local-demo", async (req, res) => {
          const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress || "",
          );
          const origin = req.headers.origin;
          if (
            !local ||
            req.method !== "POST" ||
            !["http://127.0.0.1:5173", "http://localhost:5173"].includes(
              origin || "",
            )
          ) {
            res.writeHead(403);
            res.end("Local development access only");
            return;
          }
          try {
            const env = Object.fromEntries(
              readFileSync(
                fileURLToPath(new URL("../.env", import.meta.url)),
                "utf8",
              )
                .split("\n")
                .filter((x) => x.includes("="))
                .map((x) => {
                  const i = x.indexOf("=");
                  return [x.slice(0, i), x.slice(i + 1)];
                }),
            );
            const response = await fetch(
              "http://127.0.0.1:8011/api/v1/auth/login",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: "demo@grd.local",
                  password: env.GRD_ADMIN_PASSWORD,
                }),
              },
            );
            const body = await response.json();
            if (!response.ok) throw new Error("Demo login unavailable");
            const me = await fetch("http://127.0.0.1:8011/api/v1/me", {
              headers: { Authorization: `Bearer ${body.access_token}` },
            });
            if ((await me.json()).evidence_type !== "synthetic")
              throw new Error("Demo access requires a synthetic organisation");
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(body));
          } catch {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                detail:
                  "Start the backend and seed the local synthetic demo first.",
              }),
            );
          }
        });
      },
    },
  ],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8011", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8011", changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          map: ["leaflet"],
        },
      },
    },
  },
});
