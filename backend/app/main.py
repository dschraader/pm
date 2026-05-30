import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from app.auth import check_credentials, current_user

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="PM Backend")

app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SESSION_SECRET", "dev-secret-change-me"),
    session_cookie="pm_session",
    same_site="lax",
    https_only=False,
)


class LoginRequest(BaseModel):
    username: str
    password: str


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/login")
def login(body: LoginRequest, request: Request) -> dict[str, str]:
    if not check_credentials(body.username, body.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    request.session["username"] = body.username
    return {"username": body.username}


@app.post("/api/logout")
def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}


@app.get("/api/me")
def me(username: str = Depends(current_user)) -> dict[str, str]:
    return {"username": username}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
