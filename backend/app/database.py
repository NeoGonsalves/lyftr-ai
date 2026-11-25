from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import os
import sqlite3
from typing import Iterator


class Database:
    def __init__(self, database_url: str) -> None:
        prefix = "sqlite:///"
        if not database_url.startswith(prefix):
            raise ValueError("DATABASE_URL must be a SQLite URL")
        self.path = database_url.removeprefix(prefix)
        if self.path.startswith("/") and os.name == "nt":
            # sqlite:////data/app.db is POSIX Docker syntax; tests use a normal local URL.
            self.path = self.path.lstrip("/")

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        directory = os.path.dirname(self.path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        with self.connection() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    system_prompt TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                    content TEXT NOT NULL,
                    metadata TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id)
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_messages_session_order ON messages(session_id, id)"
            )

    def session(self, session_id: str) -> sqlite3.Row | None:
        with self.connection() as connection:
            return connection.execute(
                "SELECT session_id, system_prompt FROM sessions WHERE session_id = ?", (session_id,)
            ).fetchone()

    def messages(self, session_id: str) -> list[dict[str, object]]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC", (session_id,)
            ).fetchall()
        return [{"role": row["role"], "content": row["content"]} for row in rows]

    def public_messages(self, session_id: str) -> list[dict[str, object]] | None:
        if self.session(session_id) is None:
            return None
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT role, content, metadata FROM messages WHERE session_id = ? ORDER BY id ASC", (session_id,)
            ).fetchall()
        import json

        result: list[dict[str, object]] = []
        for row in rows:
            message: dict[str, object] = {"role": row["role"], "content": row["content"]}
            if row["metadata"]:
                message["metadata"] = json.loads(row["metadata"])
            result.append(message)
        return result

    def save_exchange(
        self,
        session_id: str,
        system_prompt: str,
        user_message: str,
        assistant_message: str,
        metadata: dict[str, object],
    ) -> None:
        import json

        now = datetime.now(timezone.utc).isoformat()
        with self.connection() as connection:
            connection.execute(
                """
                INSERT INTO sessions(session_id, system_prompt, created_at) VALUES (?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET system_prompt = excluded.system_prompt
                """,
                (session_id, system_prompt, now),
            )
            connection.execute(
                "INSERT INTO messages(session_id, role, content, metadata, created_at) VALUES (?, 'user', ?, NULL, ?)",
                (session_id, user_message, now),
            )
            connection.execute(
                "INSERT INTO messages(session_id, role, content, metadata, created_at) VALUES (?, 'assistant', ?, ?, ?)",
                (session_id, assistant_message, json.dumps(metadata), now),
            )
