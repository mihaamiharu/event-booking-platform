import { expect, test, type Page } from "@playwright/test";

// BKG-006, BKG-007, NFR-010, UF-007: cancellation is a durable booking lifecycle
// transition, not a client-only dismissal.
async function signIn(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("maya.attendee@example.test");
  await page.getByLabel("Password").fill("Booked123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/events/);
}

async function resetWorkspace(page: Page): Promise<void> {
  await page.goto("/demo");
  await page.getByLabel(/I understand reset deletes this workspace/).check();
  await page.getByRole("button", { name: "Reset workspace" }).click();
  await expect(page.getByRole("status")).toContainText("reset to seed state");
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("bkg-006 cancellation confirmation moves focus and persists cancelled state", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/bookings/BKG-SEED-MAYA-001");
  await expect(page.getByRole("heading", { name: "Booking BKG-SEED-MAYA-001", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel booking" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Cancel this booking?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirm cancellation" })).toBeFocused();
  await expect(dialog.getByText(/releases 2 places/i)).toBeVisible();
  const dialogOverflow = await page.evaluate(() => document.documentElement.scrollWidth - 360);
  expect(dialogOverflow).toBeLessThanOrEqual(0);

  await dialog.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.locator('[role="status"]').filter({ hasText: "Cancellation recorded" })).toBeVisible();
  await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
  await expect(page.getByText("This booking is cancelled and cannot be cancelled again.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
});

test("bkg-007 keep booking closes the confirmation without a write", async ({ page }) => {
  await signIn(page);
  await page.goto("/bookings/BKG-SEED-MAYA-001");
  await page.getByRole("button", { name: "Cancel booking" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Cancel this booking?" });
  await dialog.getByRole("button", { name: "Keep booking" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("CONFIRMED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible();
});
