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
  // Wait for catalog CONTENT, not just the h1: the h1 renders in loading and
  // error states too, and saving state before the auto-provision round-trip
  // completes persists a cookie-less context. Every test would then burn one
  // masked provision retry, exhausting the 10/hour budget mid-matrix (S6).
  await page.locator("article.card").first().waitFor();
  await page.context().storageState({ path: storageState });
  await browser.close();
}

export default globalSetup;
