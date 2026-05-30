import os
import secrets
import sqlite3
from pathlib import Path
from typing import Iterator

DB_PATH = Path(os.environ.get("PM_DB_PATH", "/app/data/pm.db"))

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  username   TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS boards (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS columns (
  id       TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title    TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_columns_board_position ON columns(board_id, position);
CREATE TABLE IF NOT EXISTS cards (
  id        TEXT PRIMARY KEY,
  column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  details   TEXT NOT NULL DEFAULT '',
  position  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_column_position ON cards(column_id, position);
"""

SEED_USER = ("user-default", "user")
SEED_BOARD = ("board-default", "user-default", "My Board")
SEED_COLUMNS = [
    ("col-backlog",   "Backlog",     0),
    ("col-discovery", "Discovery",   1),
    ("col-progress",  "In Progress", 2),
    ("col-review",    "Review",      3),
    ("col-done",      "Done",        4),
]
SEED_CARDS = [
    ("col-backlog",   "card-1", "Align roadmap themes",     "Draft quarterly themes with impact statements and metrics."),
    ("col-backlog",   "card-2", "Gather customer signals",  "Review support tags, sales notes, and churn feedback."),
    ("col-discovery", "card-3", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    ("col-progress",  "card-4", "Refine status language",   "Standardize column labels and tone across the board."),
    ("col-progress",  "card-5", "Design card layout",       "Add hierarchy and spacing for scanning dense lists."),
    ("col-review",    "card-6", "QA micro-interactions",    "Verify hover, focus, and loading states."),
    ("col-done",      "card-7", "Ship marketing page",      "Final copy approved and asset pack delivered."),
    ("col-done",      "card-8", "Close onboarding sprint",  "Document release notes and share internally."),
]


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def get_db() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.executescript(SCHEMA_SQL)
        existing = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if existing == 0:
            _seed(conn)
        conn.commit()
    finally:
        conn.close()


def _seed(conn: sqlite3.Connection) -> None:
    conn.execute("INSERT INTO users (id, username) VALUES (?, ?)", SEED_USER)
    conn.execute(
        "INSERT INTO boards (id, user_id, title) VALUES (?, ?, ?)", SEED_BOARD
    )
    for col_id, title, position in SEED_COLUMNS:
        conn.execute(
            "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
            (col_id, SEED_BOARD[0], title, position),
        )
    position_by_column: dict[str, int] = {}
    for column_id, card_id, title, details in SEED_CARDS:
        position = position_by_column.get(column_id, 0)
        conn.execute(
            "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)",
            (card_id, column_id, title, details, position),
        )
        position_by_column[column_id] = position + 1


def new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(3)}"
