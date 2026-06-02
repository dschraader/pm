import { expect, test } from "@playwright/test";
import { signIn, waitForBoard } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await waitForBoard(page);
  await expect(page.getByRole("heading", { name: "My Board" })).toBeVisible();
});

test("sidebar renders empty state and accepts a chat turn that moves a card", async ({
  page,
}) => {
  // Intercept the chat endpoint and return a synthetic response that moves
  // card-1 from col-backlog to col-done.
  await page.route("**/api/ai/chat", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    // Build a "moved" board that mirrors what the real backend would do.
    const movedBoard = {
      columns: [
        { id: "col-backlog", title: "Backlog", cardIds: ["card-2"] },
        { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
        {
          id: "col-progress",
          title: "In Progress",
          cardIds: ["card-4", "card-5"],
        },
        { id: "col-review", title: "Review", cardIds: ["card-6"] },
        {
          id: "col-done",
          title: "Done",
          cardIds: ["card-1", "card-7", "card-8"],
        },
      ],
      cards: {
        "card-1": {
          id: "card-1",
          title: "Align roadmap themes",
          details: "Draft quarterly themes with impact statements and metrics.",
        },
        "card-2": {
          id: "card-2",
          title: "Gather customer signals",
          details: "Review support tags, sales notes, and churn feedback.",
        },
        "card-3": {
          id: "card-3",
          title: "Prototype analytics view",
          details: "Sketch initial dashboard layout and key drill-downs.",
        },
        "card-4": {
          id: "card-4",
          title: "Refine status language",
          details: "Standardize column labels and tone across the board.",
        },
        "card-5": {
          id: "card-5",
          title: "Design card layout",
          details: "Add hierarchy and spacing for scanning dense lists.",
        },
        "card-6": {
          id: "card-6",
          title: "QA micro-interactions",
          details: "Verify hover, focus, and loading states.",
        },
        "card-7": {
          id: "card-7",
          title: "Ship marketing page",
          details: "Final copy approved and asset pack delivered.",
        },
        "card-8": {
          id: "card-8",
          title: "Close onboarding sprint",
          details: "Document release notes and share internally.",
        },
      },
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: `Moved card-1 to Done. You said: ${body.message}`,
        appliedMutations: [
          {
            type: "move_card",
            card_id: "card-1",
            to_column_id: "col-done",
            to_index: 0,
          },
        ],
        board: movedBoard,
      }),
    });
  });

  const sidebar = page.getByTestId("chat-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText(/no messages yet/i)).toBeVisible();

  const composer = sidebar.getByLabel("Chat message");
  await composer.fill("Move card-1 to Done");
  await sidebar.getByRole("button", { name: /send/i }).click();

  // Sidebar shows the AI reply.
  await expect(
    sidebar.getByText(/Moved card-1 to Done/)
  ).toBeVisible();

  // The card visibly moves without a manual refresh.
  await expect(
    page.getByTestId("column-col-done").getByTestId("card-card-1")
  ).toBeVisible();
  await expect(
    page.getByTestId("column-col-backlog").getByTestId("card-card-1")
  ).toHaveCount(0);

  // The moved card briefly shows the highlight ring.
  await expect(page.getByTestId("card-card-1")).toHaveAttribute(
    "data-recent",
    "true"
  );
});

test("sidebar can be collapsed and reopened", async ({ page }) => {
  await expect(page.getByTestId("chat-sidebar")).toBeVisible();
  await page.getByRole("button", { name: "Collapse AI chat" }).click();
  await expect(page.getByTestId("chat-sidebar")).toHaveCount(0);
  await expect(page.getByTestId("chat-sidebar-open")).toBeVisible();
  await page.getByTestId("chat-sidebar-open").click();
  await expect(page.getByTestId("chat-sidebar")).toBeVisible();
});
