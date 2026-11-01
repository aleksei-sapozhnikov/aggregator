/**
 * @file Vite configuration for the main app and Grafana wrapper multipage entries.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: "runtime-config-dev",
      configureServer(server) {
        server.middlewares.use("/config.json", (req, res, next) => {
          if (req.method !== "GET") return next();
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(
            JSON.stringify({
              appTitle: process.env.APP_TITLE ?? "",
              timelineDefaultRange: process.env.TIMELINE_DEFAULT_RANGE ?? "1d",
            }),
          );
        });
      },
    },
  ],
  build: {
    rolldownOptions: {
      input: {
        main: resolve(currentDir, "index.html"),
        grafanaFrame: resolve(
          currentDir,
          "src/components/item-details/timeline/grafana/frame/index.html",
        ),
      },
    },
  },
});
