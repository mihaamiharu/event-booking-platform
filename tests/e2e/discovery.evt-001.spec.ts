import { expect, test } from "@playwright/test";

// S3 discovery journey (UF-003: EVT-001/EVT-002, NFR-002/003/009).
// First visit auto-provisions (S3 entry UX); server state is the r1-v1 seed.
test("evt-001 discovery: catalog → detail → sold-out → not-found", async ({ page }) => {
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "Events", level: 1 })).toBeVisible();

  const cards = page.locator("article.card");
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: "Jakarta Design Systems Workshop" })).toBeVisible();
  await expect(page.getByText("From IDR 150.000")).toBeVisible();
  await expect(page.getByText("Available").first()).toBeVisible();
  await expect(page.getByText("Sold out").first()).toBeVisible();

  await page.getByRole("link", { name: "View details" }).first().click();
  await expect(page).toHaveURL(/\/events\/jakarta-design-systems-workshop/);
  await expect(
    page.getByRole("heading", { name: "Jakarta Design Systems Workshop", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schedule (WIB)" })).toBeVisible();
  await expect(page.getByText(/\d{2}:\d{2}–\d{2}:\d{2} WIB/).first()).toBeVisible();
  await expect(page.getByText("IDR 250.000")).toBeVisible();
  await expect(page.getByText("Bookable").first()).toBeVisible();

  await page.goto("/events/community-product-meetup");
  await expect(page.getByText("SOLD_OUT")).toBeVisible();

  await page.goto("/events/no-such-event");
  await expect(
    page.getByRole("heading", { name: "Event not found", level: 1 }),
  ).toBeVisible();
});

test("evt-001 keyboard: skip link, focus order, and keyboard navigation", async ({ page, hasTouch, browserName }) => {
  test.skip(!!hasTouch, "keyboard navigation does not apply to touch devices");
  // Headless WebKit never activates the document for keyboard input; focus
  // behavior there is covered by the webkit-focus test below, and native
  // links/buttons are keyboard-operable by construction.
  test.skip(browserName === "webkit", "headless WebKit has no keyboard-focusable document");
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "Events", level: 1 })).toBeVisible();
  // Headless WebKit starts with an inactive document; keyboard needs focus.
  await page.bringToFront();

  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();

  // Fresh load resets focus to body; Tab order: skip → brand → Events nav
  // → first card link.
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "Events", level: 1 })).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const firstLink = page.getByRole("link", { name: "View details" }).first();
  await expect(firstLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/events\/jakarta-design-systems-workshop/);
  await expect(
    page.getByRole("heading", { name: "Jakarta Design Systems Workshop", level: 1 }),
  ).toBeVisible();
});

test("evt-001 focus semantics (webkit-safe): skip link target and landmarks", async ({
  page,
}) => {
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "Events", level: 1 })).toBeVisible();
  // Programmatic focus works without an active document; proves the wiring
  // the Tab-order test (chromium/firefox) proves the key path for.
  await page.locator(".skip-link").focus();
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View details" }).first()).toBeVisible();
});

test("evt-001 viewport: no horizontal overflow at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "Events", level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - 360);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("link", { name: "View details" }).first().click();
  await expect(page).toHaveURL(/\/events\/jakarta-design-systems-workshop/);
  const detailOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - 360,
  );
  expect(detailOverflow).toBeLessThanOrEqual(0);
});
