import type { BoardData } from "@/lib/kanban";
import type { Board } from "@/lib/api";

export const seedBoard: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    {
      id: "col-progress",
      title: "In Progress",
      cardIds: ["card-4", "card-5"],
    },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": { id: "card-1", title: "Align roadmap themes", details: "..." },
    "card-2": { id: "card-2", title: "Gather customer signals", details: "..." },
    "card-3": { id: "card-3", title: "Prototype analytics view", details: "..." },
    "card-4": { id: "card-4", title: "Refine status language", details: "..." },
    "card-5": { id: "card-5", title: "Design card layout", details: "..." },
    "card-6": { id: "card-6", title: "QA micro-interactions", details: "..." },
    "card-7": { id: "card-7", title: "Ship marketing page", details: "..." },
    "card-8": { id: "card-8", title: "Close onboarding sprint", details: "..." },
  },
};

export const seedBoardSummary: Board = {
  id: "board-default",
  title: "My Board",
  created_at: "2026-01-01T00:00:00",
};

export const okResponse = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => data }) as Response;

export const createdResponse = (data: unknown) =>
  ({ ok: true, status: 201, json: async () => data }) as Response;

export const errorResponse = (status: number) =>
  ({
    ok: false,
    status,
    json: async () => ({ detail: `Error ${status}` }),
  }) as Response;
