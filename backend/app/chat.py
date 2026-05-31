import sqlite3

from fastapi import HTTPException, status

from app.ai import ChatMessage
from app.db import new_id


def _user_id(conn: sqlite3.Connection, username: str) -> str:
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return row["id"]


def load_history(conn: sqlite3.Connection, username: str) -> list[ChatMessage]:
    rows = conn.execute(
        """
        SELECT m.role, m.content, m.created_at
        FROM chat_messages m
        JOIN users u ON u.id = m.user_id
        WHERE u.username = ?
        ORDER BY m.rowid
        """,
        (username,),
    ).fetchall()
    return [
        ChatMessage(
            role=row["role"], content=row["content"], created_at=row["created_at"]
        )
        for row in rows
    ]


def append_exchange(
    conn: sqlite3.Connection,
    username: str,
    *,
    user_text: str,
    assistant_text: str,
) -> None:
    user_id = _user_id(conn, username)
    conn.execute(
        "INSERT INTO chat_messages (id, user_id, role, content) VALUES (?, ?, 'user', ?)",
        (new_id("msg"), user_id, user_text),
    )
    conn.execute(
        "INSERT INTO chat_messages (id, user_id, role, content) VALUES (?, ?, 'assistant', ?)",
        (new_id("msg"), user_id, assistant_text),
    )
