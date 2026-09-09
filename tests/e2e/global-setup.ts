import { chromium, type FullConfig } from "@playwright/test";
import { resetRateCounters } from "../api/support/harness.ts";

// Provisions one workspace per browser project and persists its cookie. This
// keeps mutation-heavy journeys isolated while still using the public product
// provisioning path rather than a test-only endpoint.
async function globalSetup(config: FullConfig): Promise<void> {
  // serve:e2e clears local rate counters before starting Vite preview. Do not
  // issue a second-process SQLite reset while the live Worker owns the DB.
  process.env.EBP_VITE_RUNTIME = "1";
  const browser = await chromium.launch();
  // Fresh rate bucket even when reusing a stale local dev server.
  const firstProject = config.projects[0];
  if (!firstProject || typeof firstProject.use.baseURL !== "string") throw new Error("baseURL is not configured");
  resetRateCounters(firstProject.use.baseURL);
  for (const project of config.projects) {
    const { baseURL, storageState } = project.use;
    if (typeof baseURL !== "string" || typeof storageState !== "string") {
      throw new Error(`baseURL and storageState must be configured for ${project.name}`);
    }
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/events");
    // Wait for catalog CONTENT, not just the h1: the h1 also renders while
    // loading and error states are active.
    await page.locator("article.card").first().waitFor();
    await context.storageState({ path: storageState });
    await context.close();
  }
  await browser.close();
}

export default globalSetup;
