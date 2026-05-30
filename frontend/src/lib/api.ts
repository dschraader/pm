export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const json = async (path: string, init: RequestInit = {}) => {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new ApiError(response.status, `Request failed: ${response.status}`);
  }
  return response.json();
};

export type Me = { username: string };

export const fetchMe = (): Promise<Me> => json("/api/me");

export const login = (username: string, password: string): Promise<Me> =>
  json("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const logout = (): Promise<{ ok: true }> =>
  json("/api/logout", { method: "POST" });
