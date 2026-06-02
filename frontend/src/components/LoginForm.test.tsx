import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/LoginForm";
import { createdResponse } from "@/test/fixtures";

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

const conflictResponse = () =>
  ({
    ok: false,
    status: 409,
    json: async () => ({ detail: "Username already taken" }),
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

  it("switches to the register form when 'Create one' is clicked", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByTestId("switch-to-register"));

    expect(
      screen.getByRole("heading", { name: "Create account" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
  });

  it("registers a new user, then logs in, then calls onSuccess", async () => {
    fetchMock
      .mockResolvedValueOnce(createdResponse({ username: "alice" }))
      .mockResolvedValueOnce(successResponse());

    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);
    await userEvent.click(screen.getByTestId("switch-to-register"));

    await userEvent.type(screen.getByLabelText("Username"), "alice");
    await userEvent.type(screen.getByLabelText("Password"), "secret1");
    await userEvent.type(screen.getByLabelText("Confirm password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "alice", password: "secret1" }),
      })
    );
    expect(onSuccess).toHaveBeenCalledWith("user");
  });

  it("shows an error when passwords do not match during registration", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByTestId("switch-to-register"));

    await userEvent.type(screen.getByLabelText("Username"), "bob");
    await userEvent.type(screen.getByLabelText("Password"), "abc123");
    await userEvent.type(screen.getByLabelText("Confirm password"), "different");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an error on 409 when username is taken", async () => {
    fetchMock.mockResolvedValueOnce(conflictResponse());
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByTestId("switch-to-register"));

    await userEvent.type(screen.getByLabelText("Username"), "existinguser");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.type(screen.getByLabelText("Confirm password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Username already taken");
  });

  it("switches back to sign-in from register", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByTestId("switch-to-register"));
    await userEvent.click(screen.getByTestId("switch-to-signin"));

    expect(
      screen.getByRole("heading", { name: "Sign in" })
    ).toBeInTheDocument();
  });
});
