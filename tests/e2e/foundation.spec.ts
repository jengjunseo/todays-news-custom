import { expect, test } from "@playwright/test";

const routes = ["/", "/archive", "/insights", "/settings", "/login", "/offline"];

test.use({ viewport: { width: 360, height: 800 } });

test("foundation routes render without horizontal overflow", async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("nav[aria-label='주요 메뉴']")).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }
});
