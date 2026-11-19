import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry
        entry: path.join(__dirname, "electron/main.ts"),
        onstart(options) {
          options.startup();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
      {
        // Preload entry
        entry: path.join(__dirname, "electron/preload.ts"),
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            lib: {
              entry: path.join(__dirname, "electron/preload.ts"),
              formats: ["cjs"],
              fileName: () => "preload.cjs",
            },
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
              output: {
                format: "cjs",
                entryFileNames: "preload.cjs",
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  server: {
    port: 5173,
  },
});
