// QA cockpit browser evidence (NFR-004/NFR-005/NFR-006).
import { expect, test } from "@playwright/test";

test("nfr-004/nfr-005/nfr-006 cockpit traces safe request evidence", async ({ page }) => {
  await page.goto("/qa/observability");
  await expect(page.getByRole("heading", { name: "QA observability cockpit" })).toBeVisible();
  await expect(page.getByText("Client evidence below contains status", { exact: false })).toBeVisible();

  await page.getByLabel("Password (not stored)").fill("Attend123!");
  await page.getByRole("button", { name: "Run all" }).click();

  await expect(page.getByText("Health", { exact: true })).toBeVisible();
  await expect(page.getByText("Event discovery", { exact: true })).toBeVisible();
  await expect(page.getByText("Sign in", { exact: true })).toBeVisible();
  await expect(page.getByText("Payment decline", { exact: true })).toBeVisible();
  await expect(page.locator("dd").filter({ hasText: "PAYMENT_DECLINED" })).toBeVisible();
  await expect(page.getByText("Correlation ID", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Password (not stored)")).toHaveValue("");
  await expect(page.getByText("SIMULATE-DECLINE", { exact: true })).toHaveCount(0);
  const traceStorage = await page.evaluate(() => window.sessionStorage.getItem("ebp.qa-observability.trace") ?? "");
  expect(traceStorage).not.toContain("Attend123!");
  expect(traceStorage).not.toContain("SIMULATE-DECLINE");
  await expect(page.getByText("External log evidence", { exact: true })).toBeVisible();
});
