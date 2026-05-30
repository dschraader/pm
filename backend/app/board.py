import sqlite3
from typing import Any

from fastapi import HTTPException, status

from app.db import new_id


def _board_id_for_user(conn: sqlite3.Connection, username: str) -> str:
    row = conn.execute(
        "SELECT b.id FROM boards b JOIN users u ON u.id = b.user_id WHERE u.username = ?",
        (username,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    return row["id"]


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


def load_board(conn: sqlite3.Connection, username: str) -> dict[str, Any]:
    board_id = _board_id_for_user(conn, username)
    columns = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position, id",
        (board_id,),
    ).fetchall()
    card_rows = conn.execute(
        """
        SELECT c.id, c.column_id, c.title, c.details
        FROM cards c
        JOIN columns col ON col.id = c.column_id
        WHERE col.board_id = ?
        ORDER BY c.column_id, c.position, c.id
        """,
        (board_id,),
    ).fetchall()

    cards: dict[str, dict[str, str]] = {}
    cards_by_column: dict[str, list[str]] = {}
    for row in card_rows:
        cards[row["id"]] = {
            "id": row["id"],
            "title": row["title"],
            "details": row["details"],
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


def rename_column(conn: sqlite3.Connection, username: str, column_id: str, new_title: str) -> None:
    board_id = _board_id_for_user(conn, username)
    _assert_column_in_board(conn, board_id, column_id)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (new_title, column_id))


def create_card(
    conn: sqlite3.Connection,
    username: str,
    column_id: str,
    title: str,
    details: str,
) -> str:
    board_id = _board_id_for_user(conn, username)
    _assert_column_in_board(conn, board_id, column_id)
    position = conn.execute(
        "SELECT COUNT(*) FROM cards WHERE column_id = ?", (column_id,)
    ).fetchone()[0]
    card_id = new_id("card")
    conn.execute(
        "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)",
        (card_id, column_id, title, details, position),
    )
    return card_id


def edit_card(
    conn: sqlite3.Connection,
    username: str,
    card_id: str,
    title: str,
    details: str,
) -> None:
    board_id = _board_id_for_user(conn, username)
    _card_in_board(conn, board_id, card_id)
    conn.execute(
        "UPDATE cards SET title = ?, details = ? WHERE id = ?",
        (title, details, card_id),
    )


def delete_card(conn: sqlite3.Connection, username: str, card_id: str) -> None:
    board_id = _board_id_for_user(conn, username)
    row = _card_in_board(conn, board_id, card_id)
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
) -> None:
    board_id = _board_id_for_user(conn, username)
    row = _card_in_board(conn, board_id, card_id)
    _assert_column_in_board(conn, board_id, to_column_id)

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
