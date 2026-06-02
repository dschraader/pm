import { expect, test } from "@playwright/test";
import { signIn, waitForBoard } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await waitForBoard(page);
  await expect(page.getByRole("heading", { name: "My Board" })).toBeVisible();
});

test("loads the kanban board", async ({ page }) => {
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const unique = `Playwright card ${Date.now()}`;
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill(unique);
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText(unique)).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("adds a new column", async ({ page }) => {
  await page.getByTestId("add-column-button").click();
  await page.getByLabel("New column title").fill("Blocked");
  await page.getByRole("button", { name: /add column/i }).click();
  await expect(page.getByTestId(/^column-col-/)).toHaveCount(6);
  await expect(page.getByText("Blocked")).toBeVisible();
});
