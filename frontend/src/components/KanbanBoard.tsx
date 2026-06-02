"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { moveCard as moveCardLocal, type BoardData } from "@/lib/kanban";
import * as api from "@/lib/api";

type KanbanBoardProps = {
  boardId: string;
  boardTitle: string;
  board: BoardData | null;
  setBoard: (next: BoardData) => void;
  loadError: string | null;
  mutationError: string | null;
  setMutationError: (msg: string | null) => void;
  onRenameBoard?: (boardId: string, title: string) => void;
  onDeleteBoard?: (boardId: string) => void;
  canDeleteBoard?: boolean;
  onAddColumn?: (boardId: string, title: string) => void;
};

const errorMessage = (err: unknown): string => {
  if (err instanceof api.ApiError) {
    return `Request failed (${err.status}). Changes were reverted.`;
  }
  return "Network error. Changes were reverted.";
};

const findCardLocation = (board: BoardData, cardId: string) => {
  for (const column of board.columns) {
    const index = column.cardIds.indexOf(cardId);
    if (index !== -1) {
      return { columnId: column.id, index };
    }
  }
  return null;
};

export const KanbanBoard = ({
  boardId,
  boardTitle,
  board,
  setBoard,
  loadError,
  mutationError,
  setMutationError,
  onRenameBoard,
  onDeleteBoard,
  canDeleteBoard,
  onAddColumn,
}: KanbanBoardProps) => {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [editingBoardTitle, setEditingBoardTitle] = useState(false);
  const [boardTitleDraft, setBoardTitleDraft] = useState("");
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const runMutation = useCallback(
    async (optimistic: BoardData, request: Promise<BoardData>) => {
      if (!board) return;
      const previous = board;
      setBoard(optimistic);
      setMutationError(null);
      try {
        const fromServer = await request;
        setBoard(fromServer);
      } catch (err) {
        setBoard(previous);
        setMutationError(errorMessage(err));
      }
    },
    [board, setBoard, setMutationError]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    if (!board || !over || active.id === over.id) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const nextColumns = moveCardLocal(board.columns, activeId, overId);
    if (nextColumns === board.columns) return;
    const optimistic: BoardData = { ...board, columns: nextColumns };
    const target = findCardLocation(optimistic, activeId);
    if (!target) return;
    runMutation(optimistic, api.moveCard(boardId, activeId, target.columnId, target.index));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    if (!board) return;
    const current = board.columns.find((column) => column.id === columnId);
    if (!current || current.title === title) return;
    const optimistic: BoardData = {
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    };
    runMutation(optimistic, api.renameColumn(boardId, columnId, title));
  };

  const handleAddCard = async (
    columnId: string,
    title: string,
    details: string
  ) => {
    if (!board) return;
    setMutationError(null);
    try {
      const fromServer = await api.createCard(
        boardId,
        columnId,
        title,
        details || "No details yet."
      );
      setBoard(fromServer);
    } catch (err) {
      setMutationError(errorMessage(err));
    }
  };

  const handleDeleteColumn = (columnId: string) => {
    if (!board) return;
    const optimistic: BoardData = {
      ...board,
      columns: board.columns.filter((col) => col.id !== columnId),
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([, card]) => {
          const col = board.columns.find((c) => c.id === columnId);
          return !col?.cardIds.includes(card.id);
        })
      ),
    };
    runMutation(optimistic, api.deleteColumn(boardId, columnId));
  };

  const handleAddColumn = async () => {
    const title = newColumnTitle.trim();
    if (!title || !board) return;
    setAddingColumn(false);
    setNewColumnTitle("");
    setMutationError(null);
    try {
      const fromServer = await api.addColumn(boardId, title);
      setBoard(fromServer);
      if (onAddColumn) onAddColumn(boardId, title);
    } catch (err) {
      setMutationError(errorMessage(err));
    }
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    if (!board) return;
    const optimistic: BoardData = {
      ...board,
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => id !== cardId)
      ),
      columns: board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    };
    runMutation(optimistic, api.deleteCard(boardId, cardId));
  };

  const handleBoardTitleBlur = () => {
    const title = boardTitleDraft.trim();
    setEditingBoardTitle(false);
    if (title && title !== boardTitle && onRenameBoard) {
      onRenameBoard(boardId, title);
    }
  };

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);
  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (loadError) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-6"
        data-testid="board-load-error"
      >
        <p className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          {loadError}
        </p>
      </div>
    );
  }

  if (!board) {
    return (
      <div
        className="flex min-h-screen items-center justify-center text-sm text-[var(--gray-text)]"
        data-testid="board-loading"
      >
        Loading board...
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none fixed left-0 top-0 -z-10 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none fixed bottom-0 right-0 -z-10 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-8">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Kanban Studio
              </p>
              {editingBoardTitle ? (
                <input
                  autoFocus
                  value={boardTitleDraft}
                  onChange={(e) => setBoardTitleDraft(e.target.value)}
                  onBlur={handleBoardTitleBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleBoardTitleBlur();
                    if (e.key === "Escape") setEditingBoardTitle(false);
                  }}
                  className="mt-3 w-full rounded-xl border border-[var(--primary-blue)] bg-white px-3 py-1.5 font-display text-3xl font-semibold text-[var(--navy-dark)] outline-none"
                  aria-label="Board title"
                />
              ) : (
                <h1
                  className="mt-3 cursor-text font-display text-4xl font-semibold text-[var(--navy-dark)] hover:text-[var(--primary-blue)]"
                  role="heading"
                  onClick={() => {
                    setBoardTitleDraft(boardTitle);
                    setEditingBoardTitle(true);
                  }}
                  title="Click to rename"
                >
                  {boardTitle}
                </h1>
              )}
            </div>
            <div className="flex items-start gap-3">
              {onDeleteBoard && canDeleteBoard && (
                <button
                  type="button"
                  onClick={() => onDeleteBoard(boardId)}
                  className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition hover:border-red-400 hover:text-red-600"
                  data-testid="delete-board-button"
                >
                  Delete board
                </button>
              )}
            </div>
          </div>
          {mutationError && (
            <p
              role="alert"
              data-testid="board-mutation-error"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {mutationError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
                <span className="ml-0.5 rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--gray-text)]">
                  {column.cardIds.length}
                </span>
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="-mx-6 overflow-x-auto px-6 pb-2">
            <section className="flex gap-5" style={{ minWidth: "max-content" }}>
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds
                    .map((cardId) => board.cards[cardId])
                    .filter(Boolean)}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  onDeleteColumn={handleDeleteColumn}
                />
              ))}

              {/* Add column inline form */}
              {addingColumn ? (
                <div className="flex w-[272px] shrink-0 flex-col gap-3 rounded-3xl border border-dashed border-[var(--primary-blue)] bg-[var(--surface-strong)] p-4">
                  <input
                    autoFocus
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddColumn();
                      if (e.key === "Escape") {
                        setAddingColumn(false);
                        setNewColumnTitle("");
                      }
                    }}
                    placeholder="Column title"
                    className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                    aria-label="New column title"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddColumn}
                      disabled={!newColumnTitle.trim()}
                      className="flex-1 rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      Add column
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingColumn(false);
                        setNewColumnTitle("");
                      }}
                      className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--primary-blue)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingColumn(true)}
                  className="flex w-[272px] shrink-0 items-center justify-center gap-2 rounded-3xl border border-dashed border-[var(--stroke)] bg-transparent py-8 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                  data-testid="add-column-button"
                >
                  + Add column
                </button>
              )}
            </section>
          </div>
          <DragOverlay>
            {activeCard ? (
              <KanbanCardPreview card={activeCard} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
};
