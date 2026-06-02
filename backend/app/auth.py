import hashlib
import secrets
import sqlite3

from fastapi import HTTPException, Request, status


def _derive(password: str, salt: str) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260_000)
    return dk.hex()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    return f"{salt}${_derive(password, salt)}"


def verify_password(password: str, stored: str) -> bool:
    salt, _ = stored.split("$", 1)
    expected = f"{salt}${_derive(password, salt)}"
    return secrets.compare_digest(expected, stored)


def check_credentials(conn: sqlite3.Connection, username: str, password: str) -> bool:
    row = conn.execute(
        "SELECT password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if not row or not row["password_hash"]:
        return False
    return verify_password(password, row["password_hash"])


def create_user(conn: sqlite3.Connection, username: str, password: str) -> str:
    from app.db import new_id  # lazy import to avoid circular dependency at module level

    existing = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Username already taken"
        )
    user_id = new_id("user")
    conn.execute(
        "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
        (user_id, username, hash_password(password)),
    )
    return user_id


def current_user(request: Request) -> str:
    username = request.session.get("username")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    return username
