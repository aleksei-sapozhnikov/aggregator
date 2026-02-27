/**
 * @file Vite configuration for the main app and Grafana wrapper multi-page entries.
 */

import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        grafanaFrame: resolve(__dirname, 'grafana-frame/index.html'),
      },
    },
  },
});
