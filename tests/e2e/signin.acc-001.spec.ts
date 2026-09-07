import { expect, test } from "@playwright/test";

// S4 sign-in journey (UF-002: ACC-001, NFR-002/003).
// Shared workspace from global-setup; sign-in only adds session rows.
test("acc-001 sign-in: success shows attendee menu, sign-out restores it", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();

  await page.getByLabel("Email").fill("alex.attendee@example.test");
  await page.getByLabel("Password").fill("Attend123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/events/);
  await expect(page.getByLabel("Signed-in attendee")).toContainText("Alex");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Signed-in attendee")).toContainText("Alex");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("acc-001 sign-in failure: one message, email kept, focus to alert", async ({
  page,
  browserName,
}) => {
  test.skip(browserName === "webkit", "headless WebKit has no keyboard-focusable document");
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();

  await page.getByLabel("Email").fill("alex.attendee@example.test");
  await page.getByLabel("Password").fill("Wrong123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("AUTH_INVALID_CREDENTIALS");
  await expect(alert).toBeFocused();
  await expect(page.getByLabel("Email")).toHaveValue("alex.attendee@example.test");
});

test("acc-001 sign-in viewport: no horizontal overflow at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - 360);
  expect(overflow).toBeLessThanOrEqual(0);
});
