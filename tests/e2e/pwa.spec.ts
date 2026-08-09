import { expect, test } from "@playwright/test";

test("manifest and service worker are ready without an automatic permission prompt", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Notification.requestPermission.bind(Notification);
    Object.defineProperty(window, "__notificationPermissionRequests", { value: 0, writable: true });
    Notification.requestPermission = (...args) => {
      (window as typeof window & { __notificationPermissionRequests: number }).__notificationPermissionRequests += 1;
      return original(...args);
    };
  });
  await page.goto("/");
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as { display: string; start_url: string; icons: Array<{ purpose?: string }> };
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);

  const scriptUrl = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.scriptURL ?? "";
  });
  expect(scriptUrl).toMatch(/\/sw\.js$/);

  await page.getByRole("link", { name: "설정" }).click();
  await expect(page.getByRole("button", { name: "알림 켜기" })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { __notificationPermissionRequests: number }).__notificationPermissionRequests)).toBe(0);
});
