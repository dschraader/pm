# Build Plan

This is the working plan for the Project Management MVP. Each part below has substeps (checklist), tests, and success criteria. The agent ticks substeps off as it goes. The user must approve the plan (Part 1) before any scaffolding begins. After each subsequent part, the user reviews the outcome before the next part starts.

Conventions for every part:
- Keep changes minimal and idiomatic. No speculative features. No emojis anywhere.
- Root-cause any failure with evidence before patching.
- Commit at the end of each part with a short message naming the part.

---

## Part 1: Plan

Goal: Produce a detailed, approved plan and document the existing frontend so later parts have a stable reference.

Substeps:
- [x] Enrich `docs/PLAN.md` with substeps, tests, and success criteria for Parts 1-10.
- [x] Write `frontend/AGENTS.md` describing the existing demo: stack (Next.js 16, React 19, Tailwind v4, @dnd-kit), entry points (`src/app/page.tsx`, `KanbanBoard`), state model (`src/lib/kanban.ts`), and the unit/e2e test setup (Vitest + Playwright).
- [x] User reviews `docs/PLAN.md` and `frontend/AGENTS.md` and signs off.

Tests:
- None (documentation only).

Success criteria:
- `docs/PLAN.md` lists substeps, tests, and success criteria for every part.
- `frontend/AGENTS.md` exists and accurately describes the current frontend code (file paths and components verifiable against `frontend/src/`).
- User has explicitly approved the plan in writing before Part 2 starts.

---

## Part 2: Scaffolding

Goal: Stand up the Docker + FastAPI shell with start/stop scripts. Serve a placeholder static page and one health API route. No frontend integration yet.

Substeps:
- [x] Create `backend/pyproject.toml` managed by `uv`; add `fastapi` and `uvicorn[standard]`.
- [x] Create `backend/app/main.py` with a FastAPI app exposing `GET /api/health` returning `{"status": "ok"}` and serving a placeholder `backend/static/index.html` ("hello world") at `/`.
- [x] Add `Dockerfile` at project root using a slim Python base, installing `uv`, copying `backend/`, and running `uvicorn` on port 8000.
- [x] Add `docker-compose.yml` (or equivalent) wiring the container, loading `.env` from project root for `OPENROUTER_API_KEY`, and exposing port 8000.
- [x] Add `scripts/start.sh`, `scripts/stop.sh` (Mac/Linux) and `scripts/start.ps1`, `scripts/stop.ps1` (Windows) that wrap `docker compose up -d` / `down`.
- [x] Update `backend/AGENTS.md` and `scripts/AGENTS.md` with what they now contain.

Tests:
- `backend/tests/test_health.py` (pytest): `GET /api/health` returns 200 and `{"status": "ok"}`.
- `backend/tests/test_static.py` (pytest): `GET /` returns 200 with the placeholder HTML body.
- Manual: `scripts/start.sh` then `curl http://localhost:8000/api/health` and `curl http://localhost:8000/`.

Success criteria:
- `docker compose up` produces a running container with no errors in logs.
- Both endpoints respond as specified from the host machine.
- `scripts/stop.sh` cleanly tears the container down.
- All backend pytest tests pass.

---

## Part 3: Add in Frontend

Goal: Build the existing Next.js demo as a static export and serve it from FastAPI at `/`, replacing the placeholder. No backend data flow yet.

Substeps:
- [x] Configure `frontend/next.config.ts` for static export (`output: 'export'`).
- [x] Verify the demo still builds and the static output (`frontend/out/`) is functional.
- [x] Update `Dockerfile` to a multi-stage build: stage 1 builds the frontend with Node, stage 2 copies `frontend/out/` into the Python image and points FastAPI's static mount at it.
- [x] Mount the exported frontend at `/` in FastAPI; keep `/api/*` reserved for backend routes.
- [x] Confirm hashed asset URLs (CSS/JS) resolve correctly through the FastAPI static mount.

Tests:
- `backend/tests/test_static.py` updated: `GET /` returns the built Next.js HTML (assert on a known string from the page, e.g. "Kanban Studio").
- `backend/tests/test_assets.py`: a representative `_next/static/...` asset returns 200 with the correct content-type.
- Frontend tests still pass: `cd frontend && npm run test:all` (Vitest unit + Playwright e2e).

Success criteria:
- After `scripts/start.sh`, visiting `http://localhost:8000/` shows the Kanban demo with drag-and-drop fully working (in-memory state only).
- Browser DevTools shows no 404s for any frontend asset.
- All unit, integration, and e2e tests pass.

---

## Part 4: Fake user sign-in

Goal: Gate the Kanban behind a hardcoded login (`user` / `password`) with a working logout. Session is server-side; frontend reflects auth state.

Substeps:
- [x] Backend: `POST /api/login` accepts JSON `{username, password}`, validates against hardcoded creds, sets a signed session cookie (FastAPI + `itsdangerous` or starlette `SessionMiddleware`).
- [x] Backend: `POST /api/logout` clears the cookie.
- [x] Backend: `GET /api/me` returns `{username}` when logged in, 401 otherwise.
- [x] Frontend: add a `/login` route (or client-rendered overlay) with username/password form.
- [x] Frontend: on app load, fetch `/api/me`; if 401, show login; if 200, show Kanban.
- [x] Frontend: add a Logout button in the header; clicking calls `/api/logout` and returns to the login screen.

Tests:
- Backend pytest: login with correct creds returns 200 + sets cookie; wrong creds returns 401; `/api/me` returns 401 without cookie and 200 with valid cookie; logout clears the cookie.
- Vitest: login form renders, calls `/api/login` with submitted values, surfaces error on 401, navigates to board on success (mock fetch).
- Playwright: full flow - bad creds shows error, good creds shows the board, logout returns to login, reload after login still shows the board.

Success criteria:
- Unauthenticated user cannot view the board (any direct visit redirects to login).
- All backend, unit, and e2e tests pass.

---

## Part 5: Database modeling

Goal: Design the SQLite schema for users + Kanban boards + columns + cards, store card/column ordering, and persist any per-user metadata needed. Document the schema and get user sign-off before any backend wiring.

Substeps:
- [x] Draft `docs/DATABASE.md` covering: tables (`users`, `boards`, `columns`, `cards`), columns/types, primary and foreign keys, ordering strategy (integer `position` per column / per board), constraints, and seed data plan (auto-create `user` on first launch with a starter board mirroring `initialData`).
- [x] Include a small ER diagram or table listing in `docs/DATABASE.md`.
- [x] Note JSON storage approach: the board is normalized in tables; the API response shape matches the current `BoardData` (`{columns, cards}`) so the frontend needs no model changes.
- [x] User reviews `docs/DATABASE.md` and signs off.

Tests:
- None yet (no code).

Success criteria:
- `docs/DATABASE.md` exists, is unambiguous, and the user has approved it before Part 6 begins.

---

## Part 6: Backend (Kanban API)

Goal: Implement the Kanban CRUD API against SQLite. Auto-create the DB on first run. Cover with unit tests.

Substeps:
- [x] Add SQLite + SQLAlchemy (or sqlite3 directly if simpler) to `backend/pyproject.toml`.
- [x] Implement schema-creation-on-startup: if `data.db` does not exist, create tables and seed the default user's starter board.
- [x] Routes (all require auth):
  - [x] `GET /api/board` - returns the signed-in user's board as `{columns, cards}`.
  - [x] `PUT /api/board/columns/{column_id}` - rename column.
  - [x] `POST /api/board/columns/{column_id}/cards` - create card.
  - [x] `PUT /api/board/cards/{card_id}` - edit title/details.
  - [x] `DELETE /api/board/cards/{card_id}` - delete card.
  - [x] `POST /api/board/cards/{card_id}/move` - move card; body `{toColumnId, toIndex}`.
- [x] Each route is scoped to the signed-in user; returns 401 unauthenticated, 404 on missing resources.

Tests:
- Pytest covering each route: happy path, unauthenticated rejection, cross-user isolation (create a second user fixture), invalid input (missing fields, bad IDs).
- DB auto-create test: delete the DB file, hit `GET /api/board`, confirm tables and seed data are created.

Success criteria:
- All routes behave per spec, full pytest suite passes.
- Restarting the container preserves state across requests (no in-memory leakage).

---

## Part 7: Frontend + Backend wiring

Goal: Replace in-memory state in `KanbanBoard` with the backend API so the board is genuinely persistent.

Substeps:
- [x] Add a small client in `frontend/src/lib/api.ts` for each endpoint.
- [x] Refactor `KanbanBoard` to load board from `GET /api/board` on mount; show a loading state.
- [x] Wire each mutation (rename column, add card, delete card, edit card, drag/drop move) to the corresponding API call with optimistic update + rollback on error.
- [x] Surface errors with a small inline message (no toast library; keep it simple).

Tests:
- Vitest: mock `fetch`, verify each handler calls the right endpoint with the right payload and reverts on error.
- Playwright: drag a card, reload the page, confirm the move persisted; rename a column, reload, confirm; create and delete a card, reload, confirm.
- Backend pytest still green.

Success criteria:
- Page reload preserves all user changes.
- Network errors do not corrupt local state (rollback works).
- All test suites pass.

---

## Part 8: AI connectivity

Goal: Prove OpenRouter connectivity end-to-end with a trivial prompt. No UI yet.

Substeps:
- [x] Add an OpenRouter client to the backend (the `openai` SDK pointed at `https://openrouter.ai/api/v1` works fine), reading `OPENROUTER_API_KEY` from env, using model `openai/gpt-oss-120b`.
- [x] Add `POST /api/ai/ping` that sends "What is 2+2? Reply with only the number." and returns the raw text.
- [x] Add a tiny CLI/test script: `scripts/ai-smoke.sh` calls the endpoint and prints the response.

Tests:
- Pytest with mocked OpenRouter client: route shape and error handling (missing key returns 500 with a clear message).
- Manual: `scripts/ai-smoke.sh` against a running container returns "4" (or text containing 4).

Success criteria:
- The smoke test returns a sensible answer from the live model.
- Tests pass; missing/invalid API key surfaces a clear error rather than a stack trace.

---

## Part 9: AI with board context + Structured Outputs

Goal: Every AI call receives the current board JSON + chat history + user message, and replies via Structured Outputs containing (a) a reply string and (b) an optional set of board mutations.

Substeps:
- [x] Define the response schema (Pydantic model) with fields like:
  - `reply: str`
  - `mutations: list[Mutation] | None` where `Mutation` is a tagged union over `rename_column`, `create_card`, `edit_card`, `delete_card`, `move_card` matching the existing API verbs.
- [x] Implement `POST /api/ai/chat` that:
  - [x] Loads the user's board.
  - [x] Builds a system prompt explaining the board structure and allowed mutations.
  - [x] Sends board JSON + prior `messages` from the request body + new user message.
  - [x] Calls OpenRouter with Structured Outputs (JSON schema mode).
  - [x] Applies any mutations server-side via the same code path as Part 6 routes.
  - [x] Returns `{reply, appliedMutations, board}` (board reflects the post-mutation state).
- [x] Persist chat history per user (simple `chat_messages` table) so the frontend can reload conversation across sessions.

Tests:
- Pytest with mocked OpenRouter responses covering: plain reply (no mutations), single mutation (e.g. create a card), multiple mutations, mutation that references a missing card (must error cleanly and not partially apply - wrap in a transaction).
- Integration test: end-to-end against a stubbed OpenRouter that asserts the prompt includes the board JSON and prior history.

Success criteria:
- AI can read the board and propose valid mutations that actually change the DB.
- Invalid mutation sets fail atomically (no half-applied changes).
- All tests pass.

---

## Part 10: AI chat sidebar UI

Goal: A polished right-hand sidebar for AI chat. When the AI applies mutations, the board refreshes automatically.

Substeps:
- [ ] Add a collapsible sidebar component in the frontend matching the app's existing palette (blue/purple/navy/yellow). Use the existing Tailwind tokens and design language; no new design system.
- [ ] Conversation view: scrollable message list, user vs assistant styling, timestamp.
- [ ] Composer: textarea + send button; submit on Enter, newline on Shift+Enter; disable while in-flight.
- [ ] On send: `POST /api/ai/chat` with the full message history; append the reply; if `appliedMutations` is non-empty, replace local board state with the returned `board` (no extra fetch needed) and briefly highlight changed cards/columns.
- [ ] On first load: `GET /api/ai/chat/history` to restore previous conversation.
- [ ] Empty state and error state in the sidebar.

Tests:
- Vitest: composer behavior (Enter vs Shift+Enter, disabled state), message rendering, mutation-induced board refresh updates the rendered DOM.
- Playwright: type "move card X to Done", verify the sidebar shows the AI reply and the card visibly moves to the Done column without a manual refresh; reload and confirm both the chat history and the board move persisted.

Success criteria:
- Sidebar is visually consistent with the rest of the app (no jarring styling).
- AI-driven mutations are reflected in the UI immediately and survive reload.
- Full test suite (backend pytest + frontend Vitest + Playwright) is green.

---

## Definition of done (whole project)

- `scripts/start.sh` on a clean machine (with Docker + `.env` containing `OPENROUTER_API_KEY`) brings up a working app at `http://localhost:8000/`.
- Login with `user` / `password` shows a persistent Kanban board with full drag-and-drop and an AI chat sidebar that can read and modify the board.
- All test suites pass: `backend/` pytest, `frontend/` Vitest, `frontend/` Playwright.
- No emojis in code or docs. No unused files.
