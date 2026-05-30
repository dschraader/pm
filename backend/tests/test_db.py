import pytest
from fastapi import HTTPException

from app import board, db


def test_init_creates_db_with_seed(tmp_path, monkeypatch):
    fresh = tmp_path / "fresh.db"
    monkeypatch.setattr(db, "DB_PATH", fresh)

    assert not fresh.exists()
    db.init_db()
    assert fresh.exists()

    conn = db.connect()
    try:
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM boards").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM columns").fetchone()[0] == 5
        assert conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0] == 8
    finally:
        conn.close()


def test_init_is_idempotent_when_db_exists():
    # The autouse fixture already initialized the DB once; re-running must not duplicate.
    db.init_db()
    conn = db.connect()
    try:
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0] == 8
    finally:
        conn.close()


def test_cross_user_isolation():
    conn = db.connect()
    try:
        conn.execute("INSERT INTO users (id, username) VALUES (?, ?)", ("user-b", "userb"))
        conn.execute(
            "INSERT INTO boards (id, user_id, title) VALUES (?, ?, ?)",
            ("board-b", "user-b", "B's Board"),
        )
        conn.execute(
            "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
            ("col-b1", "board-b", "Only column", 0),
        )
        conn.commit()

        a = board.load_board(conn, "user")
        b = board.load_board(conn, "userb")
        assert len(a["columns"]) == 5
        assert len(b["columns"]) == 1
        assert b["columns"][0]["id"] == "col-b1"

        # userb cannot mutate user's column even though it's a real column id
        with pytest.raises(HTTPException) as exc:
            board.rename_column(conn, "userb", "col-backlog", "Hijack")
        assert exc.value.status_code == 404

        # user cannot mutate userb's column
        with pytest.raises(HTTPException) as exc:
            board.rename_column(conn, "user", "col-b1", "Hijack back")
        assert exc.value.status_code == 404

        # ... and the load_board results are unchanged
        assert (
            board.load_board(conn, "user")["columns"][0]["title"]
            == "Backlog"
        )
        assert (
            board.load_board(conn, "userb")["columns"][0]["title"]
            == "Only column"
        )
    finally:
        conn.close()


def test_cascade_delete_user_wipes_board():
    conn = db.connect()
    try:
        conn.execute("DELETE FROM users WHERE id = ?", ("user-default",))
        conn.commit()
        assert conn.execute("SELECT COUNT(*) FROM boards").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM columns").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0] == 0
    finally:
        conn.close()
