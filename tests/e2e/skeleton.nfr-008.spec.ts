import { expect, test } from "@playwright/test";

// S0 scaffold (NFR-008): empty-but-green skeleton on all three R1 browsers.
// First real journey (UF-003 catalog) lands in S3.
test("nfr-008 skeleton loads a blank page", async ({ page }) => {
  await page.goto("about:blank");
  await expect(page).toHaveTitle("");
});
