# Backend

FastAPI application that will serve the API and the built Next.js frontend. Managed with `uv` inside the Docker container.

## Layout

- `pyproject.toml` - dependencies and pytest config. Runtime: `fastapi`, `uvicorn[standard]`. Dev group: `pytest`, `httpx` (for `TestClient`).
- `app/main.py` - FastAPI app:
  - `GET /api/health` -> `{"status": "ok"}`
  - `POST /api/login` -> validates body via `app.auth.check_credentials`, stores `username` in the session, returns `{"username": ...}`. 401 on bad creds.
  - `POST /api/logout` -> clears the session.
  - `GET /api/me` -> returns `{"username": ...}` from the session, 401 if absent.
  - `SessionMiddleware` reads `SESSION_SECRET` env var (dev default ships with the image), cookie name `pm_session`, `same_site=lax`.
  - `/` (and all non-`/api` paths) -> static files from `backend/static/` via `StaticFiles(html=True)`.
- `app/auth.py` - hardcoded `user` / `password` for the MVP, plus `current_user` FastAPI dependency that reads the session and raises 401.
- `app/__init__.py` - package marker.
- `static/` - empty in the repo (only `.gitkeep`). The Dockerfile's frontend-build stage populates it with the Next.js static export at image-build time, so the container serves the real Kanban UI at `/`. Running uvicorn outside Docker against an empty `static/` will 404 on `/` - use `docker compose` instead.
- `tests/` - pytest suite using `fastapi.testclient.TestClient`. `conftest.py` provides a `client` fixture. Tests are written assuming the static dir contains the built frontend, so run them inside the container.

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
