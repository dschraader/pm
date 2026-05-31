# Backend

FastAPI application that will serve the API and the built Next.js frontend. Managed with `uv` inside the Docker container.

## Layout

- `pyproject.toml` - dependencies and pytest config. Runtime: `fastapi`, `uvicorn[standard]`. Dev group: `pytest`, `httpx` (for `TestClient`).
- `app/main.py` - FastAPI app:
  - `GET /api/health` -> `{"status": "ok"}`
  - `POST /api/login` -> validates body via `app.auth.check_credentials`, stores `username` in the session, returns `{"username": ...}`. 401 on bad creds.
  - `POST /api/logout` -> clears the session.
  - `GET /api/me` -> returns `{"username": ...}` from the session, 401 if absent.
  - `GET /api/board` -> the signed-in user's board as `{columns, cards}`. Shape matches the frontend's `BoardData`.
  - `PUT /api/board/columns/{column_id}` -> rename a column. 404 if the column doesn't belong to the user's board.
  - `POST /api/board/columns/{column_id}/cards` -> create a card at the end of the column.
  - `PUT /api/board/cards/{card_id}` -> edit title/details.
  - `DELETE /api/board/cards/{card_id}` -> delete a card; remaining cards in the column shift down by 1.
  - `POST /api/board/cards/{card_id}/move` -> body `{toColumnId, toIndex}`; works within a column or across columns; `toIndex` is clamped to the target column's bounds.
  - All `board` routes require auth (401 if not signed in) and return the full updated board on success.
  - `POST /api/ai/ping` -> proves OpenRouter connectivity. Returns `{"reply": "..."}` (text from the model). 500 with `"OPENROUTER_API_KEY is not set"` if the key is missing; 502 with `"AI provider error: ..."` for any other upstream failure. Auth-required.
  - `GET /api/ai/chat/history` -> the user's persisted conversation as `{messages: [{role, content}, ...]}`. Empty list for a fresh user. Auth-required.
  - `POST /api/ai/chat` -> body `{message}`. Loads the user's board + prior history from the DB, calls `ai.chat`, applies all returned mutations via the same code path as the board routes (so cross-user isolation and 404s still apply), persists the new user message + assistant reply, and returns `{reply, appliedMutations, board}`. Same 500/502 error mapping as `/api/ai/ping`. All of (mutations + chat persistence) run under the same `get_db` transaction - an invalid mutation rolls back everything, including the chat history, leaving the system unchanged. Auth-required.
  - `SessionMiddleware` reads `SESSION_SECRET` env var (dev default ships with the image), cookie name `pm_session`, `same_site=lax`.
  - `lifespan` calls `db.init_db()` on startup so the DB is created and seeded before any request lands.
  - `/` (and all non-`/api` paths) -> static files from `backend/static/` via `StaticFiles(html=True)`.
- `app/auth.py` - hardcoded `user` / `password` for the MVP, plus `current_user` FastAPI dependency that reads the session and raises 401.
- `app/db.py` - SQLite layer: `DB_PATH` (env-driven, defaults to `/app/data/pm.db`), `connect()` (sets `foreign_keys=ON`), `get_db()` FastAPI dependency (commits on success, rolls back on exception), `init_db()` runs DDL with `IF NOT EXISTS` and seeds the default user/board on a fresh DB. See `docs/DATABASE.md` for the schema.
- `app/board.py` - all Kanban data-access functions, scoped to a `username`. Each mutation looks up the user's board, verifies the target column/card belongs to that board (404 otherwise), then writes. `move_card` stashes the moving card at `position=-1` to keep position UPDATEs from colliding.
- `app/ai.py` - OpenRouter client (via the `openai` SDK pointed at `https://openrouter.ai/api/v1`). Reads `OPENROUTER_API_KEY` from env and raises `AIConfigError` if missing. Model is `openai/gpt-oss-120b`. Exposes:
  - `ping()` - trivial prompt used by `/api/ai/ping`.
  - `ChatMessage` and a five-variant `Mutation` discriminated union (`rename_column`, `create_card`, `edit_card`, `delete_card`, `move_card`) matching the verbs in `board.py`.
  - `AIResponse{reply, mutations}` - the Structured Outputs response schema.
  - `chat(board_state, history, user_message)` - builds the system prompt with the board JSON, threads in `history` + new message, calls `chat.completions.parse` with `response_format=AIResponse`, returns the parsed instance.
- `app/chat.py` - chat history persistence: `load_history(conn, username)` returns the user's messages ordered by `rowid`; `append_exchange(conn, username, user_text, assistant_text)` inserts both rows in one transaction.
- `app/__init__.py` - package marker.
- `static/` - empty in the repo (only `.gitkeep`). The Dockerfile's frontend-build stage populates it with the Next.js static export at image-build time, so the container serves the real Kanban UI at `/`. Running uvicorn outside Docker against an empty `static/` will 404 on `/` - use `docker compose` instead.
- `tests/` - pytest suite using `fastapi.testclient.TestClient`. `conftest.py` provides:
  - An `autouse=True` fixture that monkeypatches `db.DB_PATH` to a fresh tmp file per test and runs `init_db()` - tests are fully isolated.
  - A `client` fixture (unauthenticated `TestClient`).
  - An `auth_client` fixture that logs in as the default user before the test runs.
  - Tests assume the static dir contains the built frontend, so run them inside the container: `docker compose exec backend uv run pytest`.

## Conventions

- All API routes live under `/api/*`. Anything else is the static frontend.
- Routes return plain dicts; FastAPI handles JSON serialization.
- No global state in modules; dependencies via FastAPI `Depends` when needed.
- Tests live in `tests/` and import from `app.*`. Run with `uv run pytest`.

## Running

Inside the container:

```
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

From the host (via docker compose):

```
scripts/start.sh   # or scripts/start.ps1 on Windows
scripts/stop.sh    # or scripts/stop.ps1
```

Tests:

```
docker compose exec backend uv run pytest
```
