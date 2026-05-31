"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchBoard, fetchMe, logout as apiLogout } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { RecentChangesContext } from "@/lib/highlights";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; username: string };

const errorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    return `Request failed (${err.status}).`;
  }
  return "Network error.";
};

export const AppShell = () => {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [recentlyChanged, setRecentlyChanged] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fetchMe()
      .then((me) => setAuth({ status: "signed-in", username: me.username }))
      .catch(() => setAuth({ status: "signed-out" }));
  }, []);

  useEffect(() => {
    if (auth.status !== "signed-in") return;
    let active = true;
    fetchBoard()
      .then((data) => {
        if (active) setBoard(data);
      })
      .catch((err) => {
        if (active) setLoadError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [auth.status]);

  useEffect(() => {
    if (recentlyChanged.size === 0) return;
    const timer = setTimeout(() => setRecentlyChanged(new Set()), 2000);
    return () => clearTimeout(timer);
  }, [recentlyChanged]);

  const handleLogout = useCallback(async () => {
    await apiLogout();
    setAuth({ status: "signed-out" });
    setBoard(null);
    setLoadError(null);
    setMutationError(null);
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

  return (
    <RecentChangesContext.Provider value={recentlyChanged}>
      <div className={sidebarOpen ? "pr-[380px]" : ""}>
        <KanbanBoard
          board={board}
          setBoard={setBoard}
          loadError={loadError}
          mutationError={mutationError}
          setMutationError={setMutationError}
          onLogout={handleLogout}
        />
      </div>
      <ChatSidebar
        board={board}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        onBoardUpdate={(next, mutationsApplied) => {
          if (board) {
            setRecentlyChanged(mutationsApplied(board, next));
          }
          setBoard(next);
        }}
      />
    </RecentChangesContext.Provider>
  );
};
