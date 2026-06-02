"use client";

import { useContext, useEffect, useState } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
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
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
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

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex w-[272px] shrink-0 flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        (isOver || isRecent) && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
      data-recent={isRecent ? "true" : undefined}
    >
      <div className="flex items-center gap-3 pb-3">
        <div className="h-1.5 w-8 rounded-full bg-[var(--accent-yellow)]" />
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
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
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
