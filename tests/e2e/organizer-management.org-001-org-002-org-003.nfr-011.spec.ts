import { expect, test, type Page } from "@playwright/test";

// ORG-001/ORG-002/ORG-003, NFR-011: organizer configures a room and ticket,
// keeps a draft private, then publishes it for attendee discovery.
async function resetWorkspace(page: Page): Promise<void> {
  await page.goto("/demo");
  await page.getByLabel(/I understand reset deletes this workspace/).check();
  await page.getByRole("button", { name: "Reset workspace" }).click();
  await expect(page.getByRole("status")).toContainText("reset to seed state");
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/sign-in?next=/organizer");
  await page.getByLabel("Email").fill("raka.organizer@example.test");
  await page.getByLabel("Password").fill("Organize123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/organizer/);
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page);
});

test("org-001/org-002/org-003 organizer editor publishes room capacity and ticket price", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Shape the room, then sell the place.", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Modern Web Conference" }).click();
  await expect(page.getByLabel("Room capacity")).toHaveValue("10");
  await page.getByLabel("Event name").fill("Modern Web Conference — Published");
  await page.getByLabel("Room capacity").fill("24");
  await page.getByLabel("Price (IDR)").fill("125000");
  await page.getByRole("button", { name: "Publish event" }).click();
  await expect(page.getByRole("status")).toContainText("Published: Modern Web Conference — Published");
  await expect(page.locator("button.organizer-event-row.is-selected").getByText("PUBLISHED", { exact: true })).toBeVisible();

  await page.goto("/events/modern-web-conference");
  await expect(page.getByRole("heading", { name: "Modern Web Conference — Published", level: 1 })).toBeVisible();
  await expect(page.getByText("IDR 125.000", { exact: true })).toBeVisible();
});

test("org-011 organizer editor has no horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Shape the room, then sell the place.", level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - 360);
  expect(overflow).toBeLessThanOrEqual(0);
});
