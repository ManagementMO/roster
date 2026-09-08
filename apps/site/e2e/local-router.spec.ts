import { expect, test } from "@playwright/test";

test("the local router leads; starting five is an optional mode", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Local routing.Built to adapt.", { timeout: 2000 });
  await expect(page.getByRole("tab", { name: "Your local router" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Your toolkit. One entry point." })).toBeVisible();
  await expect(page.locator("roster-demo")).toBeHidden();
  await page.getByRole("tab", { name: "Try starting five" }).click();
  await expect(page.locator("roster-demo")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The starting five" })).toBeVisible();
});
