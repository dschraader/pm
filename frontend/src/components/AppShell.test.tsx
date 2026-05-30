import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const meOk = () =>
  ({ ok: true, status: 200, json: async () => ({ username: "user" }) }) as Response;
const me401 = () =>
  ({ ok: false, status: 401, json: async () => ({ detail: "Not authenticated" }) }) as Response;
const logoutOk = () =>
  ({ ok: true, status: 200, json: async () => ({ ok: true }) }) as Response;

describe("AppShell", () => {
  it("shows the login form when /api/me returns 401", async () => {
    fetchMock.mockResolvedValueOnce(me401());
    render(<AppShell />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the kanban board when /api/me succeeds", async () => {
    fetchMock.mockResolvedValueOnce(meOk());
    render(<AppShell />);
    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeInTheDocument();
  });

  it("logout returns to the login form", async () => {
    fetchMock.mockResolvedValueOnce(meOk()).mockResolvedValueOnce(logoutOk());
    render(<AppShell />);
    await screen.findByRole("heading", { name: "Kanban Studio" });

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
