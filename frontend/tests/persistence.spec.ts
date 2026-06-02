import { expect, test } from "@playwright/test";
import { signIn, waitForBoard } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await waitForBoard(page);
  await expect(
    page.getByRole("heading", { name: "My Board" })
  ).toBeVisible();
});

test("renaming a column survives a reload", async ({ page }) => {
  const discovery = page.getByTestId("column-col-discovery");
  const titleInput = discovery.getByLabel("Column title");
  const unique = `Discovery ${Date.now()}`;

  await titleInput.fill(unique);
  await titleInput.blur();

  await expect(titleInput).toHaveValue(unique);

  await page.reload();
  await expect(
    page.getByTestId("column-col-discovery").getByLabel("Column title")
  ).toHaveValue(unique);
});

test("creating a card survives a reload", async ({ page }) => {
  const review = page.getByTestId("column-col-review");
  const unique = `Persisted card ${Date.now()}`;

  await review.getByRole("button", { name: /add a card/i }).click();
  await review.getByPlaceholder("Card title").fill(unique);
  await review.getByPlaceholder("Details").fill("Lives on the server now.");
  await review.getByRole("button", { name: /add card/i }).click();

  await expect(review.getByText(unique)).toBeVisible();

  await page.reload();
  await expect(
    page.getByTestId("column-col-review").getByText(unique)
  ).toBeVisible();
});

test("deleting a card survives a reload", async ({ page }) => {
  // Create a uniquely-named card we can safely delete without affecting other tests.
  const progress = page.getByTestId("column-col-progress");
  const unique = `Delete me ${Date.now()}`;

  await progress.getByRole("button", { name: /add a card/i }).click();
  await progress.getByPlaceholder("Card title").fill(unique);
  await progress.getByRole("button", { name: /add card/i }).click();
  await expect(progress.getByText(unique)).toBeVisible();

  // Now delete it. Use getByLabel because dnd-kit gives the article role="button"
  // too, so getByRole would also match the card wrapper.
  await progress.getByLabel(`Delete ${unique}`).click();
  await expect(progress.getByText(unique)).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByTestId("column-col-progress").getByText(unique)
  ).toHaveCount(0);
});

test("moving a card survives a reload", async ({ page }) => {
  // Use card-2 to avoid colliding with kanban.spec which drags card-1.
  const card = page.getByTestId("card-card-2");
  const targetColumn = page.getByTestId("column-col-done");

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
    columnBox.y + 200,
    { steps: 12 }
  );
  await page.mouse.up();

  await expect(targetColumn.getByTestId("card-card-2")).toBeVisible();

  await page.reload();
  await expect(
    page.getByTestId("column-col-done").getByTestId("card-card-2")
  ).toBeVisible();
});

test("adding a column survives a reload", async ({ page }) => {
  const unique = `Column ${Date.now()}`;
  await page.getByTestId("add-column-button").click();
  await page.getByLabel("New column title").fill(unique);
  await page.getByRole("button", { name: /add column/i }).click();
  await expect(page.getByText(unique)).toBeVisible();

  await page.reload();
  await expect(page.getByText(unique)).toBeVisible();
});
