"""WebSocket 连接管理器 —— 房间广播、事件推送。"""
from fastapi import WebSocket
from typing import Dict, Set
import json
import re
from datetime import datetime, timezone


def to_camel(snake: str) -> str:
    """invite_code -> inviteCode"""
    return re.sub(r'_([a-z])', lambda m: m.group(1).upper(), snake)


def to_camel_dict(d: dict) -> dict:
    """将 dict 的所有 key 从 snake_case 转为 camelCase。"""
    return {to_camel(k): v for k, v in d.items()}


def to_camel_list(items: list[dict]) -> list[dict]:
    return [to_camel_dict(item) for item in items]


class CollaborationManager:
    """管理 WebSocket 连接，按 team_id 分组广播。"""

    def __init__(self):
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
        """向房间所有连接广播事件（payload 自动转 camelCase）。"""
        if team_id not in self._rooms:
            return

        # 递归转 camelCase
        def convert(obj):
            if isinstance(obj, dict):
                return to_camel_dict({k: convert(v) for k, v in obj.items()})
            elif isinstance(obj, list):
                return [convert(item) for item in obj]
            return obj

        message = json.dumps({
            "type": event_type,
            "payload": convert(payload),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        }, ensure_ascii=False)

        dead: set[WebSocket] = set()
        for ws in self._rooms[team_id]:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._rooms[team_id].discard(ws)

    def room_size(self, team_id: str) -> int:
        """获取房间在线人数。"""
        return len(self._rooms.get(team_id, set()))


# 全局单例
manager = CollaborationManager()
