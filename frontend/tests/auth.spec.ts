import { expect, test } from "@playwright/test";
import { signIn, waitForBoard } from "./helpers";

test("bad credentials show an error", async ({ page }) => {
  await signIn(page, "user", "wrong");
  const form = page.getByRole("form", { name: "Sign in" });
  await expect(form.getByRole("alert")).toHaveText("Invalid credentials");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("good credentials show the board", async ({ page }) => {
  await signIn(page);
  await waitForBoard(page);
  await expect(page.getByRole("heading", { name: "My Board" })).toBeVisible();
});

test("logout returns to login screen", async ({ page }) => {
  await signIn(page);
  await waitForBoard(page);
  await expect(page.getByRole("heading", { name: "My Board" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("session persists across reload", async ({ page }) => {
  await signIn(page);
  await waitForBoard(page);

  await page.reload();
  await expect(page.getByRole("heading", { name: "My Board" })).toBeVisible();
});

test("direct visit without session shows login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("register a new user and sign in", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("switch-to-register").click();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();

  const unique = `testuser${Date.now()}`;
  await page.getByLabel("Username").fill(unique);
  await page.getByLabel("Password").fill("password123");
  await page.getByLabel("Confirm password").fill("password123");
  await page.getByRole("button", { name: /create account/i }).click();

  await waitForBoard(page);
  await expect(page.getByTestId("username-display")).toContainText(unique);
});
