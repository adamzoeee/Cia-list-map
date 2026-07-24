"""
协作组管理器
- 组创建/鉴权/持久化
- 任务 CRUD
- 成员管理 + 广播
"""
import hashlib
import json
import time
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from fastapi import WebSocket

DATA_DIR = Path(__file__).resolve().parent / "data" / "groups"

@dataclass
class Group:
    group_id: str
    password_hash: str
    tasks: list = field(default_factory=list)
    all_members: set = field(default_factory=set)       # 历史成员昵称
    connections: dict = field(default_factory=dict)     # nickname -> WebSocket
    created_at: str = ""

    def is_member_online(self, nickname: str) -> bool:
        return nickname in self.connections

    def add_member(self, nickname: str, ws: WebSocket):
        self.all_members.add(nickname)
        self.connections[nickname] = ws

    def remove_member(self, nickname: str):
        self.connections.pop(nickname, None)

    def get_members(self) -> list:
        """返回 [{nickname, online}]"""
        return [
            {"nickname": n, "online": n in self.connections}
            for n in sorted(self.all_members)
        ]

    def add_task(self, task: dict) -> dict:
        self.tasks.insert(0, task)
        return task

    def update_task(self, task_id: str, updates: dict) -> Optional[dict]:
        for t in self.tasks:
            if t["id"] == task_id:
                t.update(updates)
                return t
        return None

    def delete_task(self, task_id: str) -> bool:
        before = len(self.tasks)
        self.tasks = [t for t in self.tasks if t["id"] != task_id]
        return len(self.tasks) < before

    def toggle_task(self, task_id: str) -> Optional[bool]:
        for t in self.tasks:
            if t["id"] == task_id:
                t["completed"] = not t["completed"]
                return t["completed"]
        return None

    async def broadcast(self, message: dict, exclude: Optional[str] = None):
        """向组内所有在线成员广播消息"""
        dead = []
        for nickname, ws in list(self.connections.items()):
            if nickname == exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(nickname)
        for n in dead:
            self.connections.pop(n, None)

    def to_dict(self) -> dict:
        return {
            "group_id": self.group_id,
            "password_hash": self.password_hash,
            "tasks": self.tasks,
            "members": sorted(self.all_members),
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Group":
        return cls(
            group_id=d["group_id"],
            password_hash=d["password_hash"],
            tasks=d.get("tasks", []),
            all_members=set(d.get("members", [])),
            created_at=d.get("created_at", ""),
        )


class GroupManager:
    def __init__(self):
        self._groups: Dict[str, Group] = {}
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    def _path(self, group_id: str) -> Path:
        return DATA_DIR / f"{group_id}.json"

    def _load(self, group_id: str) -> Optional[Group]:
        p = self._path(group_id)
        if not p.exists():
            return None
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            return Group.from_dict(d)
        except (json.JSONDecodeError, KeyError):
            return None

    def _save(self, group: Group):
        p = self._path(group.group_id)
        p.write_text(
            json.dumps(group.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def get_or_create(self, group_id: str, password: str) -> Group:
        """获取已有组或创建新组"""
        password_hash = hashlib.sha256(password.encode()).hexdigest()

        # 先查内存
        group = self._groups.get(group_id)
        if group:
            # 验证密码
            if group.password_hash != password_hash:
                raise ValueError("密码错误")
            return group

        # 查磁盘
        group = self._load(group_id)
        if group:
            if group.password_hash != password_hash:
                raise ValueError("密码错误")
            self._groups[group_id] = group
            return group

        # 创建新组
        group = Group(
            group_id=group_id,
            password_hash=password_hash,
            created_at=time.strftime("%Y-%m-%dT%H:%M:%S"),
        )
        self._groups[group_id] = group
        self._save(group)
        return group

    def get(self, group_id: str) -> Optional[Group]:
        if group_id in self._groups:
            return self._groups[group_id]
        group = self._load(group_id)
        if group:
            self._groups[group_id] = group
        return group

    def save_group(self, group: Group):
        self._save(group)
