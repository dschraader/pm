import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { okResponse, seedBoard, seedBoardSummary } from "@/test/fixtures";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const me401 = () =>
  ({
    ok: false,
    status: 401,
    json: async () => ({ detail: "Not authenticated" }),
  }) as Response;

type Routes = Record<string, () => Response | Promise<Response>>;

const routeMock = (routes: Routes, fallback?: () => Response) => {
  return (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const handler = routes[url];
    if (handler) return Promise.resolve(handler());
    if (fallback) return Promise.resolve(fallback());
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  };
};

const boardRoute = `/api/boards/${seedBoardSummary.id}`;

describe("AppShell", () => {
  it("shows the login form when /api/me returns 401", async () => {
    fetchMock.mockImplementation(routeMock({ "/api/me": () => me401() }));
    render(<AppShell />);
    expect(
      await screen.findByRole("heading", { name: "Sign in" })
    ).toBeInTheDocument();
  });

  it("shows the kanban board when /api/me succeeds", async () => {
    fetchMock.mockImplementation(
      routeMock({
        "/api/me": () => okResponse({ username: "user" }),
        "/api/boards": () => okResponse([seedBoardSummary]),
        [boardRoute]: () => okResponse(seedBoard),
        "/api/ai/chat/history": () => okResponse({ messages: [] }),
      })
    );
    render(<AppShell />);
    expect(
      await screen.findByRole("heading", { name: "My Board" })
    ).toBeInTheDocument();
  });

  it("shows board selector tabs after sign-in", async () => {
    fetchMock.mockImplementation(
      routeMock({
        "/api/me": () => okResponse({ username: "user" }),
        "/api/boards": () =>
          okResponse([
            seedBoardSummary,
            { id: "board-2", title: "Sprint Board", created_at: "2026-01-02" },
          ]),
        [boardRoute]: () => okResponse(seedBoard),
        "/api/boards/board-2": () => okResponse(seedBoard),
        "/api/ai/chat/history": () => okResponse({ messages: [] }),
      })
    );
    render(<AppShell />);
    expect(await screen.findByTestId("board-tab-board-default")).toBeInTheDocument();
    expect(screen.getByTestId("board-tab-board-2")).toBeInTheDocument();
  });

  it("shows username in the top bar", async () => {
    fetchMock.mockImplementation(
      routeMock({
        "/api/me": () => okResponse({ username: "alice" }),
        "/api/boards": () => okResponse([seedBoardSummary]),
        [boardRoute]: () => okResponse(seedBoard),
        "/api/ai/chat/history": () => okResponse({ messages: [] }),
      })
    );
    render(<AppShell />);
    expect(await screen.findByTestId("username-display")).toHaveTextContent("alice");
  });

  it("logout returns to the login form", async () => {
    fetchMock.mockImplementation(
      routeMock({
        "/api/me": () => okResponse({ username: "user" }),
        "/api/boards": () => okResponse([seedBoardSummary]),
        [boardRoute]: () => okResponse(seedBoard),
        "/api/ai/chat/history": () => okResponse({ messages: [] }),
        "/api/logout": () => okResponse({ ok: true }),
      })
    );
    render(<AppShell />);
    await screen.findByRole("heading", { name: "My Board" });

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(
      await screen.findByRole("heading", { name: "Sign in" })
    ).toBeInTheDocument();
  });
});
