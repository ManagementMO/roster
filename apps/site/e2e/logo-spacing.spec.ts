import { expect, test } from "@playwright/test";

for (const width of [320, 390, 768, 1440, 1920]) {
  for (const motion of ["no-preference", "reduce"] as const) {
    test(`logo paths stay separated at ${width}px (${motion})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto("/");
      await expect(page.locator("logo-depth")).toHaveAttribute("data-motion", motion === "reduce" ? "still" : "running");
      const collisions = await page.locator(".logo-depth-scene").evaluate(async (scene) => {
        const animations = scene.getAnimations({ subtree: true });
        animations.forEach((animation) => { animation.pause(); });
        await Promise.all(animations.map((animation) => animation.ready));
        const bounds = scene.getBoundingClientRect();
        const collisions: { time: number; first: string | undefined; second: string | undefined }[] = [];
        for (let time = 0; time <= (animations.length ? 60000 : 0); time += 1000) {
          animations.forEach((animation) => { animation.currentTime = time; });
          const logos = [...scene.querySelectorAll<HTMLImageElement>("img")].flatMap((image) => {
            const parent = image.closest<HTMLElement>(".depth-logo")!;
            const rect = image.getBoundingClientRect();
            if (!rect.width || Number(getComputedStyle(parent).opacity) < 0.01) return [];
            const left = Math.max(rect.left, bounds.left);
            const right = Math.min(rect.right, bounds.right);
            const top = Math.max(rect.top, bounds.top);
            const bottom = Math.min(rect.bottom, bounds.bottom);
            return right > left && bottom > top ? [{ left, right, top, bottom, name: parent.dataset.vendor }] : [];
          });
          for (let first = 0; first < logos.length; first++) {
            for (let second = first + 1; second < logos.length; second++) {
              const a = logos[first]!;
              const b = logos[second]!;
              if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) collisions.push({ time, first: a.name, second: b.name });
            }
          }
        }
        return collisions.slice(0, 10);
      });
      expect(collisions).toEqual([]);
    });
  }
}
