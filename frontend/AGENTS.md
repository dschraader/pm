# Frontend

A Next.js demo of the Kanban board UI. Pure frontend, in-memory state only. Will be wired to the backend API in Part 7 of `docs/PLAN.md`.

## Stack

- Next.js 16 (App Router) on React 19
- Tailwind v4 (via `@tailwindcss/postcss`), single global stylesheet
- `@dnd-kit/core` + `@dnd-kit/sortable` for drag and drop
- TypeScript, path alias `@/*` -> `src/*`
- Vitest + Testing Library for unit tests, Playwright for e2e

## Layout

- `src/app/layout.tsx` - root layout, loads Space Grotesk (display) and Manrope (body) from Google Fonts.
- `src/app/page.tsx` - renders `<AppShell />`, which gates the Kanban behind a login.
- `src/app/globals.css` - Tailwind import and CSS variables for the brand palette (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`, plus surface/stroke/shadow tokens).
- `src/lib/api.ts` - tiny `fetch` wrapper. Exposes auth calls (`fetchMe`, `login`, `logout`), board calls (`fetchBoard`, `renameColumn`, `createCard`, `editCard`, `deleteCard`, `moveCard`), and AI chat calls (`fetchChatHistory`, `sendChatMessage`). Defines a `Mutation` discriminated union and `ChatResponse` matching the backend. Each board mutation returns the full updated `BoardData`. All calls use `credentials: "same-origin"` so the session cookie travels.
- `src/lib/highlights.ts` - `RecentChangesContext` (Set of recently-changed entity IDs) plus `computeChangedIds(mutations, before, after)` which derives the set from an AI response. Consumed by `KanbanCard` and `KanbanColumn` to draw a 2-second ring after the AI updates the board.
- `src/lib/kanban.ts` - state model and pure helpers:
  - Types: `Card`, `Column`, `BoardData`. Shared with `src/lib/api.ts`.
  - `moveCard(columns, activeId, overId)` - pure reorder/move across columns; handles same-column reorder, cross-column drop on a card, and drop on an empty column. Used for the optimistic update before the API call; the resulting position is the `toIndex` sent to the backend.
- `src/components/`:
  - `AppShell.tsx` - client component and **the single owner of board + auth state**. On mount fetches `/api/me`; once signed in, fetches `/api/board`. Renders the loading state, the `LoginForm`, or the layout (KanbanBoard wrapped in a `pr-[380px]` container when the sidebar is open, plus the fixed-positioned `ChatSidebar`). Provides `RecentChangesContext`, computing changed IDs from each AI response and clearing them after 2 seconds.
  - `LoginForm.tsx` - username/password form. Calls `login` from `lib/api` on submit; surfaces 401s as "Invalid credentials" in a `role="alert"` element scoped inside the form (the dev-mode Next.js overlay also has a top-level alert role, so tests scope queries to the form).
  - `KanbanBoard.tsx` - **controlled component**: receives `board`, `setBoard`, `loadError`, `mutationError`, `setMutationError` as props from `AppShell`. Each mutation does an optimistic local update, calls the corresponding API, then replaces local state with the server response on success. On failure it rolls back to the pre-mutation snapshot and surfaces an inline `role="alert"` error. Wires `DndContext` + `DragOverlay`; pointer sensor with 6px activation distance. Optional `onLogout` prop renders the "Log out" button.
  - `KanbanColumn.tsx` - the column title is locally drafted (`useState`) and only commits on blur / Enter, so we don't fire a PUT per keystroke. Escape reverts the draft. Reads `RecentChangesContext` to draw an accent-yellow ring when the column was just changed by the AI.
  - `KanbanCard.tsx` - reads `RecentChangesContext` to draw an accent-yellow ring when this card was just changed by the AI. Also exposes `data-recent="true"` so e2e tests can assert the highlight.
  - `ChatSidebar.tsx` - fixed-positioned right overlay (380px wide) with the AI assistant. Loads history via `fetchChatHistory` on mount, shows an empty state otherwise. Composer is a `<textarea>`: Enter sends, Shift+Enter inserts a newline, send button + textarea both disable during in-flight calls. On send, optimistically appends the user message, calls `sendChatMessage`, then either (a) appends the assistant reply + calls `onBoardUpdate(response.board, diff)` so AppShell can compute the highlight set, or (b) reverts the optimistic message and shows the error. Open/closed state is controllable from the parent via `open`/`onOpenChange` props (AppShell uses this to reserve layout space).
  - `KanbanColumn.tsx` - droppable column, inline-editable title, hosts `SortableContext` and `NewCardForm`. Has `data-testid={column-${id}}`.
  - `KanbanCard.tsx` - sortable card with title, details, remove button. Has `data-testid={card-${id}}`.
  - `KanbanCardPreview.tsx` - static card used inside `DragOverlay`.
  - `NewCardForm.tsx` - collapsed "Add a card" button that expands into a title/details form.
- `src/test/setup.ts`, `src/test/vitest.d.ts` - Vitest + jest-dom setup.
- `src/test/fixtures.ts` - shared test fixtures: `seedBoard`, `okResponse`, `errorResponse` helpers for fetch mocking.
- `tests/kanban.spec.ts` - Playwright e2e: page loads, add a card (with a timestamp-unique title so it's idempotent across runs), drag a card across columns. Logs in first via `tests/helpers.ts`.
- `tests/auth.spec.ts` - Playwright e2e: bad creds error, good creds enters the board, logout returns to login, session persists across reload, direct visit without session shows login.
- `tests/persistence.spec.ts` - Playwright e2e covering Part 7: each kind of mutation (rename / create / delete / move) survives a page reload.
- `tests/ai-chat.spec.ts` - Playwright e2e for Part 10. Uses `page.route("**/api/ai/chat", ...)` to mock the chat endpoint with a synthetic response (real OpenRouter is non-deterministic and costs money); asserts that the sidebar shows the AI reply, the board reflects mutations immediately, and the affected card gets `data-recent="true"`. Also covers collapse/reopen.
- `tests/helpers.ts` - small `signIn(page, username?, password?)` helper for e2e specs.
- `playwright.global-setup.ts` - runs `docker compose down -v && up -d --build` once before all tests, then waits for `/api/health`. Guarantees every test session starts from the seeded DB. `playwright.config.ts` sets `workers: 1` so mutating tests don't race against each other on the shared backend, and uses a 1600x900 viewport so the 380px sidebar leaves enough room for the 5-column grid.

## Tests

- `npm run test:unit` - Vitest (jsdom). Covers `moveCard` exhaustively and `KanbanBoard` rename / add / delete flows.
- `npm run test:e2e` - Playwright (Chromium). Auto-starts `next dev` on 127.0.0.1:3000 if not already running.
- `npm run test:all` - both.

## Conventions

- Components are functional, typed, and colocated with their tests where useful.
- All styling via Tailwind utility classes + CSS variables. No CSS modules, no styled-components.
- Pure logic (state transitions, ids) lives in `src/lib/` and is unit-tested without React.
- `data-testid` on columns and cards is part of the public test contract - do not rename.
- No emojis anywhere.

## Static export

`next.config.ts` sets `output: "export"` and `images: { unoptimized: true }`. `npm run build` writes a fully static site to `frontend/out/`, which the Dockerfile copies into `backend/static/` for FastAPI to serve at `/`. `npm run dev` continues to work for local iteration (`output: "export"` only affects `next build`).

## What this demo does NOT yet do

- No persistence (state resets on reload).
- No auth, no backend, no API client.
- No AI chat sidebar.

When extending this directory, keep the file structure flat and consult `docs/PLAN.md` for the part currently in progress.
