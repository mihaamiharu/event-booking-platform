import { expect, test, type Page } from "@playwright/test";

// S5 checkout journeys (UF-004/UF-005: BKG-001/002/003, PAY-001, NFR-002/003).
// Fresh workspace per run from global-setup; alex starts booking-free.
async function signInAsAlex(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("alex.attendee@example.test");
  await page.getByLabel("Password").fill("Attend123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/events/);
}

async function openCheckout(page: Page): Promise<void> {
  await page.goto("/events/jakarta-design-systems-workshop");
  await expect(
    page.getByRole("heading", { name: "Jakarta Design Systems Workshop", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/checkout\?event=/);
  await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible();
}

test("bkg-001 checkout success: select → pay → confirmation with reference (UF-004)", async ({
  page,
}) => {
  await signInAsAlex(page);
  await openCheckout(page);

  await page.getByLabel("Quantity (1–5)").selectOption("2");
  await expect(page.getByText("Total IDR 300.000")).toBeVisible();
  await page.getByLabel("Simulation code").fill("SIMULATE-SUCCESS");
  await page.getByRole("button", { name: /Pay IDR/ }).click();

  await expect(page.getByRole("heading", { name: "Booking confirmed", level: 1 })).toBeVisible();
  await expect(page.getByText(/BKG-[A-Z2-9]{6}/).first()).toBeVisible();
  await expect(page.getByText("IDR 300.000").first()).toBeVisible();
});

test("pay-001 decline preserves selection, retry with new attempt succeeds (UF-005)", async ({
  page,
}) => {
  await signInAsAlex(page);
  await openCheckout(page);

  await page.getByLabel("Quantity (1–5)").selectOption("1");
  await page.getByLabel("Simulation code").fill("SIMULATE-DECLINE");
  await page.getByRole("button", { name: /Pay IDR/ }).click();

  await expect(page.getByRole("alert")).toContainText("PAYMENT_DECLINED");
  await page.getByRole("button", { name: "Try again" }).click();

  // Selection preserved: quantity still 1.
  await expect(page.getByLabel("Quantity (1–5)")).toHaveValue("1");
  await page.getByLabel("Simulation code").fill("SIMULATE-SUCCESS");
  await page.getByRole("button", { name: /Pay IDR/ }).click();

  await expect(page.getByRole("heading", { name: "Booking confirmed", level: 1 })).toBeVisible();
  await expect(page.getByText(/BKG-[A-Z2-9]{6}/).first()).toBeVisible();
});

test("bkg-001 checkout viewport: no horizontal overflow at 360px", async ({ page }) => {
  await signInAsAlex(page);
  await openCheckout(page);
  // Wait for the populated selects: the loading skeleton would mask overflow.
  await expect(page.getByLabel("Session")).toBeVisible();
  await page.setViewportSize({ width: 360, height: 740 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - 360);
  expect(overflow).toBeLessThanOrEqual(0);
});
