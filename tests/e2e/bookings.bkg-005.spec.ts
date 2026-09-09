import { expect, test, type Page } from "@playwright/test";

// S6 booking retrieval (UF-006: BKG-004/005, NFR-002/003).
// Fresh workspace per run from global-setup: maya owns BKG-SEED-MAYA-001,
// alex starts booking-free.
async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/events/);
}

test("bkg-005 bookings list → detail revisit without banner (UF-006)", async ({ page }) => {
  await signIn(page, "maya.attendee@example.test", "Booked123!");
  await page.goto("/bookings");
  await expect(page.getByRole("heading", { name: "My bookings", level: 1 })).toBeVisible();

  const card = page.locator("article.card", { hasText: "BKG-SEED-MAYA-001" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Jakarta Design Systems Workshop")).toBeVisible();
  await expect(card.getByText(/Session ·/)).toBeVisible();
  await card.getByRole("link", { name: "View booking" }).click();

  // Durable revisit: detail heading, no confirmation banner.
  await expect(page).toHaveURL(/\/bookings\/BKG-SEED-MAYA-001/);
  await expect(page.getByRole("heading", { name: "Booking BKG-SEED-MAYA-001", level: 1 })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Booking details" }).getByText("Jakarta Design Systems Workshop").first(),
  ).toBeVisible();
  await expect(page.getByText("IDR 300.000").first()).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("bkg-005 empty bookings state with browse action", async ({ page }) => {
  await signIn(page, "alex.attendee@example.test", "Attend123!");
  await page.goto("/bookings");
  await expect(page.getByText("No bookings yet.")).toBeVisible();
  await page.getByRole("link", { name: "Browse events" }).click();
  await expect(page).toHaveURL(/\/events/);
});

test("bkg-004 fresh confirmation banner shows once, then detail stays", async ({ page }) => {
  await signIn(page, "alex.attendee@example.test", "Attend123!");
  await page.goto("/events/jakarta-design-systems-workshop");
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page).toHaveURL(/\/checkout\?event=/);
  await page.getByLabel("Quantity (1–5)").selectOption("1");
  await page.getByLabel("Simulation code").fill("SIMULATE-SUCCESS");
  await page.getByRole("button", { name: /Pay IDR/ }).click();

  // Arrival carries the banner; the URL is cleaned to the durable form.
  await expect(page.getByRole("heading", { name: "Booking confirmed", level: 1 })).toBeVisible();
  const ref = (await page.getByRole("status").textContent()) ?? "";
  expect(ref).toMatch(/BKG-[A-Z2-9]{6}/);
  await expect(page).toHaveURL(/\/bookings\/BKG-[A-Z2-9]{6}(\?fresh=1)?/);

  const clean = page.url().replace(/\?fresh=1$/, "");
  await page.goto(clean);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Booking confirmed");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("bkg-004 unknown booking shows not-found", async ({ page }) => {
  await signIn(page, "alex.attendee@example.test", "Attend123!");
  await page.goto("/bookings/BKG-NOPE");
  await expect(page.getByRole("heading", { name: "Booking not found", level: 1 })).toBeVisible();
});

test("bkg-004 anonymous booking detail preserves a safe sign-in destination", async ({ page }) => {
  await page.goto("/bookings/BKG-SEED-MAYA-001");
  await expect(page.getByRole("heading", { name: "Sign in to view this booking", level: 1 })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fbookings%2FBKG-SEED-MAYA-001/);
});

test("bkg-005 bookings viewport: no horizontal overflow at 360px (NFR-003)", async ({ page }) => {
  await signIn(page, "maya.attendee@example.test", "Booked123!");
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/bookings");
  await expect(page.getByRole("heading", { name: "My bookings", level: 1 })).toBeVisible();
  await expect(page.locator("article.card, div.empty").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - 360);
  expect(overflow).toBeLessThanOrEqual(0);
});
