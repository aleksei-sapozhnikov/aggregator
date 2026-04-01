/**
 * @file Vite configuration for the main app and Grafana wrapper multipage entries.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(currentDir, "index.html"),
        grafanaFrame: resolve(currentDir, "grafana-frame/index.html"),
      },
    },
  },
});
