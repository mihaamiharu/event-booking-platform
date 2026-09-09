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
export default defineConfig(({ command }) => ({
  // Keep the Worker configuration in worker/ while letting Vite run the
  // Worker in workerd during local development and builds.
  plugins: [
    react(),
    cloudflare({
      configPath: workerConfig,
      // Local QA must never inherit production observability flags from the
      // deploy config. Build/deploy keeps the top-level production values;
      // only the disposable Vite dev runtime uses the local profile
      // (NFR-001/NFR-004/NFR-005/NFR-006).
      config: command === "serve" || process.env.EBP_E2E === "1" ? {
        vars: {
          DEPLOYMENT_ENV: "local",
          QA_OBSERVABILITY_ENABLED: "true",
        },
      } : undefined,
      persistState: { path: localState },
    }),
  ],
  build: { outDir: "dist", emptyOutDir: true },
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
}));
