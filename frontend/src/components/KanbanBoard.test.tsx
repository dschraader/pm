import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";
import { errorResponse, okResponse, seedBoard } from "@/test/fixtures";

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
        "/api/board/columns/col-backlog",
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
        "/api/board/columns/col-backlog/cards",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ title: "Brand new", details: "Notes" }),
        })
      );
    });
    expect(await within(backlog).findByText("Brand new")).toBeInTheDocument();
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
        "/api/board/cards/card-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
    expect(within(backlog).queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });
});
