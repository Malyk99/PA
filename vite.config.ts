import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "client",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: false },
      "/l/": { target: "http://localhost:4000" },
      "/files/": { target: "http://localhost:4000" },
    },
  },
});
