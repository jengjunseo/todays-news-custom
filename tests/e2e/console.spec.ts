import { expect, test } from "@playwright/test";

test("primary routes have no browser errors or horizontal overflow", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  for (const route of ["/", "/archive", "/insights", "/settings", "/login", "/offline"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  }
  expect(errors).toEqual([]);
});
