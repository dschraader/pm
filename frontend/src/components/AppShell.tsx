"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchMe, logout as apiLogout } from "@/lib/api";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; username: string };

export const AppShell = () => {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    fetchMe()
      .then((me) => setAuth({ status: "signed-in", username: me.username }))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setAuth({ status: "signed-out" });
        } else {
          setAuth({ status: "signed-out" });
        }
      });
  }, []);

  const handleLogout = useCallback(async () => {
    await apiLogout();
    setAuth({ status: "signed-out" });
  }, []);

  if (auth.status === "loading") {
    return (
      <div
        className="flex min-h-screen items-center justify-center text-sm text-[var(--gray-text)]"
        data-testid="app-loading"
      >
        Loading...
      </div>
    );
  }

  if (auth.status === "signed-out") {
    return (
      <LoginForm
        onSuccess={(username) => setAuth({ status: "signed-in", username })}
      />
    );
  }

  return <KanbanBoard onLogout={handleLogout} />;
};
