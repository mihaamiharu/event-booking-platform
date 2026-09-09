import { defineConfig, devices } from "@playwright/test";

// S3/S8: all three R1 browser engines (NFR-008). Each project receives its
// own seeded workspace from global-setup; projects remain sequential because
// the local Worker persists D1 state and activity updates are writes.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    baseURL: "http://127.0.0.1:8780",
  },
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: "npm --prefix .. run serve:e2e",
    url: "http://127.0.0.1:8780/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/chromium.json" } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], storageState: "e2e/.auth/firefox.json" } },
    { name: "webkit", use: { ...devices["Desktop Safari"], storageState: "e2e/.auth/webkit.json" } },
  ],
});
