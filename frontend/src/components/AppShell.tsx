"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  fetchBoard,
  fetchMe,
  listBoards,
  createBoard,
  deleteBoard,
  renameBoard,
  logout as apiLogout,
} from "@/lib/api";
import type { Board } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { RecentChangesContext } from "@/lib/highlights";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; username: string };

const errorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    return `Request failed (${err.status}).`;
  }
  return "Network error.";
};

export const AppShell = () => {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [recentlyChanged, setRecentlyChanged] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");

  useEffect(() => {
    fetchMe()
      .then((me) => setAuth({ status: "signed-in", username: me.username }))
      .catch(() => setAuth({ status: "signed-out" }));
  }, []);

  useEffect(() => {
    if (auth.status !== "signed-in") return;
    listBoards().then((data) => {
      setBoards(data);
      if (data.length > 0) setSelectedBoardId(data[0].id);
    });
  }, [auth.status]);

  useEffect(() => {
    if (!selectedBoardId) return;
    let active = true;
    setBoard(null);
    setLoadError(null);
    fetchBoard(selectedBoardId)
      .then((data) => {
        if (active) setBoard(data);
      })
      .catch((err) => {
        if (active) setLoadError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [selectedBoardId]);

  useEffect(() => {
    if (recentlyChanged.size === 0) return;
    const timer = setTimeout(() => setRecentlyChanged(new Set()), 2000);
    return () => clearTimeout(timer);
  }, [recentlyChanged]);

  const handleLogout = useCallback(async () => {
    await apiLogout();
    setAuth({ status: "signed-out" });
    setBoards([]);
    setSelectedBoardId(null);
    setBoard(null);
    setLoadError(null);
    setMutationError(null);
  }, []);

  const handleCreateBoard = useCallback(async () => {
    const title = newBoardTitle.trim();
    if (!title) return;
    setCreatingBoard(false);
    setNewBoardTitle("");
    try {
      const newBoard = await createBoard(title);
      setBoards((prev) => [...prev, newBoard]);
      setSelectedBoardId(newBoard.id);
    } catch {
      setMutationError("Failed to create board.");
    }
  }, [newBoardTitle]);

  const handleDeleteBoard = useCallback(
    async (boardId: string) => {
      if (boards.length <= 1) {
        setMutationError("You must have at least one board.");
        return;
      }
      try {
        await deleteBoard(boardId);
        const remaining = boards.filter((b) => b.id !== boardId);
        setBoards(remaining);
        if (selectedBoardId === boardId) {
          setSelectedBoardId(remaining[0]?.id ?? null);
        }
      } catch {
        setMutationError("Failed to delete board.");
      }
    },
    [boards, selectedBoardId]
  );

  const handleRenameBoard = useCallback(
    async (boardId: string, title: string) => {
      try {
        const updated = await renameBoard(boardId, title);
        setBoards((prev) => prev.map((b) => (b.id === boardId ? updated : b)));
      } catch {
        setMutationError("Failed to rename board.");
      }
    },
    []
  );

  if (auth.status === "loading") {
    return (
      <div
        className="flex min-h-screen items-center justify-center text-sm text-[var(--gray-text)]"
        data-testid="app-loading"
      >
        Loading...
      </div>
    );
  }

  if (auth.status === "signed-out") {
    return (
      <LoginForm
        onSuccess={(username) => setAuth({ status: "signed-in", username })}
      />
    );
  }

  return (
    <RecentChangesContext.Provider value={recentlyChanged}>
      <div className={sidebarOpen ? "pr-[380px]" : ""}>
        {/* Board selector bar */}
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--stroke)] bg-white/95 px-6 py-2 backdrop-blur">
          <span className="mr-2 hidden text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)] sm:block">
            Boards
          </span>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {boards.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBoardId(b.id)}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                  b.id === selectedBoardId
                    ? "border-[var(--primary-blue)] bg-[var(--primary-blue)] text-white"
                    : "border-[var(--stroke)] bg-white text-[var(--navy-dark)] hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                }`}
                data-testid={`board-tab-${b.id}`}
              >
                {b.title}
              </button>
            ))}

            {creatingBoard ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateBoard();
                }}
              >
                <input
                  autoFocus
                  value={newBoardTitle}
                  onChange={(e) => setNewBoardTitle(e.target.value)}
                  placeholder="Board name"
                  className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  aria-label="New board name"
                />
                <button
                  type="submit"
                  disabled={!newBoardTitle.trim()}
                  className="rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingBoard(false);
                    setNewBoardTitle("");
                  }}
                  className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--primary-blue)]"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreatingBoard(true)}
                className="rounded-full border border-dashed border-[var(--stroke)] px-4 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                data-testid="create-board-button"
              >
                + New board
              </button>
            )}
          </div>

          {/* User + logout */}
          <div className="ml-auto flex items-center gap-3 pl-4">
            <span className="hidden text-xs font-semibold text-[var(--gray-text)] sm:block" data-testid="username-display">
              {auth.status === "signed-in" ? auth.username : ""}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log out
            </button>
          </div>
        </div>

        {selectedBoardId && (
          <KanbanBoard
            boardId={selectedBoardId}
            boardTitle={boards.find((b) => b.id === selectedBoardId)?.title ?? ""}
            board={board}
            setBoard={setBoard}
            loadError={loadError}
            mutationError={mutationError}
            setMutationError={setMutationError}
            onRenameBoard={handleRenameBoard}
            onDeleteBoard={handleDeleteBoard}
            canDeleteBoard={boards.length > 1}
          />
        )}
      </div>
      {selectedBoardId && (
        <ChatSidebar
          boardId={selectedBoardId}
          board={board}
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          onBoardUpdate={(next, mutationsApplied) => {
            if (board) {
              setRecentlyChanged(mutationsApplied(board, next));
            }
            setBoard(next);
          }}
        />
      )}
    </RecentChangesContext.Provider>
  );
};
