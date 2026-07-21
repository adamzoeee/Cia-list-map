"""SQLite 数据库层 —— 连接管理、建表、CRUD 操作。"""
import sqlite3
import os
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "collaboration.db")

_conn: Optional[sqlite3.Connection] = None


def get_db() -> sqlite3.Connection:
    """获取数据库连接（单例），启用 WAL 模式和外键约束。"""
    global _conn
    if _conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA foreign_keys=ON")
        _init_tables(_conn)
    return _conn


def _init_tables(conn: sqlite3.Connection) -> None:
    """创建 teams、members、tasks 表（如不存在）。"""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS teams (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            invite_code TEXT NOT NULL UNIQUE,
            created_by  TEXT NOT NULL,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS members (
            id        TEXT PRIMARY KEY,
            team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            user_id   TEXT NOT NULL,
            nickname  TEXT NOT NULL DEFAULT '',
            role      TEXT NOT NULL DEFAULT 'member',
            joined_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(team_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id           TEXT PRIMARY KEY,
            team_id      TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            title        TEXT NOT NULL,
            description  TEXT NOT NULL DEFAULT '',
            urgency      REAL NOT NULL DEFAULT 0,
            importance   REAL NOT NULL DEFAULT 0,
            quadrant     INTEGER NOT NULL DEFAULT 1,
            completed    INTEGER NOT NULL DEFAULT 0,
            created_by   TEXT NOT NULL,
            assigned_to  TEXT,
            version      INTEGER NOT NULL DEFAULT 1,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id);
    """)
    conn.commit()


def close_db() -> None:
    """关闭数据库连接。"""
    global _conn
    if _conn:
        _conn.close()
        _conn = None
