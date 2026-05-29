# Backend

FastAPI application that will serve the API and the built Next.js frontend. Managed with `uv` inside the Docker container.

## Layout

- `pyproject.toml` - dependencies and pytest config. Runtime: `fastapi`, `uvicorn[standard]`. Dev group: `pytest`, `httpx` (for `TestClient`).
- `app/main.py` - FastAPI app:
  - `GET /api/health` -> `{"status": "ok"}`
  - `/` (and all non-`/api` paths) -> static files from `backend/static/` via `StaticFiles(html=True)`.
- `app/__init__.py` - package marker.
- `static/index.html` - placeholder served at `/`. Replaced by the built Next.js export in Part 3.
- `tests/` - pytest suite using `fastapi.testclient.TestClient`. `conftest.py` provides a `client` fixture.

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
