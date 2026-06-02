import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";
import { errorResponse, okResponse, seedBoard } from "@/test/fixtures";

const BOARD_ID = "board-default";
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const Harness = ({ initialBoard }: { initialBoard: BoardData | null }) => {
  const [board, setBoard] = useState<BoardData | null>(initialBoard);
  const [mutationError, setMutationError] = useState<string | null>(null);
  return (
    <KanbanBoard
      boardId={BOARD_ID}
      boardTitle="My Board"
      board={board}
      setBoard={setBoard}
      loadError={null}
      mutationError={mutationError}
      setMutationError={setMutationError}
    />
  );
};

const renamedBoard = (newTitle: string): BoardData => ({
  ...seedBoard,
  columns: seedBoard.columns.map((column) =>
    column.id === "col-backlog" ? { ...column, title: newTitle } : column
  ),
});

const boardWithoutCard1 = (): BoardData => {
  const remaining = Object.fromEntries(
    Object.entries(seedBoard.cards).filter(([id]) => id !== "card-1")
  );
  return {
    ...seedBoard,
    cards: remaining,
    columns: seedBoard.columns.map((column) =>
      column.id === "col-backlog"
        ? { ...column, cardIds: ["card-2"] }
        : column
    ),
  };
};

describe("KanbanBoard", () => {
  it("shows the loading state when no board is provided", () => {
    render(<Harness initialBoard={null} />);
    expect(screen.getByTestId("board-loading")).toBeInTheDocument();
  });

  it("renders the columns when given a board", () => {
    render(<Harness initialBoard={seedBoard} />);
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(5);
  });

  it("commits a column rename on blur via PUT", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(renamedBoard("Inbox")));

    render(<Harness initialBoard={seedBoard} />);

    const backlog = screen.getByTestId("column-col-backlog");
    const input = within(backlog).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Inbox");
    await userEvent.tab();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        `/api/boards/${BOARD_ID}/columns/col-backlog`,
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ title: "Inbox" }),
        })
      );
    });
  });

  it("reverts the column title when the rename request fails", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500));

    render(<Harness initialBoard={seedBoard} />);

    const backlog = screen.getByTestId("column-col-backlog");
    const input = within(backlog).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Inbox");
    await userEvent.tab();

    await screen.findByTestId("board-mutation-error");
    expect(input).toHaveValue("Backlog");
  });

  it("adds a card via POST and renders the server response", async () => {
    const newId = "card-new";
    const updated: BoardData = {
      ...seedBoard,
      cards: {
        ...seedBoard.cards,
        [newId]: { id: newId, title: "Brand new", details: "Notes" },
      },
      columns: seedBoard.columns.map((column) =>
        column.id === "col-backlog"
          ? { ...column, cardIds: [...column.cardIds, newId] }
          : column
      ),
    };
    fetchMock.mockResolvedValueOnce(okResponse(updated));

    render(<Harness initialBoard={seedBoard} />);
    const backlog = screen.getByTestId("column-col-backlog");

    await userEvent.click(
      within(backlog).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(backlog).getByPlaceholderText("Card title"),
      "Brand new"
    );
    await userEvent.type(
      within(backlog).getByPlaceholderText("Details"),
      "Notes"
    );
    await userEvent.click(
      within(backlog).getByRole("button", { name: /add card/i })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        `/api/boards/${BOARD_ID}/columns/col-backlog/cards`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ title: "Brand new", details: "Notes", due_date: null }),
        })
      );
    });
    expect(await within(backlog).findByText("Brand new")).toBeInTheDocument();
  });

  it("opens the edit modal when the pencil button is clicked", async () => {
    render(<Harness initialBoard={seedBoard} />);
    const backlog = screen.getByTestId("column-col-backlog");
    const card1 = within(backlog).getByTestId("card-card-1");

    await userEvent.hover(card1);
    await userEvent.click(within(card1).getByRole("button", { name: /edit align roadmap themes/i }));

    expect(screen.getByRole("dialog", { name: "Edit card" })).toBeInTheDocument();
    expect(screen.getByLabelText("Card title")).toHaveValue("Align roadmap themes");
  });

  it("saves card edits via PUT and closes the modal", async () => {
    const updated: BoardData = {
      ...seedBoard,
      cards: {
        ...seedBoard.cards,
        "card-1": { id: "card-1", title: "Updated title", details: "New details" },
      },
    };
    fetchMock.mockResolvedValueOnce(okResponse(updated));

    render(<Harness initialBoard={seedBoard} />);
    const backlog = screen.getByTestId("column-col-backlog");
    const card1 = within(backlog).getByTestId("card-card-1");

    await userEvent.hover(card1);
    await userEvent.click(within(card1).getByRole("button", { name: /edit align roadmap themes/i }));

    const titleInput = screen.getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated title");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        `/api/boards/${BOARD_ID}/cards/card-1`,
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ title: "Updated title", details: "...", due_date: null }),
        })
      );
    });
    expect(screen.queryByRole("dialog", { name: "Edit card" })).not.toBeInTheDocument();
    expect(await within(backlog).findByText("Updated title")).toBeInTheDocument();
  });

  it("deletes a card via DELETE", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(boardWithoutCard1()));

    render(<Harness initialBoard={seedBoard} />);
    const backlog = screen.getByTestId("column-col-backlog");

    await userEvent.click(
      within(backlog).getByRole("button", { name: /delete align roadmap themes/i })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        `/api/boards/${BOARD_ID}/cards/card-1`,
        expect.objectContaining({ method: "DELETE" })
      );
    });
    expect(within(backlog).queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });
});
