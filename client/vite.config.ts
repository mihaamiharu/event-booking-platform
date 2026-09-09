import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

const clientDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(clientDir, "..");
const workerConfig = path.join(repoRoot, "worker", "wrangler.jsonc");
const localState = path.join(repoRoot, "worker", ".wrangler", "local");

// ADR-0007: React + Vite SPA output served as Static Assets.
export default defineConfig({
  // Keep the Worker configuration in worker/ while letting Vite run the
  // Worker in workerd during local development and builds.
  plugins: [
    react(),
    cloudflare({
      configPath: workerConfig,
      persistState: { path: localState },
    }),
  ],
  build: { outDir: "dist", emptyOutDir: true },
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
});
