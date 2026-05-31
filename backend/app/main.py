import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from app import ai, board, db
from app.auth import check_credentials, current_user

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="PM Backend", lifespan=lifespan)

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


class RenameColumnRequest(BaseModel):
    title: str


class CreateCardRequest(BaseModel):
    title: str
    details: str = ""


class EditCardRequest(BaseModel):
    title: str
    details: str = ""


class MoveCardRequest(BaseModel):
    toColumnId: str
    toIndex: int


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


@app.get("/api/board")
def get_board(
    username: str = Depends(current_user),
    conn=Depends(db.get_db),
):
    return board.load_board(conn, username)


@app.put("/api/board/columns/{column_id}")
def rename_column_route(
    column_id: str,
    body: RenameColumnRequest,
    username: str = Depends(current_user),
    conn=Depends(db.get_db),
):
    board.rename_column(conn, username, column_id, body.title)
    return board.load_board(conn, username)


@app.post("/api/board/columns/{column_id}/cards")
def create_card_route(
    column_id: str,
    body: CreateCardRequest,
    username: str = Depends(current_user),
    conn=Depends(db.get_db),
):
    board.create_card(conn, username, column_id, body.title, body.details)
    return board.load_board(conn, username)


@app.put("/api/board/cards/{card_id}")
def edit_card_route(
    card_id: str,
    body: EditCardRequest,
    username: str = Depends(current_user),
    conn=Depends(db.get_db),
):
    board.edit_card(conn, username, card_id, body.title, body.details)
    return board.load_board(conn, username)


@app.delete("/api/board/cards/{card_id}")
def delete_card_route(
    card_id: str,
    username: str = Depends(current_user),
    conn=Depends(db.get_db),
):
    board.delete_card(conn, username, card_id)
    return board.load_board(conn, username)


@app.post("/api/board/cards/{card_id}/move")
def move_card_route(
    card_id: str,
    body: MoveCardRequest,
    username: str = Depends(current_user),
    conn=Depends(db.get_db),
):
    board.move_card(conn, username, card_id, body.toColumnId, body.toIndex)
    return board.load_board(conn, username)


@app.post("/api/ai/ping")
def ai_ping(_username: str = Depends(current_user)) -> dict[str, str]:
    try:
        reply = ai.ping()
    except ai.AIConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"AI provider error: {exc}"
        )
    return {"reply": reply}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
