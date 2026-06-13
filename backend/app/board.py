import sqlite3
from typing import Any

from fastapi import HTTPException, status

from app.db import new_id

DEFAULT_BOARD_COLUMNS = ["Backlog", "In Progress", "Review", "Done"]


def _board_id_for_user(conn: sqlite3.Connection, username: str) -> str:
    row = conn.execute(
        "SELECT b.id FROM boards b JOIN users u ON u.id = b.user_id WHERE u.username = ? ORDER BY b.created_at, b.id LIMIT 1",
        (username,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    return row["id"]


def _get_board_id(conn: sqlite3.Connection, username: str, board_id: str | None) -> str:
    if board_id is None:
        return _board_id_for_user(conn, username)
    row = conn.execute(
        "SELECT b.id FROM boards b JOIN users u ON u.id = b.user_id WHERE u.username = ? AND b.id = ?",
        (username, board_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    return board_id


def _assert_column_in_board(conn: sqlite3.Connection, board_id: str, column_id: str) -> None:
    row = conn.execute(
        "SELECT id FROM columns WHERE id = ? AND board_id = ?",
        (column_id, board_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Column not found")


def _card_in_board(conn: sqlite3.Connection, board_id: str, card_id: str) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT c.id, c.column_id, c.position
        FROM cards c
        JOIN columns col ON col.id = c.column_id
        WHERE c.id = ? AND col.board_id = ?
        """,
        (card_id, board_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    return row


def add_column(
    conn: sqlite3.Connection, username: str, board_id: str, title: str
) -> None:
    actual = _get_board_id(conn, username, board_id)
    position = conn.execute(
        "SELECT COUNT(*) FROM columns WHERE board_id = ?", (actual,)
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
        (new_id("col"), actual, title, position),
    )


def delete_column(
    conn: sqlite3.Connection, username: str, board_id: str, column_id: str
) -> None:
    actual = _get_board_id(conn, username, board_id)
    row = conn.execute(
        "SELECT position FROM columns WHERE id = ? AND board_id = ?",
        (column_id, actual),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Column not found")
    position = row["position"]
    conn.execute("DELETE FROM columns WHERE id = ?", (column_id,))
    conn.execute(
        "UPDATE columns SET position = position - 1 WHERE board_id = ? AND position > ?",
        (actual, position),
    )


def list_boards(conn: sqlite3.Connection, username: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT b.id, b.title, b.created_at
        FROM boards b
        JOIN users u ON u.id = b.user_id
        WHERE u.username = ?
        ORDER BY b.created_at, b.id
        """,
        (username,),
    ).fetchall()
    return [dict(row) for row in rows]


def create_board(conn: sqlite3.Connection, username: str, title: str) -> dict[str, Any]:
    user_row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if not user_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    board_id = new_id("board")
    conn.execute(
        "INSERT INTO boards (id, user_id, title) VALUES (?, ?, ?)",
        (board_id, user_row["id"], title),
    )
    for i, col_title in enumerate(DEFAULT_BOARD_COLUMNS):
        conn.execute(
            "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
            (new_id("col"), board_id, col_title, i),
        )
    row = conn.execute(
        "SELECT id, title, created_at FROM boards WHERE id = ?", (board_id,)
    ).fetchone()
    return dict(row)


def delete_board(conn: sqlite3.Connection, username: str, board_id: str) -> None:
    actual = _get_board_id(conn, username, board_id)
    conn.execute("DELETE FROM boards WHERE id = ?", (actual,))


def rename_board(
    conn: sqlite3.Connection, username: str, board_id: str, title: str
) -> dict[str, Any]:
    actual = _get_board_id(conn, username, board_id)
    conn.execute("UPDATE boards SET title = ? WHERE id = ?", (title, actual))
    row = conn.execute(
        "SELECT id, title, created_at FROM boards WHERE id = ?", (actual,)
    ).fetchone()
    return dict(row)


def load_board(
    conn: sqlite3.Connection, username: str, board_id: str | None = None
) -> dict[str, Any]:
    actual_board_id = _get_board_id(conn, username, board_id)
    columns = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position, id",
        (actual_board_id,),
    ).fetchall()
    card_rows = conn.execute(
        """
        SELECT c.id, c.column_id, c.title, c.details, c.due_date
        FROM cards c
        JOIN columns col ON col.id = c.column_id
        WHERE col.board_id = ?
        ORDER BY c.column_id, c.position, c.id
        """,
        (actual_board_id,),
    ).fetchall()

    cards: dict[str, dict[str, Any]] = {}
    cards_by_column: dict[str, list[str]] = {}
    for row in card_rows:
        cards[row["id"]] = {
            "id": row["id"],
            "title": row["title"],
            "details": row["details"],
            "due_date": row["due_date"],
        }
        cards_by_column.setdefault(row["column_id"], []).append(row["id"])

    return {
        "columns": [
            {
                "id": col["id"],
                "title": col["title"],
                "cardIds": cards_by_column.get(col["id"], []),
            }
            for col in columns
        ],
        "cards": cards,
    }


def rename_column(
    conn: sqlite3.Connection,
    username: str,
    column_id: str,
    new_title: str,
    board_id: str | None = None,
) -> None:
    actual_board_id = _get_board_id(conn, username, board_id)
    _assert_column_in_board(conn, actual_board_id, column_id)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (new_title, column_id))


def reorder_columns(
    conn: sqlite3.Connection, username: str, board_id: str, column_ids: list[str]
) -> None:
    actual = _get_board_id(conn, username, board_id)
    existing = {
        row["id"]
        for row in conn.execute(
            "SELECT id FROM columns WHERE board_id = ?", (actual,)
        ).fetchall()
    }
    if set(column_ids) != existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="column_ids must be exactly the board's current columns",
        )
    for i, col_id in enumerate(column_ids):
        conn.execute("UPDATE columns SET position = ? WHERE id = ?", (i, col_id))


def create_card(
    conn: sqlite3.Connection,
    username: str,
    column_id: str,
    title: str,
    details: str,
    board_id: str | None = None,
    due_date: str | None = None,
) -> str:
    actual_board_id = _get_board_id(conn, username, board_id)
    _assert_column_in_board(conn, actual_board_id, column_id)
    position = conn.execute(
        "SELECT COUNT(*) FROM cards WHERE column_id = ?", (column_id,)
    ).fetchone()[0]
    card_id = new_id("card")
    conn.execute(
        "INSERT INTO cards (id, column_id, title, details, due_date, position) VALUES (?, ?, ?, ?, ?, ?)",
        (card_id, column_id, title, details, due_date, position),
    )
    return card_id


_UNCHANGED = object()  # sentinel: caller did not supply due_date, leave it as-is


def edit_card(
    conn: sqlite3.Connection,
    username: str,
    card_id: str,
    title: str,
    details: str,
    board_id: str | None = None,
    due_date: str | None = _UNCHANGED,  # type: ignore[assignment]
) -> None:
    actual_board_id = _get_board_id(conn, username, board_id)
    _card_in_board(conn, actual_board_id, card_id)
    if due_date is _UNCHANGED:
        conn.execute(
            "UPDATE cards SET title = ?, details = ? WHERE id = ?",
            (title, details, card_id),
        )
    else:
        conn.execute(
            "UPDATE cards SET title = ?, details = ?, due_date = ? WHERE id = ?",
            (title, details, due_date, card_id),
        )


def delete_card(
    conn: sqlite3.Connection,
    username: str,
    card_id: str,
    board_id: str | None = None,
) -> None:
    actual_board_id = _get_board_id(conn, username, board_id)
    row = _card_in_board(conn, actual_board_id, card_id)
    column_id = row["column_id"]
    position = row["position"]
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    conn.execute(
        "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
        (column_id, position),
    )


def move_card(
    conn: sqlite3.Connection,
    username: str,
    card_id: str,
    to_column_id: str,
    to_index: int,
    board_id: str | None = None,
) -> None:
    actual_board_id = _get_board_id(conn, username, board_id)
    row = _card_in_board(conn, actual_board_id, card_id)
    _assert_column_in_board(conn, actual_board_id, to_column_id)

    from_column = row["column_id"]
    from_position = row["position"]

    if from_column == to_column_id:
        count = conn.execute(
            "SELECT COUNT(*) FROM cards WHERE column_id = ?", (from_column,)
        ).fetchone()[0]
        clamped = max(0, min(to_index, count - 1))
        if clamped == from_position:
            return
    else:
        count = conn.execute(
            "SELECT COUNT(*) FROM cards WHERE column_id = ?", (to_column_id,)
        ).fetchone()[0]
        clamped = max(0, min(to_index, count))

    # Stash the moving card to position -1 so position UPDATEs don't collide with it.
    conn.execute(
        "UPDATE cards SET column_id = ?, position = -1 WHERE id = ?",
        (to_column_id, card_id),
    )

    if from_column == to_column_id:
        if clamped > from_position:
            conn.execute(
                "UPDATE cards SET position = position - 1 "
                "WHERE column_id = ? AND position > ? AND position <= ?",
                (from_column, from_position, clamped),
            )
        else:
            conn.execute(
                "UPDATE cards SET position = position + 1 "
                "WHERE column_id = ? AND position >= ? AND position < ?",
                (from_column, clamped, from_position),
            )
    else:
        conn.execute(
            "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
            (from_column, from_position),
        )
        conn.execute(
            "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ?",
            (to_column_id, clamped),
        )

    conn.execute("UPDATE cards SET position = ? WHERE id = ?", (clamped, card_id))
