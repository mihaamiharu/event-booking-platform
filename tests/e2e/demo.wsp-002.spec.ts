import { expect, test, type Page } from "@playwright/test";

// S7 workspace lifecycle UI (UF-001: WSP-002/003, NFR-002/003).
// Fresh workspace per run from global-setup.
async function signInAsAlex(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("alex.attendee@example.test");
  await page.getByLabel("Password").fill("Attend123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/events/);
}

test("wsp-002 demo: book → reset → seed restored (UF-001)", async ({ page }) => {
  await signInAsAlex(page);

  // Status card shows the seed contract with remaining lifetime.
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Demo controls", level: 1 })).toBeVisible();
  await expect(page.getByText("r1-v1").first()).toBeVisible();
  await expect(page.getByText(/days remaining/)).toBeVisible();

  // One booking, then reset through the confirm flow.
  await page.goto("/events/jakarta-design-systems-workshop");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/checkout\?event=/);
  await page.getByLabel("Quantity (1–5)").selectOption("1");
  await page.getByLabel("Simulation code").fill("SIMULATE-SUCCESS");
  await page.getByRole("button", { name: /Pay IDR/ }).click();
  await expect(page.getByRole("heading", { name: "Booking confirmed", level: 1 })).toBeVisible();

  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "Reset workspace" })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Reset workspace" }).click();
  await expect(page.getByRole("status")).toContainText("reset to seed state");

  // Restored: session died (sign-in prompt), then seed state is clean.
  await page.goto("/bookings");
  await expect(page.getByText("Sign in to view your bookings.")).toBeVisible();
  await signInAsAlex(page);
  await page.goto("/bookings");
  await expect(page.getByText("No bookings yet.")).toBeVisible();
  await page.goto("/events/jakarta-design-systems-workshop");
  await expect(page.getByText("18 left").first()).toBeVisible();
});

test("wsp-002 demo viewport: no horizontal overflow at 360px (NFR-003)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Demo controls", level: 1 })).toBeVisible();
  await expect(page.locator("dl.detail, div.error").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - 360);
  expect(overflow).toBeLessThanOrEqual(0);
});
