import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.DDD_BASE ?? "/", // "/repo-name/" for GitHub Pages project sites
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/ws": { target: "ws://localhost:8787", ws: true },
      "/api": { target: "http://localhost:8787" },
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 6000, // Babylon.js core is intentionally one chunk
    rollupOptions: {
      output: process.env.DDD_SINGLE_FILE
        ? { inlineDynamicImports: true } // one bundle for static single-file embeds
        : {
            manualChunks: {
              babylon: ["@babylonjs/core"],
            },
          },
    },
  },
});
