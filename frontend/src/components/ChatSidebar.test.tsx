import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSidebar } from "@/components/ChatSidebar";
import { errorResponse, okResponse, seedBoard } from "@/test/fixtures";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const historyEmpty = () => okResponse({ messages: [] });

const historyWith = (messages: { role: string; content: string }[]) =>
  okResponse({
    messages: messages.map((m) => ({
      ...m,
      created_at: "2026-05-31 12:00:00",
    })),
  });

describe("ChatSidebar", () => {
  it("loads chat history on mount", async () => {
    fetchMock.mockResolvedValueOnce(
      historyWith([
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ])
    );

    render(<ChatSidebar board={seedBoard} onBoardUpdate={vi.fn()} />);

    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(screen.getByText("hi there")).toBeInTheDocument();
  });

  it("shows an empty-state message when there is no history", async () => {
    fetchMock.mockResolvedValueOnce(historyEmpty());
    render(<ChatSidebar board={seedBoard} onBoardUpdate={vi.fn()} />);
    expect(
      await screen.findByText(/no messages yet/i)
    ).toBeInTheDocument();
  });

  it("sends a message on Enter, optimistically appends user message, then renders the reply", async () => {
    fetchMock
      .mockResolvedValueOnce(historyEmpty())
      .mockResolvedValueOnce(
        okResponse({
          reply: "Did it.",
          appliedMutations: [],
          board: seedBoard,
        })
      );

    const onBoardUpdate = vi.fn();
    render(<ChatSidebar board={seedBoard} onBoardUpdate={onBoardUpdate} />);

    const textarea = await screen.findByLabelText("Chat message");
    await userEvent.type(textarea, "Move card 1 to Done");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/ai/chat",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ message: "Move card 1 to Done", board_id: null }),
        })
      );
    });

    expect(
      await screen.findByText("Did it.")
    ).toBeInTheDocument();
    expect(onBoardUpdate).toHaveBeenCalled();
  });

  it("Shift+Enter inserts a newline rather than sending", async () => {
    fetchMock.mockResolvedValueOnce(historyEmpty());

    render(<ChatSidebar board={seedBoard} onBoardUpdate={vi.fn()} />);
    const textarea = (await screen.findByLabelText(
      "Chat message"
    )) as HTMLTextAreaElement;
    await userEvent.type(textarea, "line one");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await userEvent.type(textarea, "line two");

    expect(textarea.value).toBe("line one\nline two");
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the history fetch
  });

  it("disables the textarea and Send button while a request is in flight", async () => {
    let resolveSend: (value: Response) => void = () => {};
    fetchMock
      .mockResolvedValueOnce(historyEmpty())
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSend = resolve;
          })
      );

    render(<ChatSidebar board={seedBoard} onBoardUpdate={vi.fn()} />);
    const textarea = (await screen.findByLabelText(
      "Chat message"
    )) as HTMLTextAreaElement;
    await userEvent.type(textarea, "hi");
    const sendButton = screen.getByRole("button", { name: /send/i });
    await userEvent.click(sendButton);

    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();

    resolveSend(
      okResponse({ reply: "done", appliedMutations: [], board: seedBoard })
    );

    await waitFor(() => expect(textarea).not.toBeDisabled());
  });

  it("shows an error and reverts the optimistic message on failure", async () => {
    fetchMock
      .mockResolvedValueOnce(historyEmpty())
      .mockResolvedValueOnce(errorResponse(502));

    render(<ChatSidebar board={seedBoard} onBoardUpdate={vi.fn()} />);
    const textarea = await screen.findByLabelText("Chat message");
    await userEvent.type(textarea, "anything");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("chat-error")).toBeInTheDocument();
    expect(screen.queryByText("anything")).not.toBeInTheDocument();
  });

  it("calls onBoardUpdate with the server-returned board on success", async () => {
    const newBoard = {
      ...seedBoard,
      columns: seedBoard.columns.map((c) =>
        c.id === "col-backlog" ? { ...c, title: "Inbox" } : c
      ),
    };
    fetchMock
      .mockResolvedValueOnce(historyEmpty())
      .mockResolvedValueOnce(
        okResponse({
          reply: "Renamed.",
          appliedMutations: [
            { type: "rename_column", column_id: "col-backlog", title: "Inbox" },
          ],
          board: newBoard,
        })
      );

    const onBoardUpdate = vi.fn();
    render(<ChatSidebar board={seedBoard} onBoardUpdate={onBoardUpdate} />);
    const textarea = await screen.findByLabelText("Chat message");
    await userEvent.type(textarea, "rename");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(onBoardUpdate).toHaveBeenCalled());
    const [boardArg, diffFn] = onBoardUpdate.mock.calls[0];
    expect(boardArg).toEqual(newBoard);
    expect(diffFn(seedBoard, newBoard)).toContain("col-backlog");
  });
});
