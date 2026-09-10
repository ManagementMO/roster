import { expect, test } from "@playwright/test";

test("the compact hero is centered and explains local, adaptive MCP routing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Local routing.Built to adapt.", { timeout: 2000 });
  await expect(page.locator(".hero-description")).toContainText("MCP tools and skills");
  const geometry = await page.locator(".hero-content").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { center: box.x + box.width / 2, viewport: document.documentElement.clientWidth, alignment: getComputedStyle(element).textAlign };
  });
  expect(Math.abs(geometry.center - geometry.viewport / 2)).toBeLessThan(2);
  expect(geometry.alignment).toBe("center");
  await expect(page.getByRole("link", { name: "Agent prompt", exact: true })).toHaveAttribute("href", "#agent-setup");
});

test("colorful logo depth motion runs automatically and pauses outside the viewport", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const stage = page.locator("logo-depth");
  await expect(stage).toHaveAttribute("data-motion", "running");
  expect(await stage.locator("img").count()).toBeGreaterThanOrEqual(16);
  const sources = await stage.locator("img").evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  expect(new Set(sources).size).toBeGreaterThanOrEqual(14);
  for (const vendor of ["GitLab", "Atlassian", "MongoDB"]) await expect(stage.locator(`[data-vendor="${vendor}"] img`)).toHaveCount(1);
  expect(await stage.locator("img").evaluateAll((images) => images.every((image) => getComputedStyle(image).filter === "none"))).toBe(true);
  const logo = stage.locator(".depth-logo").first();
  const position = () => logo.evaluate((element) => getComputedStyle(element).transform);
  const first = await position();
  await expect.poll(position).not.toBe(first);
  await expect(stage.getByRole("button")).toHaveCount(0);
  await page.locator(".setup-section").scrollIntoViewIfNeeded();
  await expect(stage).toHaveAttribute("data-motion", "paused");
  await page.locator(".hero").scrollIntoViewIfNeeded();
  await expect(stage).toHaveAttribute("data-motion", "running");
});

test("reduced motion retains a static full-color composition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("logo-depth")).toHaveAttribute("data-motion", "still");
  await expect(page.locator("logo-depth").getByRole("button")).toHaveCount(0);
  expect(await page.locator(".depth-logo").evaluateAll((logos) => logos.every((logo) => getComputedStyle(logo).animationName === "none"))).toBe(true);
});

for (const width of [390, 1440]) {
  test(`hero motion settles within five seconds and stays stopped at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const stage = page.locator("logo-depth");
    await expect(stage).toHaveAttribute("data-motion", "running");
    await expect(stage).toHaveAttribute("data-motion", "settled", { timeout: 5000 });
    await expect(stage.getByRole("button")).toHaveCount(0);
    const positions = () => stage.locator(".depth-logo").evaluateAll((logos) => logos.map((logo) => getComputedStyle(logo).transform));
    const settled = await positions();
    await page.waitForTimeout(250);
    expect(await positions()).toEqual(settled);
    expect(await stage.evaluate((element) => element.getAnimations({ subtree: true }).every((animation) => animation.playState === "paused"))).toBe(true);
    await page.locator(".setup-section").scrollIntoViewIfNeeded();
    await page.locator(".hero").scrollIntoViewIfNeeded();
    await expect(stage).toHaveAttribute("data-motion", "settled");
    expect(await positions()).toEqual(settled);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(stage).toHaveAttribute("data-motion", "still");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(stage).toHaveAttribute("data-motion", "settled");
    expect(await stage.evaluate((element) => element.getAnimations({ subtree: true }).every((animation) => animation.playState !== "running"))).toBe(true);
  });
}
