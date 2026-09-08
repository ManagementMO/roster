import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
}

async function audit(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined))));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => ({ target: node.target, detail: node.failureSummary })) }))).toEqual([]);
}

for (const width of [320, 390, 768, 1024, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`${width}px ${theme}: homepage and docs fit, load, and remain accessible`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      for (const route of ["/", "/docs/installation/"]) {
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await noOverflow(page);
        expect(await page.locator("img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
        await audit(page);
        if (route === "/") {
          await page.getByRole("tab", { name: "Try starting five" }).click();
          await page.locator("[data-detail]:not([hidden]) [data-run]").click();
          await noOverflow(page);
          await audit(page);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

test("all presets and starters reveal coherent results without stale state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Try starting five" }).click();
  for (const [index, task] of ["Inspect checkout", "Find the code", "Read the playbook"].entries()) {
    await page.locator(".task-options label").filter({ hasText: task }).click();
    const lineup = page.locator(`[data-lineup="${index}"]`);
    await expect(lineup).toBeVisible();
    await expect(lineup.locator(".starter")).toHaveCount(5);
    for (const starter of await lineup.locator(".starter").all()) {
      await starter.click();
      const detail = page.locator("[data-detail]:not([hidden])");
      await expect(detail.locator("[data-returned]")).toBeHidden();
      await detail.locator("[data-run]").click();
      await expect(detail.locator("[data-returned]")).toBeVisible();
      await expect(detail.locator("[data-returned] pre")).not.toBeEmpty();
      await expect(page.locator("roster-demo")).toHaveAttribute("data-called", "true");
    }
  }
  await page.locator(".task-options label").filter({ hasText: "Read the playbook" }).click();
  await page.locator('[data-lineup="2"] .starter').first().click();
  await page.locator("[data-detail]:not([hidden]) [data-run]").click();
  await expect(page.locator("[data-coach-note]")).toContainText("excluded from ratings");
  await expect(page.locator("[data-detail]:not([hidden]) .invocation-note")).toContainText("No scripts run");
  await audit(page);
});

test("native radio keyboard navigation updates the task and capability", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Try starting five" }).click();
  const task = page.locator('input[name="example-task"]').first();
  await task.focus();
  await task.press("ArrowRight");
  await expect(page.locator('[data-lineup="1"]')).toBeVisible();
  const starter = page.locator('[data-lineup="1"] input').first();
  await starter.focus();
  await starter.press("ArrowRight");
  await expect(page.locator('[data-detail="filesystem__search_files"]')).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-detail="filesystem__search_files"] [data-run]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-detail="filesystem__search_files"] [data-returned]')).toBeVisible();
});

test("theme preference persists between the homepage and documentation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Color theme").selectOption("dark");
  await page.getByRole("link", { name: "Docs", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Color theme").first().selectOption("light");
  await page.getByRole("link", { name: "Roster home" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("built docs search returns a useful result and restores focus", async ({ page }) => {
  await page.goto("/docs/introduction/");
  const trigger = page.getByRole("button", { name: /search/i }).first();
  await trigger.click();
  const search = page.getByRole("dialog", { name: "Search", exact: true }).getByRole("textbox", { name: "Search", exact: true });
  await search.fill("eject");
  await expect(page.locator(".pagefind-ui__result-link").first()).toBeVisible();
  await expect(page.locator(".pagefind-ui__results-area")).toContainText(/eject/i);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("copy commands and the agent prompt, with a usable denied-clipboard fallback", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "Copy setup prompt", exact: true }).click();
  await expect(page.locator('[data-label="Copy setup prompt"] [data-copy-label]')).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Do not enable telemetry");
  await page.goto("/docs/installation/");
  await page.locator(".expressive-code .copy button").first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("pnpm install --frozen-lockfile");
  await page.goto("/docs/agent-setup/");
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }); });
  await page.getByRole("button", { name: "Copy setup prompt", exact: true }).click();
  const fallback = page.getByRole("textbox", { name: "Select and copy this text" });
  await expect(fallback).toBeVisible();
  await expect(fallback).toBeFocused();
  await expect(fallback).toHaveValue(/Help me set up Roster/);
  await noOverflow(page);
});

test("mobile documentation menu uses the maintained navigation behavior", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/docs/introduction/");
  await page.getByRole("button", { name: /menu/i }).click();
  await page.getByRole("link", { name: "Clients, sync & eject", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/clients\/$/);
  await expect(page.getByRole("heading", { name: "Clients, sync & eject", exact: true })).toBeVisible();
  await noOverflow(page);
});

test("metadata does not invent an origin and the custom 404 works", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "/social.png");
  await page.goto("/docs/introduction/");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await page.goto("/a-page-that-does-not-exist/");
  await expect(page.getByRole("heading", { name: "Not in this lineup." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Roster" })).toHaveAttribute("href", "/");
});
