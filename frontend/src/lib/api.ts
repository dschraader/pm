import type { BoardData } from "@/lib/kanban";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const json = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new ApiError(response.status, `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

export type Me = { username: string };
export type Board = { id: string; title: string; created_at: string };

export const fetchMe = () => json<Me>("/api/me");

export const login = (username: string, password: string) =>
  json<Me>("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const register = (username: string, password: string) =>
  json<Me>("/api/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const logout = () =>
  json<{ ok: true }>("/api/logout", { method: "POST" });

export const listBoards = () => json<Board[]>("/api/boards");

export const createBoard = (title: string) =>
  json<Board>("/api/boards", {
    method: "POST",
    body: JSON.stringify({ title }),
  });

export const renameBoard = (boardId: string, title: string) =>
  json<Board>(`/api/boards/${encodeURIComponent(boardId)}`, {
    method: "PUT",
    body: JSON.stringify({ title }),
  });

export const deleteBoard = (boardId: string) =>
  json<{ ok: true }>(`/api/boards/${encodeURIComponent(boardId)}`, {
    method: "DELETE",
  });

export const fetchBoard = (boardId: string) =>
  json<BoardData>(`/api/boards/${encodeURIComponent(boardId)}`);

export const reorderColumns = (boardId: string, columnIds: string[]) =>
  json<BoardData>(`/api/boards/${encodeURIComponent(boardId)}/columns/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ column_ids: columnIds }),
  });

export const addColumn = (boardId: string, title: string) =>
  json<BoardData>(`/api/boards/${encodeURIComponent(boardId)}/columns`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });

export const deleteColumn = (boardId: string, columnId: string) =>
  json<BoardData>(
    `/api/boards/${encodeURIComponent(boardId)}/columns/${encodeURIComponent(columnId)}`,
    { method: "DELETE" }
  );

export const renameColumn = (boardId: string, columnId: string, title: string) =>
  json<BoardData>(
    `/api/boards/${encodeURIComponent(boardId)}/columns/${encodeURIComponent(columnId)}`,
    { method: "PUT", body: JSON.stringify({ title }) }
  );

export const createCard = (
  boardId: string,
  columnId: string,
  title: string,
  details: string,
  dueDate?: string | null
) =>
  json<BoardData>(
    `/api/boards/${encodeURIComponent(boardId)}/columns/${encodeURIComponent(columnId)}/cards`,
    { method: "POST", body: JSON.stringify({ title, details, due_date: dueDate ?? null }) }
  );

export const editCard = (
  boardId: string,
  cardId: string,
  title: string,
  details: string,
  dueDate?: string | null
) =>
  json<BoardData>(
    `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}`,
    { method: "PUT", body: JSON.stringify({ title, details, due_date: dueDate ?? null }) }
  );

export const deleteCard = (boardId: string, cardId: string) =>
  json<BoardData>(
    `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}`,
    { method: "DELETE" }
  );

export const moveCard = (
  boardId: string,
  cardId: string,
  toColumnId: string,
  toIndex: number
) =>
  json<BoardData>(
    `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/move`,
    { method: "POST", body: JSON.stringify({ toColumnId, toIndex }) }
  );

export type ChatMessageRecord = {
  role: "user" | "assistant";
  content: string;
  created_at: string | null;
};

export type Mutation =
  | { type: "rename_column"; column_id: string; title: string }
  | { type: "add_column"; title: string }
  | { type: "delete_column"; column_id: string }
  | { type: "create_card"; column_id: string; title: string; details: string }
  | { type: "edit_card"; card_id: string; title: string; details: string }
  | { type: "delete_card"; card_id: string }
  | { type: "move_card"; card_id: string; to_column_id: string; to_index: number };

export type ChatResponse = {
  reply: string;
  appliedMutations: Mutation[];
  board: BoardData;
};

export const fetchChatHistory = (boardId?: string) => {
  const url = boardId
    ? `/api/ai/chat/history?board_id=${encodeURIComponent(boardId)}`
    : "/api/ai/chat/history";
  return json<{ messages: ChatMessageRecord[] }>(url);
};

export const sendChatMessage = (message: string, boardId?: string) =>
  json<ChatResponse>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message, board_id: boardId ?? null }),
  });
