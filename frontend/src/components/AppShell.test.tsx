import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { okResponse, seedBoard } from "@/test/fixtures";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const meOk = () => okResponse({ username: "user" });
const me401 = () =>
  ({ ok: false, status: 401, json: async () => ({ detail: "Not authenticated" }) }) as Response;
const boardOk = () => okResponse(seedBoard);
const logoutOk = () => okResponse({ ok: true });

describe("AppShell", () => {
  it("shows the login form when /api/me returns 401", async () => {
    fetchMock.mockResolvedValueOnce(me401());
    render(<AppShell />);
    expect(
      await screen.findByRole("heading", { name: "Sign in" })
    ).toBeInTheDocument();
  });

  it("shows the kanban board when /api/me succeeds", async () => {
    fetchMock.mockResolvedValueOnce(meOk()).mockResolvedValueOnce(boardOk());
    render(<AppShell />);
    expect(
      await screen.findByRole("heading", { name: "Kanban Studio" })
    ).toBeInTheDocument();
  });

  it("logout returns to the login form", async () => {
    fetchMock
      .mockResolvedValueOnce(meOk())
      .mockResolvedValueOnce(boardOk())
      .mockResolvedValueOnce(logoutOk());
    render(<AppShell />);
    await screen.findByRole("heading", { name: "Kanban Studio" });

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(
      await screen.findByRole("heading", { name: "Sign in" })
    ).toBeInTheDocument();
  });
});
