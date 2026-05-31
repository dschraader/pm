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

export const fetchMe = () => json<Me>("/api/me");

export const login = (username: string, password: string) =>
  json<Me>("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const logout = () =>
  json<{ ok: true }>("/api/logout", { method: "POST" });

export const fetchBoard = () => json<BoardData>("/api/board");

export const renameColumn = (columnId: string, title: string) =>
  json<BoardData>(`/api/board/columns/${encodeURIComponent(columnId)}`, {
    method: "PUT",
    body: JSON.stringify({ title }),
  });

export const createCard = (columnId: string, title: string, details: string) =>
  json<BoardData>(
    `/api/board/columns/${encodeURIComponent(columnId)}/cards`,
    {
      method: "POST",
      body: JSON.stringify({ title, details }),
    }
  );

export const editCard = (cardId: string, title: string, details: string) =>
  json<BoardData>(`/api/board/cards/${encodeURIComponent(cardId)}`, {
    method: "PUT",
    body: JSON.stringify({ title, details }),
  });

export const deleteCard = (cardId: string) =>
  json<BoardData>(`/api/board/cards/${encodeURIComponent(cardId)}`, {
    method: "DELETE",
  });

export const moveCard = (cardId: string, toColumnId: string, toIndex: number) =>
  json<BoardData>(`/api/board/cards/${encodeURIComponent(cardId)}/move`, {
    method: "POST",
    body: JSON.stringify({ toColumnId, toIndex }),
  });
