import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// S3 client build (ADR-0007): static SPA output served as Static Assets.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173 },
});
