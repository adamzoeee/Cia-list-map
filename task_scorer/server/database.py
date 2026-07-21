"""SQLite 数据库层 —— 连接管理、建表、CRUD 操作。"""
import sqlite3
import os
import string
import threading
import uuid
import secrets
from typing import Optional

DB_PATH = os.environ.get(
    "COLLAB_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "collaboration.db"),
)

_conn: Optional[sqlite3.Connection] = None
_lock = threading.Lock()


def get_db() -> sqlite3.Connection:
    """获取数据库连接（单例），启用 WAL 模式和外键约束。"""
    global _conn
    if _conn is None:
        with _lock:
            if _conn is None:  # 双重检查
                try:
                    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
                    _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
                    _conn.row_factory = sqlite3.Row
                    _conn.execute("PRAGMA journal_mode=WAL")
                    _conn.execute("PRAGMA foreign_keys=ON")
                    _init_tables(_conn)
                except (OSError, sqlite3.Error) as e:
                    raise RuntimeError(f"数据库初始化失败 ({DB_PATH}): {e}") from e
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
        try:
            _conn.close()
        except Exception:
            pass
        finally:
            _conn = None


def generate_invite_code() -> str:
    """生成 6 位大写字母+数字邀请码。"""
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(secrets.choice(alphabet) for _ in range(6))
        db = get_db()
        if not db.execute("SELECT 1 FROM teams WHERE invite_code = ?", (code,)).fetchone():
            return code


def create_team(name: str, creator_user_id: str, creator_nickname: str) -> dict:
    """创建团队并自动将创建者加入为 owner。返回 team dict。"""
    db = get_db()
    team_id = str(uuid.uuid4())
    invite_code = generate_invite_code()
    try:
        db.execute(
            "INSERT INTO teams (id, name, invite_code, created_by) VALUES (?, ?, ?, ?)",
            (team_id, name, invite_code, creator_user_id)
        )
        member_id = str(uuid.uuid4())
        db.execute(
            "INSERT INTO members (id, team_id, user_id, nickname, role) VALUES (?, ?, ?, ?, 'owner')",
            (member_id, team_id, creator_user_id, creator_nickname)
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return dict(db.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone())


def get_team_by_invite_code(invite_code: str) -> dict | None:
    """通过邀请码查找团队。"""
    db = get_db()
    row = db.execute("SELECT * FROM teams WHERE invite_code = ?", (invite_code,)).fetchone()
    return dict(row) if row else None


def get_team(team_id: str) -> dict | None:
    """通过 ID 获取团队。"""
    db = get_db()
    row = db.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()
    return dict(row) if row else None


def delete_team(team_id: str, user_id: str) -> bool:
    """解散团队（仅 owner）。返回是否成功。"""
    db = get_db()
    member = db.execute(
        "SELECT role FROM members WHERE team_id = ? AND user_id = ?",
        (team_id, user_id)
    ).fetchone()
    if not member or member["role"] != "owner":
        return False
    db.execute("DELETE FROM teams WHERE id = ?", (team_id,))
    db.commit()
    return True


def join_team(team_id: str, user_id: str, nickname: str) -> dict | None:
    """加入团队。如果团队不存在或已加入返回 None。返回 member dict。"""
    db = get_db()
    # 检查团队是否存在
    if not get_team(team_id):
        return None
    existing = db.execute(
        "SELECT * FROM members WHERE team_id = ? AND user_id = ?",
        (team_id, user_id)
    ).fetchone()
    if existing:
        return None
    member_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO members (id, team_id, user_id, nickname) VALUES (?, ?, ?, ?)",
        (member_id, team_id, user_id, nickname)
    )
    db.commit()
    return dict(db.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone())


def leave_team(team_id: str, user_id: str) -> bool:
    """退出团队。owner 不能退出（需先解散或转让）。"""
    db = get_db()
    member = db.execute(
        "SELECT * FROM members WHERE team_id = ? AND user_id = ?",
        (team_id, user_id)
    ).fetchone()
    if not member or member["role"] == "owner":
        return False
    db.execute("DELETE FROM members WHERE team_id = ? AND user_id = ?", (team_id, user_id))
    db.commit()
    return True


def get_members(team_id: str) -> list[dict]:
    """获取团队所有成员。"""
    db = get_db()
    return [dict(r) for r in db.execute(
        "SELECT * FROM members WHERE team_id = ? ORDER BY joined_at", (team_id,)
    ).fetchall()]


def list_tasks(team_id: str) -> list[dict]:
    """获取团队所有任务。"""
    db = get_db()
    return [dict(r) for r in db.execute(
        "SELECT * FROM tasks WHERE team_id = ? ORDER BY created_at DESC", (team_id,)
    ).fetchall()]


def create_task(team_id: str, title: str, description: str,
                urgency: float, importance: float, quadrant: int,
                created_by: str) -> dict:
    """创建任务。返回 task dict。"""
    db = get_db()
    task_id = str(uuid.uuid4())
    try:
        db.execute(
            """INSERT INTO tasks (id, team_id, title, description, urgency, importance,
               quadrant, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (task_id, team_id, title, description, urgency, importance, quadrant, created_by)
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return dict(db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())


def update_task(task_id: str, user_id: str, updates: dict) -> dict | None:
    """更新任务（原子乐观锁）。返回更新后的 task dict，冲突或不存在返回 None。"""
    db = get_db()
    # 权限检查：必须是创建者或 team owner
    task = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not task:
        return None
    member = db.execute(
        "SELECT role FROM members WHERE team_id = ? AND user_id = ?",
        (task["team_id"], user_id)
    ).fetchone()
    if task["created_by"] != user_id and (not member or member["role"] != "owner"):
        return None

    allowed_fields = {"title", "description", "urgency", "importance",
                      "quadrant", "completed", "assigned_to"}
    set_clauses = []
    params = []
    for key in allowed_fields & set(updates.keys()):
        set_clauses.append(f"{key} = ?")
        params.append(updates[key])

    if not set_clauses:
        return dict(task)

    set_clauses.append("version = version + 1")
    set_clauses.append("updated_at = datetime('now')")
    params.append(task_id)
    params.append(updates.get("version", 0))

    try:
        sql = f"UPDATE tasks SET {', '.join(set_clauses)} WHERE id = ? AND version = ?"
        cursor = db.execute(sql, params)
        if cursor.rowcount == 0:
            db.rollback()
            return None  # 乐观锁冲突
        db.commit()
    except Exception:
        db.rollback()
        raise

    return dict(db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())


def delete_task(task_id: str, user_id: str) -> bool:
    """删除任务（仅创建者或 team owner）。"""
    db = get_db()
    task = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not task:
        return False
    # 检查权限：创建者 或 team owner
    member = db.execute(
        "SELECT role FROM members WHERE team_id = ? AND user_id = ?",
        (task["team_id"], user_id)
    ).fetchone()
    if task["created_by"] != user_id and (not member or member["role"] != "owner"):
        return False
    try:
        db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return True
