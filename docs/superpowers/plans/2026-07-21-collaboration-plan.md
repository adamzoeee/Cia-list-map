# 云端协作功能实现计划

> **面向 AI 代理的工作者：** 必需技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 Cia-list-map 添加共享任务池模式的团队协作功能 —— 扩展 FastAPI 后端（SQLite + WebSocket）、前端新增团队面板与协作 Hook。

**架构：** FastAPI 新增协作路由 + SQLite 持久化 + WebSocket 房间广播；前端通过 `useCollaboration` Hook 管理实时同步，`TeamPanel`/`TeamSetup` 组件处理团队生命周期。极简邀请码认证，乐观锁并发控制。

**技术栈：** Python 3.14, FastAPI, SQLite (sqlite3), WebSocket (fastapi.WebSocket), React 19, TypeScript 6.0, Motion (Framer Motion)

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 新增 | `task_scorer/server/database.py` | SQLite 连接管理、建表、CRUD 操作 |
| 新增 | `task_scorer/server/models.py` | Pydantic 请求/响应模型 |
| 新增 | `task_scorer/server/collaboration.py` | WebSocket 连接管理器、事件广播 |
| 修改 | `task_scorer/server/app.py` | 注册新路由、WebSocket 端点、启动初始化 |
| 修改 | `Cia-list-map-main/src/types.ts` | 扩展 Task 类型，新增 Team/Member/UserProfile |
| 新增 | `Cia-list-map-main/src/api/collaboration.ts` | 协作 HTTP API 客户端 |
| 新增 | `Cia-list-map-main/src/hooks/useCollaboration.ts` | WebSocket 连接 + 协作状态管理 Hook |
| 新增 | `Cia-list-map-main/src/components/TeamSetup.tsx` | 首次设置：昵称 → 创建/加入团队 |
| 新增 | `Cia-list-map-main/src/components/TeamPanel.tsx` | 团队信息、在线成员、邀请码复制、退出 |
| 修改 | `Cia-list-map-main/src/components/TaskCard.tsx` | 显示创建者/认领者昵称 + 认领按钮 |
| 修改 | `Cia-list-map-main/src/components/TaskInputForm.tsx` | 协作模式走 HTTP API |
| 修改 | `Cia-list-map-main/src/App.tsx` | 集成协作状态、模式切换 |

---

### 任务 1：SQLite 数据库层 —— 初始化与建表

**文件：**
- 创建：`task_scorer/server/database.py`
- 修改：`task_scorer/server/app.py`

- [ ] **步骤 1：创建 database.py，实现数据库初始化与建表**

```python
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
```

- [ ] **步骤 2：在 app.py 启动事件中初始化数据库，关闭事件中关闭**

在 `app.py` 中，找到 `app = FastAPI(...)` 后添加：

```python
from .database import get_db, close_db

@app.on_event("startup")
async def startup():
    get_db()  # 初始化数据库

@app.on_event("shutdown")
async def shutdown():
    close_db()
```

原 `app.py` 中如果已有 lifespan 或 on_event，则合并到现有生命周期中。如果使用 `lifespan` 上下文管理器，改为：

```python
from contextlib import asynccontextmanager
from .database import get_db, close_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    get_db()
    yield
    close_db()

app = FastAPI(lifespan=lifespan, ...)
```

- [ ] **步骤 3：验证 —— 启动服务确认表创建成功**

```bash
cd E:\.PJs\Cia-list-map\task_scorer && python -c "from server.database import get_db; db=get_db(); print(list(db.execute('SELECT name FROM sqlite_master WHERE type=\"table\"')))"
```

预期：输出 `[('teams',), ('members',), ('tasks',)]`

- [ ] **步骤 4：Commit**

```bash
git add task_scorer/server/database.py task_scorer/server/app.py
git commit -m "feat(collab): add SQLite database layer with table initialization"
```

---

### 任务 2：SQLite 数据库层 —— 团队与成员 CRUD

**文件：**
- 修改：`task_scorer/server/database.py`

- [ ] **步骤 1：添加团队 CRUD 函数**

在 `database.py` 末尾追加：

```python
import uuid
import secrets
import string

def generate_invite_code() -> str:
    """生成 6 位大写字母+数字邀请码。"""
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(secrets.choice(alphabet) for _ in range(6))
        # 确保唯一
        db = get_db()
        if not db.execute("SELECT 1 FROM teams WHERE invite_code = ?", (code,)).fetchone():
            return code

# ── 团队 ──

def create_team(name: str, creator_user_id: str, creator_nickname: str) -> dict:
    """创建团队并自动将创建者加入为 owner。返回 team dict。"""
    db = get_db()
    team_id = str(uuid.uuid4())
    invite_code = generate_invite_code()
    db.execute(
        "INSERT INTO teams (id, name, invite_code, created_by) VALUES (?, ?, ?, ?)",
        (team_id, name, invite_code, creator_user_id)
    )
    # 创建者自动加入
    member_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO members (id, team_id, user_id, nickname, role) VALUES (?, ?, ?, ?, 'owner')",
        (member_id, team_id, creator_user_id, creator_nickname)
    )
    db.commit()
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

# ── 成员 ──

def join_team(team_id: str, user_id: str, nickname: str) -> dict | None:
    """加入团队。如果已加入返回 None。返回 member dict。"""
    db = get_db()
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
```

- [ ] **步骤 2：验证 —— 测试 CRUD 函数**

```bash
cd E:\.PJs\Cia-list-map\task_scorer && python -c "
from server.database import get_db, create_team, get_team_by_invite_code, join_team, get_members, leave_team, delete_team
# 创建团队
team = create_team('测试团队', 'user-001', 'Alice')
print('Created:', team['name'], 'invite:', team['invite_code'])
# 通过 invite_code 查找
found = get_team_by_invite_code(team['invite_code'])
print('Found by invite:', found['name'])
# 加入成员
m = join_team(team['id'], 'user-002', 'Bob')
print('Member joined:', m['nickname'])
# 列出成员
members = get_members(team['id'])
print('Members:', [m['nickname'] for m in members])
# 退出
left = leave_team(team['id'], 'user-002')
print('Bob left:', left)
# 解散
deleted = delete_team(team['id'], 'user-001')
print('Team deleted:', deleted)
"
```

预期：全部输出正常，无异常。

- [ ] **步骤 3：Commit**

```bash
git add task_scorer/server/database.py
git commit -m "feat(collab): add team and member CRUD functions"
```

---

### 任务 3：SQLite 数据库层 —— 任务 CRUD

**文件：**
- 修改：`task_scorer/server/database.py`

- [ ] **步骤 1：添加任务 CRUD 函数**

在 `database.py` 末尾追加：

```python
# ── 任务 ──

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
    db.execute(
        """INSERT INTO tasks (id, team_id, title, description, urgency, importance,
           quadrant, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (task_id, team_id, title, description, urgency, importance, quadrant, created_by)
    )
    db.commit()
    return dict(db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())

def update_task(task_id: str, user_id: str, updates: dict) -> dict | None:
    """更新任务（乐观锁）。updates 必须包含 version 字段。
    返回更新后的 task dict，版本冲突返回 None。"""
    db = get_db()
    current = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not current:
        return None
    if current["version"] != updates.get("version"):
        return None  # 乐观锁冲突

    allowed_fields = {"title", "description", "urgency", "importance",
                      "quadrant", "completed", "assigned_to"}
    set_clauses = []
    params = []
    for key in allowed_fields & set(updates.keys()):
        set_clauses.append(f"{key} = ?")
        params.append(updates[key])

    if not set_clauses:
        return dict(current)

    set_clauses.append("version = version + 1")
    set_clauses.append("updated_at = datetime('now')")
    params.extend([task_id])
    sql = f"UPDATE tasks SET {', '.join(set_clauses)} WHERE id = ?"
    db.execute(sql, params)
    db.commit()
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
    db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    db.commit()
    return True
```

- [ ] **步骤 2：验证 —— 测试任务 CRUD**

```bash
cd E:\.PJs\Cia-list-map\task_scorer && python -c "
from server.database import get_db, create_team, create_task, list_tasks, update_task, delete_task
team = create_team('任务测试', 'user-001', 'Alice')
task = create_task(team['id'], '写报告', '季度报告', 3.0, 4.0, 1, 'user-001')
print('Created task:', task['title'], 'v', task['version'])
# 更新
updated = update_task(task['id'], 'user-001', {'title': '写报告v2', 'version': 1})
print('Updated:', updated['title'], 'v', updated['version'])
# 乐观锁冲突
conflict = update_task(task['id'], 'user-002', {'title': 'hack', 'version': 1})
print('Conflict:', conflict)  # 应为 None
# 列表
tasks = list_tasks(team['id'])
print('Tasks:', [t['title'] for t in tasks])
# 删除
deleted = delete_task(task['id'], 'user-001')
print('Deleted:', deleted)
# 清理
from server.database import delete_team
delete_team(team['id'], 'user-001')
"
```

预期：update 成功 version 变 2，conflict 返回 None，delete 返回 True。

- [ ] **步骤 3：Commit**

```bash
git add task_scorer/server/database.py
git commit -m "feat(collab): add task CRUD with optimistic locking"
```

---

### 任务 4：Pydantic 模型与协作管理器

**文件：**
- 创建：`task_scorer/server/models.py`
- 创建：`task_scorer/server/collaboration.py`

- [ ] **步骤 1：创建 Pydantic 模型**

```python
"""Pydantic 请求/响应模型。"""
from pydantic import BaseModel, Field
from typing import Optional

# ── 团队 ──
class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    creator_user_id: str
    creator_nickname: str = Field(..., min_length=1, max_length=30)

class JoinTeamRequest(BaseModel):
    invite_code: str = Field(..., min_length=6, max_length=6)
    user_id: str
    nickname: str = Field(..., min_length=1, max_length=30)

class LeaveTeamRequest(BaseModel):
    user_id: str

class DeleteTeamRequest(BaseModel):
    user_id: str

# ── 任务 ──
class CreateTaskRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    urgency: float = Field(default=0, ge=-5, le=5)
    importance: float = Field(default=0, ge=-5, le=5)
    quadrant: int = Field(default=1, ge=1, le=4)
    created_by: str

class UpdateTaskRequest(BaseModel):
    user_id: str
    version: int
    title: Optional[str] = None
    description: Optional[str] = None
    urgency: Optional[float] = None
    importance: Optional[float] = None
    quadrant: Optional[int] = None
    completed: Optional[bool] = None
    assigned_to: Optional[str] = None

class DeleteTaskRequest(BaseModel):
    user_id: str
```

- [ ] **步骤 2：创建 WebSocket 协作管理器**

```python
"""WebSocket 连接管理器 —— 房间广播、事件推送。"""
from fastapi import WebSocket
from typing import Dict, Set
import json

class CollaborationManager:
    """管理 WebSocket 连接，按 team_id 分组广播。"""

    def __init__(self):
        # team_id -> set of WebSocket
        self._rooms: Dict[str, Set[WebSocket]] = {}

    async def connect(self, team_id: str, websocket: WebSocket) -> None:
        """接受连接并加入房间。"""
        await websocket.accept()
        if team_id not in self._rooms:
            self._rooms[team_id] = set()
        self._rooms[team_id].add(websocket)

    def disconnect(self, team_id: str, websocket: WebSocket) -> None:
        """从房间移除连接。"""
        if team_id in self._rooms:
            self._rooms[team_id].discard(websocket)
            if not self._rooms[team_id]:
                del self._rooms[team_id]

    async def broadcast(self, team_id: str, event_type: str, payload: dict) -> None:
        """向房间所有连接广播事件。"""
        if team_id not in self._rooms:
            return
        message = json.dumps({
            "type": event_type,
            "payload": payload,
            "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z"
        }, ensure_ascii=False)
        dead: set[WebSocket] = set()
        for ws in self._rooms[team_id]:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        # 清理死连接
        for ws in dead:
            self._rooms[team_id].discard(ws)

    def room_size(self, team_id: str) -> int:
        """获取房间在线人数。"""
        return len(self._rooms.get(team_id, set()))

# 全局单例
manager = CollaborationManager()
```

- [ ] **步骤 3：Commit**

```bash
git add task_scorer/server/models.py task_scorer/server/collaboration.py
git commit -m "feat(collab): add Pydantic models and WebSocket collaboration manager"
```

---

### 任务 5：FastAPI 团队 API 路由

**文件：**
- 修改：`task_scorer/server/app.py`

- [ ] **步骤 1：在 app.py 中添加团队 API 路由**

找到 `app = FastAPI(...)`，在其后合适位置添加以下路由（放在现有路由旁）。先添加 imports：

```python
from . import database as db
from .models import (
    CreateTeamRequest, JoinTeamRequest, LeaveTeamRequest, DeleteTeamRequest,
    CreateTaskRequest, UpdateTaskRequest, DeleteTaskRequest,
)
from .collaboration import manager
from fastapi import WebSocket, WebSocketDisconnect, HTTPException
```

然后添加团队路由：

```python
# ── 团队 API ──

@app.post("/api/teams")
async def api_create_team(req: CreateTeamRequest):
    team = db.create_team(req.name, req.creator_user_id, req.creator_nickname)
    return {"team": team}

@app.post("/api/teams/join")
async def api_join_team(req: JoinTeamRequest):
    team = db.get_team_by_invite_code(req.invite_code.upper())
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在，请检查邀请码")
    member = db.join_team(team["id"], req.user_id, req.nickname)
    if member is None:
        raise HTTPException(status_code=409, detail="你已在该团队中")
    tasks = db.list_tasks(team["id"])
    members = db.get_members(team["id"])
    # 广播成员加入
    await manager.broadcast(team["id"], "member_joined", {
        "member": member, "members": members
    })
    return {"team": team, "tasks": tasks, "members": members}

@app.get("/api/teams/{team_id}")
async def api_get_team(team_id: str):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    return {"team": team}

@app.get("/api/teams/{team_id}/members")
async def api_get_members(team_id: str):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    return {"members": db.get_members(team_id)}

@app.post("/api/teams/{team_id}/leave")
async def api_leave_team(team_id: str, req: LeaveTeamRequest):
    if not db.leave_team(team_id, req.user_id):
        raise HTTPException(status_code=403, detail="创建者不能退出，请先解散团队")
    members = db.get_members(team_id)
    await manager.broadcast(team_id, "member_left", {
        "userId": req.user_id, "members": members
    })
    return {"ok": True}

@app.delete("/api/teams/{team_id}")
async def api_delete_team(team_id: str, req: DeleteTeamRequest):
    if not db.delete_team(team_id, req.user_id):
        raise HTTPException(status_code=403, detail="仅创建者可解散团队")
    return {"ok": True}
```

- [ ] **步骤 2：添加任务 API 路由**

```python
# ── 任务 API ──

@app.get("/api/teams/{team_id}/tasks")
async def api_list_tasks(team_id: str):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    return {"tasks": db.list_tasks(team_id)}

@app.post("/api/teams/{team_id}/tasks")
async def api_create_task(team_id: str, req: CreateTaskRequest):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    task = db.create_task(team_id, req.title, req.description,
                          req.urgency, req.importance, req.quadrant, req.created_by)
    await manager.broadcast(team_id, "task_created", {"task": task})
    return {"task": task}

@app.put("/api/teams/{team_id}/tasks/{task_id}")
async def api_update_task(team_id: str, task_id: str, req: UpdateTaskRequest):
    updates = {k: v for k, v in req.model_dump().items()
               if v is not None and k not in ("user_id",)}
    # 确保 version 包含在内
    updates["version"] = req.version
    # 处理 completed 从 bool 转 int
    if "completed" in updates:
        updates["completed"] = 1 if updates["completed"] else 0

    task = db.update_task(task_id, req.user_id, updates)
    if task is None:
        # 判断是冲突还是不存在
        from .database import get_db
        exists = get_db().execute("SELECT 1 FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if exists:
            # 乐观锁冲突，返回最新数据
            latest = dict(get_db().execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())
            raise HTTPException(status_code=409, detail={
                "message": "数据已被他人修改，请刷新",
                "task": latest
            })
        raise HTTPException(status_code=404, detail="任务不存在")
    await manager.broadcast(team_id, "task_updated", {"task": task})
    return {"task": task}

@app.delete("/api/teams/{team_id}/tasks/{task_id}")
async def api_delete_task(team_id: str, task_id: str, req: DeleteTaskRequest):
    if not db.delete_task(task_id, req.user_id):
        raise HTTPException(status_code=403, detail="仅创建者或团队创建者可删除")
    await manager.broadcast(team_id, "task_deleted", {"taskId": task_id})
    return {"ok": True}
```

- [ ] **步骤 3：添加 WebSocket 端点**

```python
# ── WebSocket ──

@app.websocket("/ws/{invite_code}")
async def ws_collaboration(websocket: WebSocket, invite_code: str):
    team = db.get_team_by_invite_code(invite_code.upper())
    if not team:
        await websocket.close(code=4004, reason="团队不存在")
        return
    await manager.connect(team["id"], websocket)
    try:
        while True:
            # 保持连接，接收 ping（不做处理，仅维持心跳）
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(team["id"], websocket)
```

- [ ] **步骤 4：验证 —— 启动服务测试 API**

```bash
cd E:\.PJs\Cia-list-map\task_scorer && timeout 5 python -m uvicorn server.app:app --port 8001 &
sleep 2
# 测试创建团队
curl -s -X POST http://localhost:8001/api/teams \
  -H "Content-Type: application/json" \
  -d '{"name":"测试","creator_user_id":"u1","creator_nickname":"Alice"}' | python -m json.tool
# 测试加入团队（使用返回的 invite_code）
# 测试任务 CRUD
kill %1 2>/dev/null
```

预期：创建团队返回 JSON 含 `team.id` 和 `team.invite_code`。

- [ ] **步骤 5：Commit**

```bash
git add task_scorer/server/app.py
git commit -m "feat(collab): add team/task API routes and WebSocket endpoint"
```

---

### 任务 6：前端类型扩展

**文件：**
- 修改：`Cia-list-map-main/src/types.ts`

- [ ] **步骤 1：扩展 types.ts**

在现有 `types.ts` 中：

```typescript
// 现有类型保持不变（Task, TaskInput, AIAnalysisResult, QuadrantInfo 等）

// 新增：
export interface Team {
  id: string;
  name: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
}

export interface Member {
  id: string;
  teamId: string;
  userId: string;
  nickname: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface UserProfile {
  userId: string;
  nickname: string;
}

// Task 类型合并协作字段（需修改现有 Task interface）
export interface Task {
  id: string;
  title: string;
  description: string;
  urgency: number;
  importance: number;
  quadrant: 1 | 2 | 3 | 4;
  completed: boolean;
  createdAt: string;
  // 协作新增字段
  createdBy: string;
  assignedTo?: string;
  updatedAt: string;
  version: number;
}

// WebSocket 事件类型
export type WsEventType = 'task_created' | 'task_updated' | 'task_deleted' | 'member_joined' | 'member_left';

export interface WsMessage {
  type: WsEventType;
  payload: Record<string, unknown>;
  timestamp: string;
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

```bash
cd E:\.PJs\Cia-list-map\Cia-list-map-main && npx tsc --noEmit 2>&1 | head -20
```

预期：无新增类型错误（可能有旧代码的兼容问题，仅关注 `types.ts` 相关错误）。

- [ ] **步骤 3：Commit**

```bash
git add Cia-list-map-main/src/types.ts
git commit -m "feat(collab): extend TypeScript types for team collaboration"
```

---

### 任务 7：前端 HTTP API 客户端

**文件：**
- 创建：`Cia-list-map-main/src/api/collaboration.ts`

- [ ] **步骤 1：创建 collaboration.ts**

```typescript
import type { Team, Member, Task } from '../types';

const BASE = 'http://localhost:8001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const collabApi = {
  // ── 团队 ──
  createTeam(name: string, creatorUserId: string, creatorNickname: string) {
    return request<{ team: Team }>('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name, creator_user_id: creatorUserId, creator_nickname: creatorNickname }),
    });
  },

  joinTeam(inviteCode: string, userId: string, nickname: string) {
    return request<{ team: Team; tasks: Task[]; members: Member[] }>('/api/teams/join', {
      method: 'POST',
      body: JSON.stringify({
        invite_code: inviteCode.toUpperCase(),
        user_id: userId,
        nickname,
      }),
    });
  },

  getTeam(teamId: string) {
    return request<{ team: Team }>(`/api/teams/${teamId}`);
  },

  getMembers(teamId: string) {
    return request<{ members: Member[] }>(`/api/teams/${teamId}/members`);
  },

  leaveTeam(teamId: string, userId: string) {
    return request<{ ok: boolean }>(`/api/teams/${teamId}/leave`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  deleteTeam(teamId: string, userId: string) {
    return request<{ ok: boolean }>(`/api/teams/${teamId}`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  // ── 任务 ──
  listTasks(teamId: string) {
    return request<{ tasks: Task[] }>(`/api/teams/${teamId}/tasks`);
  },

  createTask(teamId: string, task: {
    title: string; description: string; urgency: number;
    importance: number; quadrant: number; createdBy: string;
  }) {
    return request<{ task: Task }>(`/api/teams/${teamId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({
        title: task.title,
        description: task.description,
        urgency: task.urgency,
        importance: task.importance,
        quadrant: task.quadrant,
        created_by: task.createdBy,
      }),
    });
  },

  updateTask(teamId: string, taskId: string, updates: {
    userId: string; version: number;
    title?: string; description?: string; urgency?: number;
    importance?: number; quadrant?: number;
    completed?: boolean; assignedTo?: string;
  }) {
    return request<{ task: Task }>(`/api/teams/${teamId}/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({
        user_id: updates.userId,
        version: updates.version,
        title: updates.title,
        description: updates.description,
        urgency: updates.urgency,
        importance: updates.importance,
        quadrant: updates.quadrant,
        completed: updates.completed,
        assigned_to: updates.assignedTo,
      }),
    });
  },

  deleteTask(teamId: string, taskId: string, userId: string) {
    return request<{ ok: boolean }>(`/api/teams/${teamId}/tasks/${taskId}`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: userId }),
    });
  },
};
```

- [ ] **步骤 2：验证 TypeScript 编译**

```bash
cd E:\.PJs\Cia-list-map\Cia-list-map-main && npx tsc --noEmit src/api/collaboration.ts 2>&1
```

- [ ] **步骤 3：Commit**

```bash
git add Cia-list-map-main/src/api/collaboration.ts
git commit -m "feat(collab): add collaboration HTTP API client"
```

---

### 任务 8：useCollaboration Hook

**文件：**
- 创建：`Cia-list-map-main/src/hooks/useCollaboration.ts`

- [ ] **步骤 1：创建 useCollaboration Hook**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Task, Member, WsMessage } from '../types';
import { collabApi } from '../api/collaboration';

interface UseCollaborationReturn {
  tasks: Task[];
  members: Member[];
  connected: boolean;
  createTask: (task: { title: string; description: string; urgency: number; importance: number; quadrant: number }) => Promise<Task>;
  updateTask: (taskId: string, updates: { title?: string; description?: string; urgency?: number; importance?: number; quadrant?: number; completed?: boolean; assignedTo?: string }) => Promise<Task>;
  deleteTask: (taskId: string) => Promise<void>;
  claimTask: (taskId: string) => Promise<Task>;
  completeTask: (taskId: string) => Promise<Task>;
}

export function useCollaboration(
  teamId: string | null,
  inviteCode: string | null,
  userId: string,
): UseCollaborationReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const retryDelay = useRef(1000);
  const tasksRef = useRef<Task[]>([]);

  // 保持 tasksRef 同步
  tasksRef.current = tasks;

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (!inviteCode) return;
    const ws = new WebSocket(`ws://localhost:8001/ws/${inviteCode}`);

    ws.onopen = () => {
      setConnected(true);
      retryDelay.current = 1000;
      // 拉取全量快照兜底
      if (teamId) {
        collabApi.listTasks(teamId).then(res => setTasks(res.tasks)).catch(() => {});
        collabApi.getMembers(teamId).then(res => setMembers(res.members)).catch(() => {});
      }
    };

    ws.onmessage = (event) => {
      const msg: WsMessage = JSON.parse(event.data);
      switch (msg.type) {
        case 'task_created': {
          const task = msg.payload.task as Task;
          setTasks(prev => [task, ...prev]);
          break;
        }
        case 'task_updated': {
          const task = msg.payload.task as Task;
          setTasks(prev => prev.map(t => t.id === task.id ? task : t));
          break;
        }
        case 'task_deleted': {
          const taskId = msg.payload.taskId as string;
          setTasks(prev => prev.filter(t => t.id !== taskId));
          break;
        }
        case 'member_joined':
        case 'member_left':
          setMembers(msg.payload.members as Member[]);
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // 指数退避重连
      const delay = retryDelay.current;
      retryDelay.current = Math.min(delay * 2, 30000);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
    return () => {
      ws.close();
    };
  }, [inviteCode, teamId]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
      clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  // 任务操作
  const getLatestVersion = useCallback((taskId: string): number => {
    const task = tasksRef.current.find(t => t.id === taskId);
    return task?.version ?? 1;
  }, []);

  const createTask = useCallback(async (input: {
    title: string; description: string; urgency: number;
    importance: number; quadrant: number;
  }): Promise<Task> => {
    if (!teamId) throw new Error('无团队');
    // 先乐观更新本地（版本为 0 表示待确认）
    const tempId = `temp-${Date.now()}`;
    const optimistic: Task = {
      id: tempId, ...input, completed: false,
      createdBy: userId, assignedTo: undefined,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      version: 0,
    };
    setTasks(prev => [optimistic, ...prev]);
    try {
      const res = await collabApi.createTask(teamId, { ...input, createdBy: userId });
      // 替换临时 task
      setTasks(prev => prev.map(t => t.id === tempId ? res.task : t));
      return res.task;
    } catch (e) {
      setTasks(prev => prev.filter(t => t.id !== tempId));
      throw e;
    }
  }, [teamId, userId]);

  const updateTask = useCallback(async (taskId: string, updates: Record<string, unknown>) => {
    if (!teamId) throw new Error('无团队');
    const version = getLatestVersion(taskId);
    // 乐观更新
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } as Task : t));
    try {
      const res = await collabApi.updateTask(teamId, taskId, { userId, version, ...updates });
      setTasks(prev => prev.map(t => t.id === taskId ? res.task : t));
      return res.task;
    } catch (e: any) {
      // 409 冲突时用服务端数据替换
      if (e.message?.task) {
        setTasks(prev => prev.map(t => t.id === taskId ? (e as any).message.task : t));
      }
      throw e;
    }
  }, [teamId, userId, getLatestVersion]);

  const deleteTask = useCallback(async (taskId: string) => {
    if (!teamId) throw new Error('无团队');
    setTasks(prev => prev.filter(t => t.id !== taskId));
    try {
      await collabApi.deleteTask(teamId, taskId, userId);
    } catch {
      // 恢复
      if (teamId) {
        collabApi.listTasks(teamId).then(res => setTasks(res.tasks));
      }
      throw new Error('删除失败，已刷新');
    }
  }, [teamId, userId]);

  const claimTask = useCallback(async (taskId: string) => {
    return updateTask(taskId, { assignedTo: userId });
  }, [updateTask, userId]);

  const completeTask = useCallback(async (taskId: string) => {
    return updateTask(taskId, { completed: true });
  }, [updateTask]);

  return { tasks, members, connected, createTask, updateTask, deleteTask, claimTask, completeTask };
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

```bash
cd E:\.PJs\Cia-list-map\Cia-list-map-main && npx tsc --noEmit src/hooks/useCollaboration.ts 2>&1
```

- [ ] **步骤 3：Commit**

```bash
git add Cia-list-map-main/src/hooks/useCollaboration.ts
git commit -m "feat(collab): add useCollaboration hook with WebSocket and optimistic updates"
```

---

### 任务 9：TeamSetup 组件（首次设置向导）

**文件：**
- 创建：`Cia-list-map-main/src/components/TeamSetup.tsx`

- [ ] **步骤 1：创建 TeamSetup 组件**

```typescript
import { useState } from 'react';
import type { UserProfile, Team, Member } from '../types';
import { collabApi } from '../api/collaboration';

interface Props {
  onComplete: (profile: UserProfile, team: Team, tasks: import('../types').Task[], members: Member[]) => void;
}

// 生成 UUID v4
function generateUserId(): string {
  return crypto.randomUUID?.() ?? 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

export default function TeamSetup({ onComplete }: Props) {
  const [step, setStep] = useState<'nickname' | 'choice' | 'create' | 'join'>('nickname');
  const [nickname, setNickname] = useState('');
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 步骤 1：设置昵称
  if (step === 'nickname') {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <h2 className="text-xl font-bold text-white">欢迎使用团队协作</h2>
        <p className="text-gray-400">先设置你的显示昵称</p>
        <input
          className="w-64 px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:border-cyan-500 outline-none"
          placeholder="你的昵称"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          maxLength={30}
          onKeyDown={e => e.key === 'Enter' && nickname.trim() && setStep('choice')}
        />
        <button
          className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50"
          disabled={!nickname.trim()}
          onClick={() => setStep('choice')}
        >
          继续
        </button>
      </div>
    );
  }

  // 步骤 2：选择创建或加入
  if (step === 'choice') {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <h2 className="text-xl font-bold text-white">你好，{nickname}</h2>
        <div className="flex gap-4 mt-4">
          <button onClick={() => setStep('create')}
            className="px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl">
            创建新团队
          </button>
          <button onClick={() => setStep('join')}
            className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-xl">
            加入团队
          </button>
        </div>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!teamName.trim()) return;
    setLoading(true); setError('');
    try {
      const userId = generateUserId();
      const res = await collabApi.createTeam(teamName.trim(), userId, nickname.trim());
      onComplete({ userId, nickname: nickname.trim() }, res.team, [], []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (inviteCode.trim().length !== 6) return;
    setLoading(true); setError('');
    try {
      const userId = generateUserId();
      const res = await collabApi.joinTeam(inviteCode.trim(), userId, nickname.trim());
      onComplete({ userId, nickname: nickname.trim() }, res.team, res.tasks, res.members);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 步骤 3a：创建团队
  if (step === 'create') {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <h2 className="text-xl font-bold text-white">创建新团队</h2>
        <input className="w-64 px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:border-cyan-500 outline-none"
          placeholder="团队名称" value={teamName} onChange={e => setTeamName(e.target.value)} maxLength={50} />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button onClick={() => setStep('choice')} className="px-4 py-2 bg-gray-700 text-white rounded-lg">返回</button>
          <button onClick={handleCreate} disabled={loading || !teamName.trim()}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
            {loading ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    );
  }

  // 步骤 3b：加入团队
  return (
    <div className="flex flex-col items-center gap-4 p-8">
      <h2 className="text-xl font-bold text-white">加入团队</h2>
      <input className="w-48 text-center px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:border-cyan-500 outline-none tracking-widest uppercase"
        placeholder="邀请码" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase().slice(0, 6))}
        maxLength={6} />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex gap-3">
        <button onClick={() => setStep('choice')} className="px-4 py-2 bg-gray-700 text-white rounded-lg">返回</button>
        <button onClick={handleJoin} disabled={loading || inviteCode.length !== 6}
          className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
          {loading ? '加入中...' : '加入'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：Commit**

```bash
git add Cia-list-map-main/src/components/TeamSetup.tsx
git commit -m "feat(collab): add TeamSetup wizard component"
```

---

### 任务 10：TeamPanel 组件

**文件：**
- 创建：`Cia-list-map-main/src/components/TeamPanel.tsx`

- [ ] **步骤 1：创建 TeamPanel 组件**

```typescript
import { useState } from 'react';
import type { Team, Member } from '../types';
import { collabApi } from '../api/collaboration';

interface Props {
  team: Team;
  members: Member[];
  userId: string;
  connected: boolean;
  onLeave: () => void;
  onDelete: () => void;
}

export default function TeamPanel({ team, members, userId, connected, onLeave, onDelete }: Props) {
  const [copied, setCopied] = useState(false);
  const isOwner = members.find(m => m.userId === userId)?.role === 'owner';

  const copyInviteCode = () => {
    navigator.clipboard.writeText(team.inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLeave = async () => {
    if (!confirm('确定要退出团队吗？')) return;
    try {
      await collabApi.leaveTeam(team.id, userId);
      onLeave();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm('确定要解散团队吗？此操作不可撤销！')) return;
    try {
      await collabApi.deleteTeam(team.id, userId);
      onDelete();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-800/50 rounded-xl border border-gray-700">
      {/* 团队名称 + 连接状态 */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
        <span className="text-white font-medium text-sm">{team.name}</span>
      </div>

      {/* 邀请码 */}
      <button onClick={copyInviteCode}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded font-mono">
        {copied ? '已复制!' : team.inviteCode}
      </button>

      {/* 在线成员 */}
      <div className="flex -space-x-2">
        {members.slice(0, 5).map(m => (
          <div key={m.userId} title={m.nickname}
            className="w-6 h-6 rounded-full bg-cyan-700 border border-gray-800 flex items-center justify-center text-[10px] text-white font-bold">
            {m.nickname.charAt(0).toUpperCase()}
          </div>
        ))}
        {members.length > 5 && (
          <div className="w-6 h-6 rounded-full bg-gray-600 border border-gray-800 flex items-center justify-center text-[10px] text-white">
            +{members.length - 5}
          </div>
        )}
      </div>

      {/* 操作 */}
      <div className="ml-auto flex gap-2">
        {!isOwner && (
          <button onClick={handleLeave} className="px-2 py-1 text-xs text-gray-400 hover:text-red-400">
            退出
          </button>
        )}
        {isOwner && (
          <button onClick={handleDelete} className="px-2 py-1 text-xs text-gray-400 hover:text-red-400">
            解散
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：Commit**

```bash
git add Cia-list-map-main/src/components/TeamPanel.tsx
git commit -m "feat(collab): add TeamPanel component"
```

---

### 任务 11：修改 TaskCard —— 显示协作者 + 认领按钮

**文件：**
- 修改：`Cia-list-map-main/src/components/TaskCard.tsx`

- [ ] **步骤 1：先读取当前 TaskCard.tsx 的完整内容**

```bash
cd E:\.PJs\Cia-list-map && cat Cia-list-map-main/src/components/TaskCard.tsx
```

- [ ] **步骤 2：在 TaskCard 中添加协作者显示和认领按钮**

在 `TaskCard` 组件的 props 中新增：

```typescript
interface TaskCardProps {
  // ...现有 props...
  /** 协作模式下的成员列表（用于显示昵称），为 null 时隐藏协作 UI */
  members?: Member[];
  currentUserId?: string;
  onClaim?: (taskId: string) => void;
}
```

在任务卡片内容区（标题下方或卡片底部）添加：

```tsx
{/* 协作者信息 */}
{members && (
  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
    <span>创建者: {members.find(m => m.userId === task.createdBy)?.nickname || '未知'}</span>
    {task.assignedTo && (
      <span>· 认领者: {members.find(m => m.userId === task.assignedTo)?.nickname || '未知'}</span>
    )}
  </div>
)}

{/* 认领按钮 */}
{members && !task.assignedTo && task.createdBy !== currentUserId && onClaim && (
  <button
    onClick={() => onClaim(task.id)}
    className="mt-2 px-3 py-1 text-xs bg-cyan-700 hover:bg-cyan-600 text-white rounded"
  >
    认领任务
  </button>
)}
```

- [ ] **步骤 3：验证 TypeScript 编译**

```bash
cd E:\.PJs\Cia-list-map\Cia-list-map-main && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **步骤 4：Commit**

```bash
git add Cia-list-map-main/src/components/TaskCard.tsx
git commit -m "feat(collab): add collaborator info and claim button to TaskCard"
```

---

### 任务 12：修改 TaskInputForm —— 协作模式走 API

**文件：**
- 修改：`Cia-list-map-main/src/components/TaskInputForm.tsx`

- [ ] **步骤 1：先读取当前 TaskInputForm.tsx**

```bash
cd E:\.PJs\Cia-list-map && cat Cia-list-map-main/src/components/TaskInputForm.tsx
```

- [ ] **步骤 2：添加协作模式支持**

在 `TaskInputForm` 的 props 中新增可选的回调：

```typescript
interface TaskInputFormProps {
  // ...现有 props...
  /** 协作模式：通过此回调创建任务，而非直接更新本地 state */
  onCollabCreate?: (input: { title: string; description: string; urgency: number; importance: number; quadrant: number }) => Promise<void>;
}
```

在提交处理函数中，检查 `onCollabCreate` 是否存在：

```typescript
// 在 handleSubmit 或等效函数中
if (onCollabCreate) {
  setIsSubmitting(true);
  try {
    await onCollabCreate({
      title: taskInput.title,
      description: taskInput.description,
      urgency: analysis.urgency,
      importance: analysis.importance,
      quadrant: analysis.quadrant,
    });
    // 清空输入
    setTaskInput({ title: '', description: '' });
    setResult(null);
  } catch (e: any) {
    setError(e.message || '创建失败');
  } finally {
    setIsSubmitting(false);
  }
  return;
}
// 原有本地逻辑 ...
```

**注意：** 实际修改需根据 `TaskInputForm` 的真实代码结构调整。原则上是在提交任务的分析结果后，如果处于协作模式则走 `onCollabCreate`，否则走现有的 setState 路径。

- [ ] **步骤 3：验证编译**

```bash
cd E:\.PJs\Cia-list-map\Cia-list-map-main && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **步骤 4：Commit**

```bash
git add Cia-list-map-main/src/components/TaskInputForm.tsx
git commit -m "feat(collab): add collaboration mode support to TaskInputForm"
```

---

### 任务 13：修改 App.tsx —— 集成协作模式

**文件：**
- 修改：`Cia-list-map-main/src/App.tsx`

- [ ] **步骤 1：先读取当前 App.tsx 完整内容**

```bash
cd E:\.PJs\Cia-list-map && cat Cia-list-map-main/src/App.tsx
```

- [ ] **步骤 2：在 App.tsx 中集成协作状态**

核心改动：

1. **新增 imports：**

```typescript
import { useCollaboration } from './hooks/useCollaboration';
import TeamSetup from './components/TeamSetup';
import TeamPanel from './components/TeamPanel';
import type { Team, Member, UserProfile, Task } from './types';
```

2. **新增状态：**

```typescript
// 用户身份（从 localStorage 恢复）
const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
  const stored = localStorage.getItem('cia_user_profile');
  return stored ? JSON.parse(stored) : null;
});
const [team, setTeam] = useState<Team | null>(null);
```

3. **调用 useCollaboration：**

```typescript
const collab = useCollaboration(
  team?.id ?? null,
  team?.inviteCode ?? null,
  userProfile?.userId ?? '',
);
```

4. **条件渲染：**

```tsx
// 如果未设置用户身份，显示 TeamSetup
if (!userProfile || !team) {
  return (
    <TeamSetup
      onComplete={(profile, newTeam, initTasks, initMembers) => {
        setUserProfile(profile);
        setTeam(newTeam);
        localStorage.setItem('cia_user_profile', JSON.stringify(profile));
      }}
    />
  );
}

// 正常渲染，顶部加 TeamPanel，数据源用 collab.tasks
return (
  <div className="...">
    <TeamPanel
      team={team}
      members={collab.members}
      userId={userProfile.userId}
      connected={collab.connected}
      onLeave={() => { setTeam(null); localStorage.removeItem('cia_user_profile'); }}
      onDelete={() => { setTeam(null); localStorage.removeItem('cia_user_profile'); }}
    />
    {/* 现有组件，tasks 传 collab.tasks */}
    <QuadrantChart tasks={collab.tasks} ... />
    <TaskList tasks={collab.tasks} ... />
    <TaskInputForm
      onCollabCreate={async (input) => { await collab.createTask(input); }}
    />
    <TaskCard
      members={collab.members}
      currentUserId={userProfile.userId}
      onClaim={collab.claimTask}
    />
    {/* ... */}
  </div>
);
```

**注意：** 此步骤的精确实现在阅读 `App.tsx` 后可能需要调整。核心原则：`TeamSetup` 未完成 → 显示向导；已完成 → 显示协作界面，`tasks` 来源从 localStorage 切换到 `collab.tasks`。

- [ ] **步骤 3：验证编译**

```bash
cd E:\.PJs\Cia-list-map\Cia-list-map-main && npx tsc --noEmit 2>&1
```

修复所有类型错误。

- [ ] **步骤 4：端到端验证**

启动后端和前端：

```bash
# 终端 1：启动后端
cd E:\.PJs\Cia-list-map\task_scorer && python -m uvicorn server.app:app --port 8001

# 终端 2：启动前端
cd E:\.PJs\Cia-list-map\Cia-list-map-main && npm run dev
```

在两个浏览器窗口打开前端：
1. 窗口 A 创建团队 → 复制邀请码
2. 窗口 B 用邀请码加入
3. A 创建任务 → B 应实时看到
4. B 认领任务 → A 应看到认领者

- [ ] **步骤 5：Commit**

```bash
git add Cia-list-map-main/src/App.tsx
git commit -m "feat(collab): integrate collaboration mode in App"
```

---

### 任务 14：QuadrantChart 兼容性检查

**文件：**
- 修改：`Cia-list-map-main/src/components/QuadrantChart.tsx`（如需要）

- [ ] **步骤 1：检查 QuadrantChart 是否兼容新的 Task 类型**

QuadrantChart 读取 `tasks` 数组并渲染四象限图表。新增的 `createdBy`、`assignedTo`、`version`、`updatedAt` 字段对图表渲染无影响（它只关心 `urgency`、`importance`、`quadrant`、`completed`、`title`）。如果编译通过，此步骤无需修改代码。

- [ ] **步骤 2：如果 QuadrantChart 内部有类型断言或显式的 Task 字段列表，则更新**

检查 `QuadrantChart.tsx` 中是否对 Task 做了结构性的类型约束。如有，确保兼容。

- [ ] **步骤 3：Commit（如果有改动）**

```bash
git add Cia-list-map-main/src/components/QuadrantChart.tsx
git commit -m "fix(collab): ensure QuadrantChart compatibility with extended Task type"
```

---

## ⚠️ 关键注意事项：snake_case → camelCase 转换

**问题：** database.py 返回的 dict 使用 SQL 列名（snake_case：`invite_code`, `created_by`, `assigned_to` 等），但前端 TypeScript 类型使用 camelCase（`inviteCode`, `createdBy`, `assignedTo`）。

**解决：** 在 API 路由返回数据前做 key 转换。在 `task_scorer/server/collaboration.py`（或单独的工具模块）中添加：

```python
import re

def to_camel(snake: str) -> str:
    """invite_code -> inviteCode"""
    return re.sub(r'_([a-z])', lambda m: m.group(1).upper(), snake)

def to_camel_dict(d: dict) -> dict:
    """将 dict 的所有 key 从 snake_case 转为 camelCase。"""
    return {to_camel(k): v for k, v in d.items()}

def to_camel_list(items: list[dict]) -> list[dict]:
    return [to_camel_dict(item) for item in items]
```

在 API 路由中：
- 返回单个对象：`return {"team": to_camel_dict(team)}`
- 返回列表：`return {"tasks": to_camel_list(tasks), "members": to_camel_list(members)}`
- WebSocket 广播事件中的 payload 同样需要转换

WebSocket `collaboration.py` 的 `broadcast` 方法中也需要对 payload 做转换。建议在所有 API 返回点和 `broadcast` 调用处统一使用 `to_camel_dict` / `to_camel_list`。

---

## 补充：后端依赖

协作功能使用的 `sqlite3`、`uuid`、`secrets` 均为 Python 标准库，`fastapi` 和 `uvicorn` 已在 `task_scorer/requirements.txt` 中，无需新增依赖。

`websockets` 库对于 FastAPI WebSocket 可选，但 FastAPI 内置的 WebSocket 支持（基于 Starlette）已足够，无需额外安装。

---

## 潜在风险点

| 风险 | 缓解 |
|------|------|
| SQLite 并发写入瓶颈 | WAL 模式 + 小团队场景（<20人），足够 |
| WebSocket 重连风暴 | 指数退避 1s→30s 上限 |
| 乐观锁冲突频繁 | 冲突时自动拉最新数据，用户重试 |
| `App.tsx` 改动量大 | 该任务编码工作量最大，需仔细阅读现有代码后调整 |
