import { chromium, type FullConfig } from "@playwright/test";
import { resetRateCounters } from "../api/support/harness.ts";

// Provisions ONE workspace for the whole matrix run and persists its cookie.
// S3 journeys are read-only (only last_active_at slides), so sharing is safe;
// mutating slices (S5+) revisit per-test isolation. Runs after webServer boot.
async function globalSetup(config: FullConfig): Promise<void> {
  const project = config.projects[0];
  if (!project) throw new Error("no Playwright projects configured");
  const { baseURL, storageState } = project.use;
  if (typeof baseURL !== "string" || typeof storageState !== "string") {
    throw new Error("baseURL and storageState must be configured");
  }
  const browser = await chromium.launch();
  // Fresh rate bucket even when reusing a stale local dev server.
  resetRateCounters(baseURL);
  const page = await browser.newPage({ baseURL });
  await page.goto("/events");
  await page.getByRole("heading", { name: "Events", level: 1 }).waitFor();
  await page.context().storageState({ path: storageState });
  await browser.close();
}

export default globalSetup;
