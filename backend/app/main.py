import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from app import ai, board, chat, db
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


class ChatRequest(BaseModel):
    message: str


def _apply_mutation(conn, username: str, mutation) -> None:
    if isinstance(mutation, ai.RenameColumnMutation):
        board.rename_column(conn, username, mutation.column_id, mutation.title)
    elif isinstance(mutation, ai.CreateCardMutation):
        board.create_card(
            conn, username, mutation.column_id, mutation.title, mutation.details
        )
    elif isinstance(mutation, ai.EditCardMutation):
        board.edit_card(conn, username, mutation.card_id, mutation.title, mutation.details)
    elif isinstance(mutation, ai.DeleteCardMutation):
        board.delete_card(conn, username, mutation.card_id)
    elif isinstance(mutation, ai.MoveCardMutation):
        board.move_card(
            conn, username, mutation.card_id, mutation.to_column_id, mutation.to_index
        )
    else:
        raise HTTPException(
            status_code=500, detail=f"Unknown mutation type: {type(mutation).__name__}"
        )


@app.get("/api/ai/chat/history")
def chat_history(
    username: str = Depends(current_user),
    conn=Depends(db.get_db),
):
    messages = chat.load_history(conn, username)
    return {"messages": [m.model_dump() for m in messages]}


@app.post("/api/ai/chat")
def ai_chat(
    body: ChatRequest,
    username: str = Depends(current_user),
    conn=Depends(db.get_db),
):
    current_board = board.load_board(conn, username)
    history = chat.load_history(conn, username)

    try:
        response = ai.chat(current_board, history, body.message)
    except ai.AIConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"AI provider error: {exc}"
        )

    for mutation in response.mutations:
        _apply_mutation(conn, username, mutation)

    chat.append_exchange(
        conn,
        username,
        user_text=body.message,
        assistant_text=response.reply,
    )

    return {
        "reply": response.reply,
        "appliedMutations": [m.model_dump() for m in response.mutations],
        "board": board.load_board(conn, username),
    }


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
