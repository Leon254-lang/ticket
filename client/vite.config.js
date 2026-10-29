import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: clientRoot,
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/images": "http://127.0.0.1:3000",
    },
  },
  build: {
    outDir: path.join(clientRoot, "dist"),
    emptyOutDir: true,
  },
});
