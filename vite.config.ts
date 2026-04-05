import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { ApiError, loadApiPath } from "./server/api.mjs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "mission-control-runtime-api",
      configureServer(server) {
        server.middlewares.use("/api/app", async (req, res) => {
          try {
            const url = new URL(req.url || "/", "http://mission-control.local");
            const payload = await loadApiPath(`/api/app${url.pathname}`, url);

            if (!payload) {
              res.statusCode = 404;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: `Unknown API path: ${url.pathname}` }));
              return;
            }

            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify(payload));
          } catch (error) {
            const status = error instanceof ApiError ? error.status : 500;
            res.statusCode = status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Unknown API adapter error",
              }),
            );
          }
        });

        server.middlewares.use("/api/", async (req, res) => {
          try {
            const url = new URL(req.url || "/", "http://mission-control.local");
            const payload = await loadApiPath(url.pathname, url);

            if (!payload) {
              res.statusCode = 404;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: `Unknown API path: ${url.pathname}` }));
              return;
            }

            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify(payload));
          } catch (error) {
            const status = error instanceof ApiError ? error.status : 500;
            res.statusCode = status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Unknown API adapter error",
              }),
            );
          }
        });
      },
    },
  ],
  server: {
    host: "0.0.0.0",
    port: 4174,
  },
  preview: {
    host: "0.0.0.0",
    port: 4174,
  },
});
