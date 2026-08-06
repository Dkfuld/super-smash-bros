import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
    chunkSizeWarningLimit: 4200, // Babylon.js core is intentionally one chunk
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ["@babylonjs/core"],
        },
      },
    },
  },
});
