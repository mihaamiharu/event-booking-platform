import { defineConfig, devices } from "@playwright/test";

// S0 scaffold (NFR-008): empty-but-green skeleton on Chromium. Firefox and
// WebKit join with the first real journey (S3); the full matrix is proven
// no later than S8 release verification.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "line",
  use: { trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
