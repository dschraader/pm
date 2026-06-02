import type { Page } from "@playwright/test";

export const signIn = async (
  page: Page,
  username = "user",
  password = "password"
) => {
  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
};

export const waitForBoard = async (page: Page) => {
  await page.waitForSelector('[data-testid^="board-tab-"]');
};
