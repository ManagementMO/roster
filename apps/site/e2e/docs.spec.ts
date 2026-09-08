import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const guides = ["introduction", "installation", "agent-setup", "clients", "modes", "playbook", "learning", "failures", "commands", "configuration", "privacy", "troubleshooting", "methodology"];

for (const width of [320, 1440]) {
  test(`all guides are readable and keyboard-accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const guide of guides) {
      const response = await page.goto(`/docs/${guide}/`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.locator(".sl-markdown-content").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(results.violations.map(({ id, nodes }) => ({ guide, id, nodes: nodes.map((node) => ({ target: node.target, detail: node.failureSummary })) }))).toEqual([]);
    }
  });
}
