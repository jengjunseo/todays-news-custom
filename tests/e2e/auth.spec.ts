import { expect, test } from "@playwright/test";

test("personal login and logout", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("비밀번호").fill("demo");
  await page.getByRole("button", { name: "브리핑 열기" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /신문/ })).toBeVisible();

  await page.getByRole("link", { name: "설정" }).click();
  await Promise.all([
    page.waitForURL(/\/login$/, { timeout: 15_000 }),
    page.getByRole("button", { name: "로그아웃" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "다시 오셨네요" })).toBeVisible();
});
