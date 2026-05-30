import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/LoginForm";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const successResponse = () =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ username: "user" }),
  }) as Response;

const unauthorizedResponse = () =>
  ({
    ok: false,
    status: 401,
    json: async () => ({ detail: "Invalid credentials" }),
  }) as Response;

describe("LoginForm", () => {
  it("renders username and password inputs", () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("calls /api/login with submitted values and notifies parent on success", async () => {
    fetchMock.mockResolvedValueOnce(successResponse());
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "user", password: "password" }),
      })
    );
    expect(onSuccess).toHaveBeenCalledWith("user");
  });

  it("shows an error message on 401", async () => {
    fetchMock.mockResolvedValueOnce(unauthorizedResponse());
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials");
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
