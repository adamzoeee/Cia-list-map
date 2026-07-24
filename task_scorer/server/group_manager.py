"""
协作组管理器
- 组创建/鉴权/持久化
- 任务 CRUD
- 成员管理 + 广播
"""
import hashlib
import json
import logging
import os
import re
import time
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set
from fastapi import WebSocket

DATA_DIR = Path(__file__).resolve().parent / "data" / "groups"

@dataclass
class Group:
    group_id: str
    password_hash: str
    tasks: List[Dict] = field(default_factory=list)
    all_members: Set[str] = field(default_factory=set)       # 历史成员昵称
    connections: Dict[str, WebSocket] = field(default_factory=dict)     # nickname -> WebSocket
    created_at: str = ""

    def is_member_online(self, nickname: str) -> bool:
        return nickname in self.connections

    def add_member(self, nickname: str, ws: WebSocket):
        self.all_members.add(nickname)
        self.connections[nickname] = ws

    def remove_member(self, nickname: str):
        self.connections.pop(nickname, None)

    def get_members(self) -> List[Dict]:
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
                updates.pop("id", None)
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
                t["completed"] = not t.get("completed", False)
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
    _ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")

    def __init__(self):
        self._groups: Dict[str, Group] = {}
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    def _path(self, group_id: str) -> Path:
        if not self._ID_RE.match(group_id):
            raise ValueError(f"无效的 group_id: {group_id!r}")
        return DATA_DIR / f"{group_id}.json"

    def _load(self, group_id: str) -> Optional[Group]:
        p = self._path(group_id)
        if not p.exists():
            return None
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            return Group.from_dict(d)
        except (json.JSONDecodeError, KeyError):
            logging.warning("组 %s JSON 损坏", group_id)
            return None

    def _save(self, group: Group):
        p = self._path(group.group_id)
        tmp = p.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps(group.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp.replace(p)

    @staticmethod
    def _hash_password(password: str) -> str:
        """生成加盐密码哈希，格式 salt:hash"""
        salt = os.urandom(16).hex()
        h = hashlib.sha256(salt.encode() + password.encode()).hexdigest()
        return f"{salt}:{h}"

    @staticmethod
    def _verify_password(stored: str, password: str) -> bool:
        """验证密码，兼容旧格式（无盐纯 SHA-256）"""
        if ":" not in stored:
            # 旧格式：纯 SHA-256
            return stored == hashlib.sha256(password.encode()).hexdigest()
        salt, h = stored.split(":", 1)
        return h == hashlib.sha256(salt.encode() + password.encode()).hexdigest()

    def get_or_create(self, group_id: str, password: str) -> Group:
        """获取已有组或创建新组"""

        def _verify(group: Group) -> None:
            if not self._verify_password(group.password_hash, password):
                raise ValueError("密码错误")

        # 先查内存
        group = self._groups.get(group_id)
        if group:
            _verify(group)
            return group

        # 查磁盘
        group = self._load(group_id)
        if group:
            _verify(group)
            self._groups[group_id] = group
            return group

        # 创建新组
        group = Group(
            group_id=group_id,
            password_hash=self._hash_password(password),
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
