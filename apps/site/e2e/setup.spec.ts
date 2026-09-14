import { expect, test } from "@playwright/test";

const posix = "npx --yes @npmmo/roster@0.0.4 init --no-dense";
const windows = "npx.cmd --yes @npmmo/roster@0.0.4 init --no-dense";

test("the homepage copies one scoped command that also initializes Roster", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("link", { name: "Get started", exact: true }).click();
  await expect(page).toHaveURL(/#setup$/);
  await expect(page.getByRole("textbox", { name: "Setup command for macOS and Linux" })).toHaveValue(posix);
  await page.getByRole("button", { name: "Copy setup command", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(posix);
});

test("Windows command choice stays consistent through the installation guide", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#setup");
  await page.locator(".setup-copy").getByRole("tab", { name: "Windows", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Setup command for Windows" })).toHaveValue(windows);
  await page.getByRole("button", { name: "Copy setup command", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(windows);
  await page.getByRole("link", { name: "First-run guide", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Windows", exact: true }).first()).toHaveAttribute("aria-selected", "true");
  await page.locator('[data-command="prepare"] .copy button:visible').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(windows);
  await page.locator('[data-command="sync"] .copy button:visible').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npx.cmd --yes @npmmo/roster@0.0.4 sync --client cursor");
  await page.locator('[data-command="eject"] .copy button:visible').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npx.cmd --yes @npmmo/roster@0.0.4 eject --client cursor");
});

test("the setup selector works with a keyboard and denied clipboard access", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/#setup");
  const tabs = page.locator(".setup-copy");
  await tabs.getByRole("tab", { name: "macOS / Linux", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Windows", exact: true })).toBeFocused();
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }); });
  await page.getByRole("button", { name: "Copy setup command", exact: true }).click();
  const fallback = page.getByRole("textbox", { name: "Select and copy this text" });
  await expect(fallback).toBeVisible();
  await expect(fallback).toBeFocused();
  await expect(fallback).toHaveValue(windows);
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
});
