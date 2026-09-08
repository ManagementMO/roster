import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: neutral interface roles do not become a brand-color wash`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/");
    const colors = await page.evaluate(() => {
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      const neutral = (value: string) => {
        const channels = value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        return Math.max(...channels) - Math.min(...channels);
      };
      return {
        heading: style("h1").color,
        secondLine: style("h1 > span").color,
        chroma: {
          page: neutral(style("body").backgroundColor),
          primaryAction: neutral(style(".button-primary").backgroundColor),
          surface: neutral(style(".local-machine").backgroundColor),
          coachIcon: neutral(style(".coach-knowledge").color),
          playbookIcon: neutral(style(".playbook-knowledge").color),
        },
      };
    });
    expect(colors.secondLine).toBe(colors.heading);
    for (const [role, chroma] of Object.entries(colors.chroma)) expect(chroma, role).toBeLessThanOrEqual(16);
    expect(await page.locator(".local-machine img.vendor-mark").evaluateAll((images) => images.every((image) => getComputedStyle(image).filter === "none"))).toBe(true);
  });
}
