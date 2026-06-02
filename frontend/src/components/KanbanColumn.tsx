"use client";

import { useContext, useEffect, useState } from "react";
import clsx from "clsx";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { RecentChangesContext } from "@/lib/highlights";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onEditCard: (cardId: string) => void;
  onDeleteColumn?: (columnId: string) => void;
};

const TrashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const GripIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="9" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="19" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="19" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onDeleteColumn,
}: KanbanColumnProps) => {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });
  const [draftTitle, setDraftTitle] = useState(column.title);
  const recent = useContext(RecentChangesContext);
  const isRecent = recent.has(column.id);

  useEffect(() => {
    setDraftTitle(column.title);
  }, [column.title]);

  const commitTitle = () => {
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === column.title) {
      setDraftTitle(column.title);
      return;
    }
    onRename(column.id, trimmed);
  };

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={clsx(
        "flex w-[272px] shrink-0 flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isDragging && "opacity-50 ring-2 ring-[var(--primary-blue)]",
        !isDragging && isRecent && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
      data-recent={isRecent ? "true" : undefined}
    >
      <div className="group/col flex items-center gap-2 pb-3">
        {/* Drag handle for column reordering */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab rounded p-1 text-[var(--gray-text)] opacity-0 transition hover:text-[var(--navy-dark)] group-hover/col:opacity-100 active:cursor-grabbing"
          aria-label={`Drag to reorder column ${column.title}`}
          data-testid={`drag-handle-${column.id}`}
        >
          <GripIcon />
        </button>
        <div className="h-1.5 w-6 rounded-full bg-[var(--accent-yellow)]" />
        <input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              setDraftTitle(column.title);
              event.currentTarget.blur();
            }
          }}
          className="flex-1 bg-transparent font-display text-base font-semibold text-[var(--navy-dark)] outline-none"
          aria-label="Column title"
        />
        <span className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--gray-text)]">
          {cards.length}
        </span>
        {onDeleteColumn && (
          <button
            type="button"
            onClick={() => onDeleteColumn(column.id)}
            className="shrink-0 rounded-full p-1.5 text-[var(--gray-text)] opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover/col:opacity-100"
            aria-label={`Delete column ${column.title}`}
            data-testid={`delete-column-${column.id}`}
          >
            <TrashIcon />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
