import { defineConfig, devices } from "@playwright/test";

// S3: Chromium-only matrix (owner decision 2026-09-07 — Firefox/WebKit rejoin
// no later than S8 release verification, NFR-008). Sequential: one local
// miniflare/D1 serves the run; parallel browsers contend on its SQLite
// writes (activity updates) and flake.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: { trace: "off", baseURL: "http://127.0.0.1:8780", storageState: "e2e/.auth/state.json" },
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: "npm --prefix .. run serve:e2e",
    url: "http://127.0.0.1:8780/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
