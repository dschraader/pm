import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("bad credentials show an error", async ({ page }) => {
  await signIn(page, "user", "wrong");
  const form = page.getByRole("form", { name: "Sign in" });
  await expect(form.getByRole("alert")).toHaveText("Invalid credentials");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("good credentials show the board", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("logout returns to login screen", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("session persists across reload", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("direct visit without session shows login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
