import { createContext } from "react";
import type { BoardData } from "@/lib/kanban";
import type { Mutation } from "@/lib/api";

export const RecentChangesContext = createContext<ReadonlySet<string>>(
  new Set()
);

export const computeChangedIds = (
  mutations: Mutation[],
  before: BoardData,
  after: BoardData
): Set<string> => {
  const ids = new Set<string>();
  for (const m of mutations) {
    switch (m.type) {
      case "rename_column":
        ids.add(m.column_id);
        break;
      case "edit_card":
      case "move_card":
      case "delete_card":
        ids.add(m.card_id);
        break;
      case "create_card": {
        const beforeIds = new Set(Object.keys(before.cards));
        for (const cardId of Object.keys(after.cards)) {
          if (!beforeIds.has(cardId)) ids.add(cardId);
        }
        break;
      }
    }
  }
  return ids;
};
