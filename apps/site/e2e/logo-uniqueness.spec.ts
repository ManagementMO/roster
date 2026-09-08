import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  for (const motion of ["no-preference", "reduce"] as const) {
    test(`${theme}, ${motion}: every hero brand has exactly one instance`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: motion });
      await page.goto("/");
      const stage = page.locator("logo-depth");
      await expect(stage).toHaveAttribute("data-motion", motion === "reduce" ? "still" : "running");
      const logos = stage.locator(".depth-logo");
      const brands = await logos.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-vendor")));
      expect(brands.length).toBe(25);
      expect(new Set(brands).size).toBe(brands.length);
      const visibleVariants = await logos.evaluateAll((elements) => elements.map((element) => [...element.querySelectorAll("img")].filter((image) => getComputedStyle(image).display !== "none").length));
      expect(visibleVariants.every((count) => count === 1)).toBe(true);
      if (motion === "no-preference") {
        await page.getByRole("button", { name: "Pause logo motion" }).click();
        await expect(stage).toHaveAttribute("data-motion", "paused");
        expect(await logos.count()).toBe(brands.length);
      }
    });
  }
}
