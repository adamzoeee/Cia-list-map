# 云端协作 + 全栈重构 实现计划

> **面向 AI 代理的工作者：** 使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将前端重构为纯 UI 层（所有操作走 WebSocket），后端集成自研 MacBERT 模型推理 + WebSocket 协作组管理。

**架构：** 前端通过单条 WebSocket 连接后端 FastAPI，后端负责模型推理（TaskScorer）和协作组管理（GroupManager + JSON 文件持久化）。前端删除 deepseek.ts 和 ApiKeyInput 组件。

**技术栈：** React 19 + TypeScript + Vite（前端），Python FastAPI + WebSocket + MacBERT（后端）

---

## 文件结构

```
新增:
  task_scorer/server/group_manager.py    # 协作组管理器
  src/api/websocket.ts                   # WebSocket 客户端封装
  src/components/CollaborationPanel.tsx  # 协作组面板

修改:
  task_scorer/server/app.py              # 提取推理函数 + 新增 /ws WebSocket 端点
  src/types.ts                           # 新增 WS 消息类型 + 协作类型
  src/components/TaskInputForm.tsx       # 通过 WebSocket 调推理
  src/App.tsx                            # 集成 WebSocket + 协作状态 + 删除 API Key 逻辑
  src/components/ImageTaskPreview.tsx    # 标题文字微调（"AI" → "模型"等）

删除:
  src/api/deepseek.ts                    # 不再需要
  src/components/ApiKeyInput.tsx         # 不再需要
```

---

### 任务 1：创建后端 GroupManager

**文件：**
- 创建：`task_scorer/server/group_manager.py`

- [ ] **步骤 1：编写 GroupManager 模块**

```python
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
```

- [ ] **步骤 2：验证 GroupManager 可导入**

运行：`cd task_scorer && python -c "from server.group_manager import GroupManager; gm = GroupManager(); print('OK')"`
预期：输出 `OK`

- [ ] **步骤 3：Commit**

```bash
git add task_scorer/server/group_manager.py
git commit -m "feat: 添加协作组管理器 GroupManager"
```

---

### 任务 2：重构 app.py — 提取推理函数

**文件：**
- 修改：`task_scorer/server/app.py`

把 `predict_single` 逻辑从 `/predict` 端点中提取为可复用函数，供 WebSocket 端点调用。

- [ ] **步骤 1：提取 `do_predict` 函数**

在 `app.py` 中，在 `get_suggestion` 函数之后、`load_model` 之前，添加：

```python
def do_predict(title: str, description: str = "") -> dict:
    """执行单任务推理，返回 {title,description,urgency,importance,suggestion}"""
    if model is None or tokenizer is None:
        raise RuntimeError("模型未加载")

    text = title.strip()
    if description.strip():
        text = f"{text}。{description.strip()}"

    encoding = tokenizer(
        text,
        max_length=MAX_LENGTH,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )
    input_ids = encoding["input_ids"].to(DEVICE)
    attention_mask = encoding["attention_mask"].to(DEVICE)
    token_type_ids = encoding.get("token_type_ids", torch.zeros_like(input_ids)).to(DEVICE)

    with torch.no_grad():
        outputs = model.predict(input_ids, attention_mask, token_type_ids)

    urgency = float(outputs["urgency"][0])
    importance = float(outputs["importance"][0])
    urgency_int = int(np.clip(round(urgency), -5, 5))
    importance_int = int(np.clip(round(importance), -5, 5))

    quadrant = (
        1 if urgency_int >= 0 and importance_int >= 0 else
        2 if urgency_int < 0 and importance_int >= 0 else
        3 if urgency_int < 0 and importance_int < 0 else
        4
    )

    return {
        "title": title,
        "description": description,
        "urgency": urgency_int,
        "importance": importance_int,
        "suggestion": get_suggestion(quadrant),
    }


def do_predict_batch(tasks: list) -> list:
    """批量推理，每项 {title,description} → [{title,description,urgency,importance}]"""
    if model is None or tokenizer is None:
        raise RuntimeError("模型未加载")

    texts = []
    for t in tasks:
        text = t["title"].strip()
        if t.get("description", "").strip():
            text = f"{text}。{t['description'].strip()}"
        texts.append(text)

    encoding = tokenizer(
        texts,
        max_length=MAX_LENGTH,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )
    input_ids = encoding["input_ids"].to(DEVICE)
    attention_mask = encoding["attention_mask"].to(DEVICE)
    token_type_ids = encoding.get("token_type_ids", torch.zeros_like(input_ids)).to(DEVICE)

    with torch.no_grad():
        outputs = model.predict(input_ids, attention_mask, token_type_ids)

    results = []
    for i, t in enumerate(tasks):
        urgency = float(outputs["urgency"][i])
        importance = float(outputs["importance"][i])
        results.append({
            "title": t["title"],
            "description": t.get("description", ""),
            "urgency": int(np.clip(round(urgency), -5, 5)),
            "importance": int(np.clip(round(importance), -5, 5)),
        })
    return results
```

- [ ] **步骤 2：简化 `/predict` 和 `/predict_batch` 端点复用 `do_predict` / `do_predict_batch`**

将现有 `predict_single` 函数体替换为对 `do_predict` 的调用，`predict_batch` 替换为对 `do_predict_batch` 的调用。

修改 `predict_single`（约第 140-189 行）：

```python
@app.post("/predict", response_model=PredictionOutput)
async def predict_single(task: TaskInput):
    """单任务分析"""
    try:
        result = do_predict(task.title, task.description)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return PredictionOutput(**result)
```

修改 `predict_batch`（约第 192-239 行）：

```python
@app.post("/predict_batch", response_model=BatchOutput)
async def predict_batch(batch: BatchInput):
    """批量任务分析"""
    try:
        tasks_in = [{"title": t.title, "description": t.description} for t in batch.tasks]
        results = do_predict_batch(tasks_in)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return BatchOutput(tasks=results)
```

- [ ] **步骤 3：验证现有端点仍正常工作**

运行：`cd task_scorer && python -c "from server.app import do_predict, do_predict_batch; print('import OK')"`
预期：输出 `import OK`（注意：这会触发模型加载，确保 checkpoints 存在）

- [ ] **步骤 4：Commit**

```bash
git add task_scorer/server/app.py
git commit -m "refactor: 提取 do_predict/do_predict_batch 复用函数"
```

---

### 任务 3：添加 WebSocket 端点

**文件：**
- 修改：`task_scorer/server/app.py`

- [ ] **步骤 1：在 app.py 顶部添加 WebSocket 相关导入**

在现有 import 之后添加：

```python
import time as time_module
from fastapi import WebSocket, WebSocketDisconnect
from server.group_manager import GroupManager
```

- [ ] **步骤 2：在模型加载后初始化 GroupManager**

在 `startup_event` 末尾（`load_model()` 之后）添加：

```python
# 全局 GroupManager 实例
group_manager: Optional[GroupManager] = None

@app.on_event("startup")
async def startup_event():
    global group_manager
    load_model()
    group_manager = GroupManager()
```

- [ ] **步骤 3：添加 `/ws` WebSocket 端点**

在 `root()` 函数之后添加：

```python
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    authenticated = False
    current_group: Optional[Group] = None
    current_nickname: Optional[str] = None

    try:
        while True:
            data = await ws.receive_json()

            msg_type = data.get("type", "")

            # ---- 单机模式：analyze_text / analyze_batch（无需认证）----
            if msg_type == "analyze_text":
                try:
                    result = do_predict(
                        data.get("title", ""),
                        data.get("description", ""),
                    )
                    await ws.send_json({"type": "analyze_result", "task": result})
                except RuntimeError as e:
                    await ws.send_json({"type": "error", "message": str(e)})
                continue

            if msg_type == "analyze_batch":
                try:
                    tasks_in = data.get("texts", [])
                    results = do_predict_batch(tasks_in)
                    await ws.send_json({"type": "analyze_batch_result", "tasks": results})
                except RuntimeError as e:
                    await ws.send_json({"type": "error", "message": str(e)})
                continue

            # ---- 认证 ----
            if msg_type == "auth":
                group_id = str(data.get("group_id", "")).strip()
                password = str(data.get("password", "")).strip()
                nickname = str(data.get("nickname", "")).strip()

                if not group_id or not password or not nickname:
                    await ws.send_json({"type": "auth_fail", "reason": "组ID、密码、昵称不能为空"})
                    continue

                try:
                    group = group_manager.get_or_create(group_id, password)
                except ValueError:
                    await ws.send_json({"type": "auth_fail", "reason": "密码错误"})
                    continue

                # 检查昵称是否已被在线成员使用
                if group.is_member_online(nickname):
                    await ws.send_json({"type": "auth_fail", "reason": "昵称已被使用，请换一个"})
                    continue

                group.add_member(nickname, ws)
                authenticated = True
                current_group = group
                current_nickname = nickname

                # 发送当前状态
                await ws.send_json({
                    "type": "auth_ok",
                    "group_id": group.group_id,
                    "tasks": group.tasks,
                    "members": group.get_members(),
                })

                # 广播新成员加入
                await group.broadcast({
                    "type": "member_join",
                    "nickname": nickname,
                }, exclude=nickname)
                continue

            # ---- 以下操作需要已认证 ----
            if not authenticated:
                await ws.send_json({"type": "error", "message": "请先加入协作组"})
                continue

            group = current_group
            nickname = current_nickname

            if msg_type == "task_add":
                title = data.get("title", "").strip()
                description = data.get("description", "").strip()
                if not title:
                    await ws.send_json({"type": "error", "message": "任务标题不能为空"})
                    continue
                # 模型评分
                try:
                    scored = do_predict(title, description)
                except RuntimeError as e:
                    await ws.send_json({"type": "error", "message": str(e)})
                    continue
                task = {
                    "id": f"task_{int(time_module.time() * 1000)}_{len(group.tasks)}",
                    "title": scored["title"],
                    "description": scored["description"],
                    "urgency": scored["urgency"],
                    "importance": scored["importance"],
                    "quadrant": (
                        1 if scored["urgency"] >= 0 and scored["importance"] >= 0 else
                        2 if scored["urgency"] < 0 and scored["importance"] >= 0 else
                        3 if scored["urgency"] < 0 and scored["importance"] < 0 else 4
                    ),
                    "completed": False,
                    "createdBy": nickname,
                    "createdAt": time_module.strftime("%Y-%m-%dT%H:%M:%S"),
                }
                group.add_task(task)
                group_manager.save_group(group)
                await group.broadcast({"type": "task_added", "task": task})
                continue

            if msg_type == "task_update":
                task_id = data.get("task_id", "")
                updates = {}
                if "urgency" in data:
                    u = int(np.clip(round(data["urgency"]), -5, 5))
                    updates["urgency"] = u
                if "importance" in data:
                    i = int(np.clip(round(data["importance"]), -5, 5))
                    updates["importance"] = i
                if updates:
                    if "urgency" in updates and "importance" not in updates:
                        # 需要当前 importance 来计算 quadrant
                        for t in group.tasks:
                            if t["id"] == task_id:
                                updates["importance"] = t["importance"]
                                break
                    if "importance" in updates and "urgency" not in updates:
                        for t in group.tasks:
                            if t["id"] == task_id:
                                updates["urgency"] = t["urgency"]
                                break
                    u = updates.get("urgency", 0)
                    i = updates.get("importance", 0)
                    updates["quadrant"] = (
                        1 if u >= 0 and i >= 0 else
                        2 if u < 0 and i >= 0 else
                        3 if u < 0 and i < 0 else 4
                    )
                updated = group.update_task(task_id, updates)
                if updated:
                    group_manager.save_group(group)
                    await group.broadcast({"type": "task_updated", "task": updated})
                continue

            if msg_type == "task_delete":
                task_id = data.get("task_id", "")
                if group.delete_task(task_id):
                    group_manager.save_group(group)
                    await group.broadcast({"type": "task_deleted", "task_id": task_id})
                continue

            if msg_type == "task_toggle":
                task_id = data.get("task_id", "")
                completed = group.toggle_task(task_id)
                if completed is not None:
                    group_manager.save_group(group)
                    await group.broadcast({"type": "task_toggled", "task_id": task_id, "completed": completed})
                continue

            # 未知消息类型
            await ws.send_json({"type": "error", "message": f"未知消息类型: {msg_type}"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        # 清理：标记离线
        if authenticated and current_group and current_nickname:
            current_group.remove_member(current_nickname)
            try:
                await current_group.broadcast({
                    "type": "member_leave",
                    "nickname": current_nickname,
                })
            except Exception:
                pass
```

- [ ] **步骤 4：验证 WebSocket 端点语法正确**

运行：`cd task_scorer && python -c "from server.app import app; print('app loaded OK')"`
预期：输出 `app loaded OK`

- [ ] **步骤 5：Commit**

```bash
git add task_scorer/server/app.py
git commit -m "feat: 添加 /ws WebSocket 协作端点"
```

---

### 任务 4：扩展前端类型定义

**文件：**
- 修改：`src/types.ts`

- [ ] **步骤 1：添加 WebSocket 消息和协作类型**

在文件末尾追加：

```typescript
// ========== WebSocket 消息类型 ==========

export type WsMessageType =
  // 单机模式
  | 'analyze_text' | 'analyze_result'
  | 'analyze_batch' | 'analyze_batch_result'
  // 认证
  | 'auth' | 'auth_ok' | 'auth_fail'
  // 协作任务
  | 'task_add' | 'task_added'
  | 'task_update' | 'task_updated'
  | 'task_delete' | 'task_deleted'
  | 'task_toggle' | 'task_toggled'
  // 成员事件
  | 'member_join' | 'member_leave' | 'members_list'
  // 通用
  | 'error';

export interface WsMessage {
  type: WsMessageType;
  [key: string]: unknown;
}

export interface Collaborator {
  nickname: string;
  online: boolean;
}

export interface CollabState {
  isJoined: boolean;
  groupId: string;
  nickname: string;
  members: Collaborator[];
}
```

- [ ] **步骤 2：验证类型编译**

运行：`npx tsc --noEmit`
预期：无新增错误（仅预先存在的错误）

- [ ] **步骤 3：Commit**

```bash
git add src/types.ts
git commit -m "feat: 添加 WebSocket 消息和协作类型定义"
```

---

### 任务 5：创建 WebSocket 客户端

**文件：**
- 创建：`src/api/websocket.ts`

- [ ] **步骤 1：编写 WebSocket 客户端**

```typescript
import type { WsMessage } from '../types';

type MessageHandler = (msg: WsMessage) => void;

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const WS_URL = `ws://${window.location.hostname}:8001/ws`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private state: ConnectionState = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stateListeners = new Set<(s: ConnectionState) => void>();

  /** 建立连接 */
  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.setState('connecting');

    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setState('connected');
      this.reconnectAttempt = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        this.dispatch(msg);
      } catch {
        // 忽略解析失败的消息
      }
    };

    this.ws.onclose = () => {
      this.setState('disconnected');
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose 会紧随其后触发
    };
  }

  /** 断开连接 */
  disconnect() {
    this.cancelReconnect();
    if (this.ws) {
      this.ws.onclose = null; // 阻止重连
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  /** 发送消息 */
  send(msg: WsMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] 未连接，无法发送消息:', msg.type);
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  /** 注册消息处理器 */
  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /** 注册连接状态监听 */
  onStateChange(listener: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    // 立即通知当前状态
    listener(this.state);
    return () => { this.stateListeners.delete(listener); };
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(s: ConnectionState) {
    if (this.state === s) return;
    this.state = s;
    this.stateListeners.forEach(fn => fn(s));
  }

  private dispatch(msg: WsMessage) {
    const hs = this.handlers.get(msg.type);
    if (hs) {
      hs.forEach(fn => fn(msg));
    }
    // 也触发 '*' 通配符处理器
    const wild = this.handlers.get('*');
    if (wild) {
      wild.forEach(fn => fn(msg));
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** 全局单例 */
export const wsClient = new WsClient();
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无新增错误

- [ ] **步骤 3：Commit**

```bash
git add src/api/websocket.ts
git commit -m "feat: 创建 WebSocket 客户端封装"
```

---

### 任务 6：修改 TaskInputForm 走 WebSocket

**文件：**
- 修改：`src/components/TaskInputForm.tsx`

- [ ] **步骤 1：修改 Props 接口，移除 onSubmit/onImageSubmit，改用 wsClient**

将 `Props` 接口改为接收 `onImageDraftsReady` 回调（图片 OCR→批量评分完成后回调），文字提交直接走 wsClient：

```typescript
// 改动：Props 新增 onImageDraftsReady
interface Props {
  onImageDraftsReady: (drafts: ImageTaskDraft[]) => void;
  loading: boolean;
  loadingMessage?: string;
}
```

替换现有的 `Props` 定义（第 5-10 行）。

- [ ] **步骤 2：修改文字提交逻辑**

修改 `handleSubmitText`（第 97-104 行），改为通过 WebSocket 发送：

```typescript
const handleSubmitText = (e: React.FormEvent) => {
  e.preventDefault();
  const t = title.trim();
  if (!t) return;
  // 通过 WebSocket 发送分析请求
  wsClient.send({
    type: 'analyze_text',
    title: t,
    description: description.trim(),
  } as WsMessage);
  setTitle('');
  setDescription('');
};
```

同时修改文件顶部 import，添加：

```typescript
import { wsClient } from '../api/websocket';
import type { WsMessage } from '../types';
```

- [ ] **步骤 3：修改图片提交逻辑**

修改 `handleSubmitImage`（第 106-109 行），改为 OCR → WebSocket 批量分析 → 回调：

```typescript
const handleSubmitImage = async () => {
  if (!compressedBase64) return;
  // 本地 OCR
  const ocrText = await recognizeTextFromImage(compressedBase64);
  const lines = ocrText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !/^[\s\p{P}]+$/u.test(l));
  if (lines.length === 0) {
    alert('OCR 未识别出有效任务文字');
    return;
  }
  // 通过 WebSocket 批量评分
  wsClient.send({
    type: 'analyze_batch',
    texts: lines.map(title => ({ title, description: '' })),
  } as WsMessage);
  handleClearImage();
};
```

需要添加 `recognizeTextFromImage` 的 import：

```typescript
import { recognizeTextFromImage } from '../api/ocr';
```

- [ ] **步骤 4：验证编译**

运行：`npx tsc --noEmit`
预期：TaskInputForm 有 Props 不匹配的报错（App.tsx 仍传旧 props，任务 8 修复）

- [ ] **步骤 5：Commit**

```bash
git add src/components/TaskInputForm.tsx
git commit -m "refactor: TaskInputForm 改用 WebSocket 调推理"
```

---

### 任务 7：创建 CollaborationPanel 组件

**文件：**
- 创建：`src/components/CollaborationPanel.tsx`

- [ ] **步骤 1：编写 CollaborationPanel**

```typescript
import { useState, useCallback, useEffect } from 'react';
import type { CollabState, WsMessage, Collaborator } from '../types';
import { wsClient } from '../api/websocket';
import { Panel, SectionTitle, Button, TextInput, Badge, cn } from './ui';

interface Props {
  collabState: CollabState;
  onCollabStateChange: (state: CollabState) => void;
  onTasksReceived: (tasks: import('../types').Task[]) => void;
  onTaskAdded: (task: import('../types').Task) => void;
  onTaskUpdated: (task: import('../types').Task) => void;
  onTaskDeleted: (taskId: string) => void;
  onTaskToggled: (taskId: string, completed: boolean) => void;
  onMemberJoin: (nickname: string) => void;
  onMemberLeave: (nickname: string) => void;
  onAuthFail: (reason: string) => void;
}

export default function CollaborationPanel({
  collabState,
  onCollabStateChange,
  onTasksReceived,
  onTaskAdded,
  onTaskUpdated,
  onTaskDeleted,
  onTaskToggled,
  onMemberJoin,
  onMemberLeave,
  onAuthFail,
}: Props) {
  const [groupId, setGroupId] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [joining, setJoining] = useState(false);

  // 注册 WebSocket 消息处理器
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(wsClient.on('auth_ok', (msg: WsMessage) => {
      const tasks = (msg.tasks as Array<Record<string, unknown>> || []).map(t => ({
        ...t,
        createdAt: new Date(t.createdAt as string),
      })) as import('../types').Task[];
      onTasksReceived(tasks);
      onCollabStateChange({
        isJoined: true,
        groupId: msg.group_id as string,
        nickname: nickname,
        members: msg.members as Collaborator[] || [],
      });
      setJoining(false);
    }));

    unsubs.push(wsClient.on('auth_fail', (msg: WsMessage) => {
      onAuthFail(msg.reason as string || '认证失败');
      setJoining(false);
    }));

    unsubs.push(wsClient.on('task_added', (msg: WsMessage) => {
      const t = msg.task as Record<string, unknown>;
      onTaskAdded({
        ...t,
        createdAt: new Date(t.createdAt as string),
      } as import('../types').Task);
    }));

    unsubs.push(wsClient.on('task_updated', (msg: WsMessage) => {
      const t = msg.task as Record<string, unknown>;
      onTaskUpdated({
        ...t,
        createdAt: new Date(t.createdAt as string),
      } as import('../types').Task);
    }));

    unsubs.push(wsClient.on('task_deleted', (msg: WsMessage) => {
      onTaskDeleted(msg.task_id as string);
    }));

    unsubs.push(wsClient.on('task_toggled', (msg: WsMessage) => {
      onTaskToggled(msg.task_id as string, msg.completed as boolean);
    }));

    unsubs.push(wsClient.on('member_join', (msg: WsMessage) => {
      onMemberJoin(msg.nickname as string);
    }));

    unsubs.push(wsClient.on('member_leave', (msg: WsMessage) => {
      onMemberLeave(msg.nickname as string);
    }));

    return () => unsubs.forEach(fn => fn());
  }, [nickname, onCollabStateChange, onTasksReceived, onTaskAdded, onTaskUpdated, onTaskDeleted, onTaskToggled, onMemberJoin, onMemberLeave, onAuthFail]);

  const handleJoin = useCallback(() => {
    const gid = groupId.trim();
    const pwd = password.trim();
    const nick = nickname.trim();
    if (!gid || !pwd || !nick) {
      onAuthFail('请填写组ID、密码和昵称');
      return;
    }
    setJoining(true);
    wsClient.send({ type: 'auth', group_id: gid, password: pwd, nickname: nick } as WsMessage);
  }, [groupId, password, nickname, onAuthFail]);

  const handleLeave = useCallback(() => {
    // 断开并重连（清理协作状态）
    wsClient.disconnect();
    setTimeout(() => wsClient.connect(), 100);
    onCollabStateChange({ isJoined: false, groupId: '', nickname: '', members: [] });
  }, [onCollabStateChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin();
  }, [handleJoin]);

  return (
    <Panel className="p-4 lg:p-5">
      <SectionTitle eyebrow="Collaboration" title="云端协作" />

      {!collabState.isJoined ? (
        <div className="space-y-2">
          <TextInput
            type="text"
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
            placeholder="组 ID（例如：my-team）"
            onKeyDown={handleKeyDown}
            disabled={joining}
          />
          <TextInput
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="组密码"
            onKeyDown={handleKeyDown}
            disabled={joining}
          />
          <TextInput
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="你的昵称"
            onKeyDown={handleKeyDown}
            disabled={joining}
          />
          <Button
            onClick={handleJoin}
            disabled={joining || !groupId.trim() || !password.trim() || !nickname.trim()}
            variant="primary"
            className="w-full py-2.5"
          >
            {joining ? '加入中...' : '加入/创建协作组'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 在线状态 */}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
            <span className="text-sm text-slate-300 font-medium">{collabState.groupId}</span>
            <Badge tone="success">{collabState.members.filter(m => m.online).length} 人在线</Badge>
          </div>

          {/* 成员列表 */}
          <div className="space-y-1">
            {collabState.members.map(m => (
              <div
                key={m.nickname}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm',
                  m.online ? 'text-slate-200' : 'text-slate-500',
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    m.online ? 'bg-emerald-400' : 'bg-slate-600',
                  )}
                />
                <span className="truncate">{m.nickname}</span>
                {m.nickname === collabState.nickname && (
                  <span className="text-[10px] text-slate-500 ml-auto">我</span>
                )}
              </div>
            ))}
          </div>

          <Button
            onClick={handleLeave}
            variant="ghost"
            className="w-full text-xs text-slate-500 hover:text-red-300"
          >
            离开协作组
          </Button>
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：CollaborationPanel 无类型错误（App.tsx 的 Props 不匹配由任务 8 修复）

- [ ] **步骤 3：Commit**

```bash
git add src/components/CollaborationPanel.tsx
git commit -m "feat: 创建协作组面板 CollaborationPanel"
```

---

### 任务 8：重构 App.tsx — 集成 WebSocket + 协作

**文件：**
- 修改：`src/App.tsx`

这是最大的改动。核心变化：
1. 移除 `ApiKeyInput`、`deepseek` 相关 import 和状态
2. 引入 `wsClient` 和 `CollaborationPanel`
3. 任务数据源切换：未加入组 → localStorage；已加入组 → 服务端
4. 注册 WebSocket 消息处理器

- [ ] **步骤 1：更新 import**

将现有 import 替换为：

```typescript
import { useState, useCallback, useEffect } from 'react';
import type { Task, ImageTaskDraft, CollabState, Collaborator, WsMessage } from './types';
import { wsClient } from './api/websocket';
import { recognizeTextFromImage } from './api/ocr';
import TaskInputForm from './components/TaskInputForm';
import QuadrantChart from './components/QuadrantChart';
import TaskList from './components/TaskList';
import ActionPanel from './components/ActionPanel';
import CollaborationPanel from './components/CollaborationPanel';
import ImageTaskPreview from './components/ImageTaskPreview';
import { Badge, Button, Panel, SectionTitle } from './components/ui';
```

注意：移除了 `analyzeTask`、`analyzeOcrText`、`getApiKey` 和 `ApiKeyInput`。

- [ ] **步骤 2：更新状态变量**

将现有的 `hasKey`、`lastOcrText` 状态移除，替换为协作相关状态。修改 `App` 函数体内状态声明部分（第 47-54 行替换为）：

```typescript
export default function App() {
  const [tasks, setTasks] = useState<Task[]>(loadStoredTasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [imageDrafts, setImageDrafts] = useState<ImageTaskDraft[] | null>(null);
  const [lastOcrText, setLastOcrText] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [collabState, setCollabState] = useState<CollabState>({
    isJoined: false,
    groupId: '',
    nickname: '',
    members: [],
  });
```

- [ ] **步骤 3：添加 WebSocket 生命周期**

在状态声明之后、`handleAddTask` 之前，添加：

```typescript
  // WebSocket 连接管理
  useEffect(() => {
    wsClient.connect();

    const unsubState = wsClient.onStateChange((s) => {
      setWsConnected(s === 'connected');
    });

    // 单机模式：analyze_result
    const unsub1 = wsClient.on('analyze_result', (msg: WsMessage) => {
      const result = msg.task as Record<string, unknown>;
      if (!result) return;
      const quadrant = getQuadrant(
        Number(result.urgency ?? 0),
        Number(result.importance ?? 0),
      );
      const task: Task = {
        id: nextId(),
        title: String(result.title || ''),
        description: String(result.description || result.suggestion || ''),
        urgency: Number(result.urgency ?? 0),
        importance: Number(result.importance ?? 0),
        quadrant,
        completed: false,
        createdAt: new Date(),
      };
      setTasks(prev => {
        const next = [task, ...prev];
        saveStoredTasks(next);
        return next;
      });
      setSelectedTaskId(task.id);
      setLoading(false);
      setLoadingMessage('');
    });

    // 单机模式：analyze_batch_result
    const unsub2 = wsClient.on('analyze_batch_result', (msg: WsMessage) => {
      const results = msg.tasks as Array<Record<string, unknown>> || [];
      const drafts: ImageTaskDraft[] = results.map((t: Record<string, unknown>) => ({
        title: String(t.title || ''),
        description: String(t.description || ''),
        urgency: Number(t.urgency ?? 0),
        importance: Number(t.importance ?? 0),
      }));
      setImageDrafts(drafts);
      setLoading(false);
      setLoadingMessage('');
    });

    // 通用错误
    const unsub3 = wsClient.on('error', (msg: WsMessage) => {
      setError(msg.message as string || '未知错误');
      setLoading(false);
      setLoadingMessage('');
    });

    return () => {
      unsubState();
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);
```

- [ ] **步骤 4：修改 handleAddTask**

不再需要异步调用 AI，文字提交已在 TaskInputForm 中通过 WebSocket 处理。但单机模式下 App.tsx 仍需要一个加载指示器的控制。

实际上，TaskInputForm 现在直接发 WebSocket 消息，而 App.tsx 通过 `analyze_result` 处理器接收结果。但 loading 状态仍需协调。简化：TaskInputForm 的 `onSubmit` prop 移除后，loading 由 TaskInputForm 内部管理，App.tsx 只需监听 WebSocket 消息。

因此，修改 `handleAddTask` 不再需要（文字提交已在 TaskInputForm 内部通过 WebSocket 处理）。保留它用于 loading 状态：

实际上我们应该把 loading 管理也移到 TaskInputForm。但先在 App.tsx 保留全局 loading 管理。需要修改 TaskInputForm 来 accept 一个 `onLoadingChange` prop...不过为了简单，TaskInputForm 在发送 analyze_text 时设置 loading，在收到结果时取消 loading。但 TaskInputForm 不直接监听 WebSocket 消息...

让我们换一种方式：TaskInputForm 通过回调通知 App.tsx 设置 loading，App.tsx 在收到 analyze_result 时取消 loading。

实际上最简单的方案：在 TaskInputForm 中，`handleSubmitText` 发送消息后调用一个 `onSubmitStart` 回调。但这又增加复杂度。

更简单：让 TaskInputForm 内部管理自己的 loading，通过新增的 `loading` prop 和 setter。但当前 TaskInputForm 已经接受 `loading` prop。

让我们重新考虑：保留部分现有流程。
- TaskInputForm 保留 `onSubmit` prop（但改为只是触发 loading + 发送 WS 消息）
- 或者：完全移除 TaskInputForm 的 loading prop，让它自己管理发送状态

最简方案：TaskInputForm 自己管理内部 loading 状态（设置 loading=true 当发送 analyze_text，由 App 在收到 result 时设置 loading=false）。App.tsx 的 loading 状态可以被 analyze_result 和 analyze_batch_result 处理器管理。

修改 TaskInputForm：在 handleSubmitText 中发送 WS 消息后触发 loading。重新审视：TaskInputForm 已经在步骤 6 被修改为使用 wsClient.send，但它没有设置 loading。让它通过一个回调通知外部：`onSubmitStart()`。

实际上，我们回到更简洁的设计：TaskInputForm 恢复 `onSubmit` prop，但语义改为"通知父组件开始加载"。在 App.tsx 中：

```typescript
const handleSubmitStart = useCallback(() => {
  setLoading(true);
  setLoadingMessage('正在调用模型分析...');
}, []);
```

然后传给 TaskInputForm 的 `onSubmitStart` prop。

但等等，这会改得比较碎。让我重新规划 TaskInputForm 和 App.tsx 之间的接口。

**最终方案：**
- TaskInputForm 暴露 `onSubmitStart` 回调（代替原来的 `onSubmit`）
- TaskInputForm 的图片模式：`onImageSubmit` 改为返回 OCR 文本，让 App 处理批量分析
- 实际上在任务 6 中我们已经改了 TaskInputForm，图片提交中调了 OCR + WebSocket。但这样 TaskInputForm 就得 import OCR 模块...

让我简化：保留 TaskInputForm 作为纯 UI，回调方式。TaskInputForm 恢复简洁：

**TaskInputForm Props 改为：**
```typescript
interface Props {
  onTextSubmit: (title: string, description: string) => void;
  onImageReady: (base64: string) => void;
  loading: boolean;
  loadingMessage?: string;
}
```

TaskInputForm 不调 WebSocket，不调 OCR。App.tsx 负责所有逻辑。

这样改动最小，TaskInputForm 几乎不变。

在 App.tsx 中：
- `handleTextSubmit`: 通过 wsClient.send('analyze_text', ...) 
- `handleImageReady`: OCR + wsClient.send('analyze_batch', ...)

这更干净！让我修订计划。

重新设计任务 6 和任务 8：

**任务 6（修订）：TaskInputForm 微调 Props 名称**
- `onSubmit` → `onTextSubmit`，只传 `{title, description}` 
- `onImageSubmit` → `onImageReady`，只传 base64
- 不改 WebSocket 逻辑

**任务 8（修订）：App.tsx 集成**
- 在 handleTextSubmit 中调 wsClient.send('analyze_text', ...)
- 在 handleImageReady 中做 OCR + wsClient.send('analyze_batch', ...)
- 注册消息处理器处理 analyze_result / analyze_batch_result

这样更清晰。让我重新整理完整计划。

OK let me now rewrite the plan from task 6 onwards with this cleaner approach. Let me also think about what App.tsx needs to change for the collaboration data source.

When in collaboration mode (collabState.isJoined = true):
- Tasks come from server (via auth_ok initially, then task_added/updated/deleted/toggled)
- Adding a task: send 'task_add' via WebSocket instead of 'analyze_text'
- Task operations (delete, toggle, update): send to server, server broadcasts

When in standalone mode:
- Tasks come from localStorage
- Adding a task: send 'analyze_text', get result, save to localStorage
- Task operations: modify localStorage directly

This is a key architectural concern. Let me plan the handlers carefully.

Actually, looking at this more carefully, I think the simplest approach for App.tsx is:
1. Always keep tasks in React state
2. In standalone mode: tasks come from localStorage + analyze_result
3. In collaboration mode: tasks come from auth_ok + task_added/updated/deleted/toggled
4. TaskInputForm sends to wsClient; handlers update state accordingly

For handleToggleComplete, handleTaskDelete, handleUpdateTask in collaboration mode, they need to send WebSocket messages instead of directly modifying localStorage.

Let me write the plan carefully now. I'll be very explicit.

OK, let me just write the plan file now. I've been overthinking.<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="write_file">
<｜｜DSML｜｜parameter name="content" string="true"># 云端协作 + 全栈重构 实现计划

> **面向 AI 代理的工作者：** 使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 前端重构为纯 UI 层（所有操作走 WebSocket），后端集成自研 MacBERT 模型推理 + WebSocket 协作组管理。

**架构：** 前端通过单条 WebSocket 连接后端 FastAPI，后端负责模型推理（TaskScorer）和协作组管理（GroupManager + JSON 文件持久化）。前端删除 deepseek.ts 和 ApiKeyInput 组件。

**技术栈：** React 19 + TypeScript + Vite（前端），Python FastAPI + WebSocket + MacBERT（后端）

---

## 文件变更清单

```
新增:
  task_scorer/server/group_manager.py    # 协作组管理器
  src/api/websocket.ts                   # WebSocket 客户端封装
  src/components/CollaborationPanel.tsx  # 协作组面板

修改:
  task_scorer/server/app.py              # 提取 do_predict + 新增 /ws WebSocket 端点
  src/types.ts                           # 新增 WS 消息类型 + 协作类型
  src/components/TaskInputForm.tsx       # 微调 Props（不改 WS 逻辑，保持纯 UI）
  src/App.tsx                            # 集成 WebSocket + 协作状态 + 删除 API Key 逻辑
  src/components/ImageTaskPreview.tsx    # 标题文字微调

删除:
  src/api/deepseek.ts                    # 不再需要
  src/components/ApiKeyInput.tsx         # 不再需要
```

---

### 任务 1：创建后端 GroupManager

**文件：**
- 创建：`task_scorer/server/group_manager.py`

- [ ] **步骤 1：编写 GroupManager 模块**

```python
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
    all_members: set = field(default_factory=set)
    connections: dict = field(default_factory=dict)       # nickname -> WebSocket
    created_at: str = ""

    def is_member_online(self, nickname: str) -> bool:
        return nickname in self.connections

    def add_member(self, nickname: str, ws: WebSocket):
        self.all_members.add(nickname)
        self.connections[nickname] = ws

    def remove_member(self, nickname: str):
        self.connections.pop(nickname, None)

    def get_members(self) -> list:
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
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        group = self._groups.get(group_id)
        if group:
            if group.password_hash != password_hash:
                raise ValueError("密码错误")
            return group
        group = self._load(group_id)
        if group:
            if group.password_hash != password_hash:
                raise ValueError("密码错误")
            self._groups[group_id] = group
            return group
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
```

- [ ] **步骤 2：验证导入**

```bash
cd task_scorer && python -c "from server.group_manager import GroupManager; gm = GroupManager(); print('OK')"
```
预期：输出 `OK`

- [ ] **步骤 3：Commit**

```bash
git add task_scorer/server/group_manager.py
git commit -m "feat: 添加协作组管理器 GroupManager"
```

---

### 任务 2：重构 app.py — 提取推理函数

**文件：**
- 修改：`task_scorer/server/app.py`

- [ ] **步骤 1：在 `get_suggestion` 之后、`load_model` 之前添加 `do_predict` 和 `do_predict_batch`**

用 `edit_file` 在 `def load_model():` 之前插入：

```python
def do_predict(title: str, description: str = "") -> dict:
    """单任务推理，返回 {title,description,urgency,importance,suggestion}"""
    if model is None or tokenizer is None:
        raise RuntimeError("模型未加载")
    text = title.strip()
    if description.strip():
        text = f"{text}。{description.strip()}"
    encoding = tokenizer(
        text, max_length=MAX_LENGTH, padding="max_length",
        truncation=True, return_tensors="pt",
    )
    input_ids = encoding["input_ids"].to(DEVICE)
    attention_mask = encoding["attention_mask"].to(DEVICE)
    token_type_ids = encoding.get("token_type_ids", torch.zeros_like(input_ids)).to(DEVICE)
    with torch.no_grad():
        outputs = model.predict(input_ids, attention_mask, token_type_ids)
    urgency = float(outputs["urgency"][0])
    importance = float(outputs["importance"][0])
    urgency_int = int(np.clip(round(urgency), -5, 5))
    importance_int = int(np.clip(round(importance), -5, 5))
    quadrant = (
        1 if urgency_int >= 0 and importance_int >= 0 else
        2 if urgency_int < 0 and importance_int >= 0 else
        3 if urgency_int < 0 and importance_int < 0 else 4
    )
    return {
        "title": title, "description": description,
        "urgency": urgency_int, "importance": importance_int,
        "suggestion": get_suggestion(quadrant),
    }


def do_predict_batch(tasks: list) -> list:
    """批量推理 [{"title","description"}] → [{"title","description","urgency","importance"}]"""
    if model is None or tokenizer is None:
        raise RuntimeError("模型未加载")
    texts = []
    for t in tasks:
        text = t["title"].strip()
        if t.get("description", "").strip():
            text = f"{text}。{t['description'].strip()}"
        texts.append(text)
    encoding = tokenizer(
        texts, max_length=MAX_LENGTH, padding="max_length",
        truncation=True, return_tensors="pt",
    )
    input_ids = encoding["input_ids"].to(DEVICE)
    attention_mask = encoding["attention_mask"].to(DEVICE)
    token_type_ids = encoding.get("token_type_ids", torch.zeros_like(input_ids)).to(DEVICE)
    with torch.no_grad():
        outputs = model.predict(input_ids, attention_mask, token_type_ids)
    results = []
    for i, t in enumerate(tasks):
        results.append({
            "title": t["title"],
            "description": t.get("description", ""),
            "urgency": int(np.clip(round(float(outputs["urgency"][i])), -5, 5)),
            "importance": int(np.clip(round(float(outputs["importance"][i])), -5, 5)),
        })
    return results
```

- [ ] **步骤 2：简化 `/predict` 和 `/predict_batch` 路由复用新函数**

将 `predict_single`（原 ~140-189 行）替换为：

```python
@app.post("/predict", response_model=PredictionOutput)
async def predict_single(task: TaskInput):
    try:
        result = do_predict(task.title, task.description)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return PredictionOutput(**result)
```

将 `predict_batch`（原 ~192-239 行）替换为：

```python
@app.post("/predict_batch", response_model=BatchOutput)
async def predict_batch(batch: BatchInput):
    try:
        tasks_in = [{"title": t.title, "description": t.description} for t in batch.tasks]
        results = do_predict_batch(tasks_in)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return BatchOutput(tasks=results)
```

- [ ] **步骤 3：验证导入**

```bash
cd task_scorer && python -c "from server.app import do_predict, do_predict_batch; print('OK')"
```
预期：`OK`（会触发模型加载）

- [ ] **步骤 4：Commit**

```bash
git add task_scorer/server/app.py
git commit -m "refactor: 提取 do_predict/do_predict_batch 复用函数"
```

---

### 任务 3：添加 WebSocket 端点

**文件：**
- 修改：`task_scorer/server/app.py`

- [ ] **步骤 1：添加导入**

在文件顶部已有 import 之后添加：

```python
import time as time_module
from fastapi import WebSocket, WebSocketDisconnect
from server.group_manager import GroupManager
```

- [ ] **步骤 2：添加全局 GroupManager + 初始化**

将 `group_manager` 声明添加到 `model` 变量附近（约第 83 行）：

```python
group_manager: Optional[GroupManager] = None
```

修改 `startup_event`（约第 123-127 行），在 `load_model()` 之后初始化：

```python
@app.on_event("startup")
async def startup_event():
    global group_manager
    load_model()
    group_manager = GroupManager()
```

- [ ] **步骤 3：在 `root()` 之后添加 WebSocket 端点**

在 `root()` 函数（约第 242 行之后）追加：

```python
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    authenticated = False
    current_group: Optional[Group] = None
    current_nickname: Optional[str] = None

    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type", "")

            # ---- 单机模式：无需认证 ----
            if msg_type == "analyze_text":
                try:
                    result = do_predict(
                        data.get("title", ""),
                        data.get("description", ""),
                    )
                    await ws.send_json({"type": "analyze_result", "task": result})
                except RuntimeError as e:
                    await ws.send_json({"type": "error", "message": str(e)})
                continue

            if msg_type == "analyze_batch":
                try:
                    tasks_in = data.get("texts", [])
                    results = do_predict_batch(tasks_in)
                    await ws.send_json({"type": "analyze_batch_result", "tasks": results})
                except RuntimeError as e:
                    await ws.send_json({"type": "error", "message": str(e)})
                continue

            # ---- 认证 ----
            if msg_type == "auth":
                group_id = str(data.get("group_id", "")).strip()
                password = str(data.get("password", "")).strip()
                nickname = str(data.get("nickname", "")).strip()

                if not group_id or not password or not nickname:
                    await ws.send_json({"type": "auth_fail", "reason": "组ID、密码、昵称不能为空"})
                    continue

                try:
                    group = group_manager.get_or_create(group_id, password)
                except ValueError:
                    await ws.send_json({"type": "auth_fail", "reason": "密码错误"})
                    continue

                if group.is_member_online(nickname):
                    await ws.send_json({"type": "auth_fail", "reason": "昵称已被使用，请换一个"})
                    continue

                group.add_member(nickname, ws)
                authenticated = True
                current_group = group
                current_nickname = nickname

                await ws.send_json({
                    "type": "auth_ok",
                    "group_id": group.group_id,
                    "tasks": group.tasks,
                    "members": group.get_members(),
                })
                await group.broadcast({
                    "type": "member_join",
                    "nickname": nickname,
                }, exclude=nickname)
                continue

            # ---- 需要认证的操作 ----
            if not authenticated:
                await ws.send_json({"type": "error", "message": "请先加入协作组"})
                continue

            group = current_group
            nickname = current_nickname

            if msg_type == "task_add":
                title = data.get("title", "").strip()
                description = data.get("description", "").strip()
                if not title:
                    await ws.send_json({"type": "error", "message": "任务标题不能为空"})
                    continue
                try:
                    scored = do_predict(title, description)
                except RuntimeError as e:
                    await ws.send_json({"type": "error", "message": str(e)})
                    continue
                u = scored["urgency"]
                i = scored["importance"]
                task = {
                    "id": f"task_{int(time_module.time() * 1000)}_{len(group.tasks)}",
                    "title": scored["title"],
                    "description": scored["description"],
                    "urgency": u,
                    "importance": i,
                    "quadrant": (
                        1 if u >= 0 and i >= 0 else
                        2 if u < 0 and i >= 0 else
                        3 if u < 0 and i < 0 else 4
                    ),
                    "completed": False,
                    "createdBy": nickname,
                    "createdAt": time_module.strftime("%Y-%m-%dT%H:%M:%S"),
                }
                group.add_task(task)
                group_manager.save_group(group)
                await group.broadcast({"type": "task_added", "task": task})
                continue

            if msg_type == "task_update":
                task_id = data.get("task_id", "")
                updates = {}
                # 先查当前值确保 quadrant 正确计算
                curr = next((t for t in group.tasks if t["id"] == task_id), None)
                if not curr:
                    continue
                if "urgency" in data:
                    updates["urgency"] = int(np.clip(round(data["urgency"]), -5, 5))
                if "importance" in data:
                    updates["importance"] = int(np.clip(round(data["importance"]), -5, 5))
                u = updates.get("urgency", curr["urgency"])
                i = updates.get("importance", curr["importance"])
                updates["quadrant"] = (
                    1 if u >= 0 and i >= 0 else
                    2 if u < 0 and i >= 0 else
                    3 if u < 0 and i < 0 else 4
                )
                updated = group.update_task(task_id, updates)
                if updated:
                    group_manager.save_group(group)
                    await group.broadcast({"type": "task_updated", "task": updated})
                continue

            if msg_type == "task_delete":
                task_id = data.get("task_id", "")
                if group.delete_task(task_id):
                    group_manager.save_group(group)
                    await group.broadcast({"type": "task_deleted", "task_id": task_id})
                continue

            if msg_type == "task_toggle":
                task_id = data.get("task_id", "")
                completed = group.toggle_task(task_id)
                if completed is not None:
                    group_manager.save_group(group)
                    await group.broadcast({
                        "type": "task_toggled",
                        "task_id": task_id,
                        "completed": completed,
                    })
                continue

            await ws.send_json({"type": "error", "message": f"未知消息类型: {msg_type}"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        if authenticated and current_group and current_nickname:
            current_group.remove_member(current_nickname)
            try:
                await current_group.broadcast({
                    "type": "member_leave",
                    "nickname": current_nickname,
                })
            except Exception:
                pass
```

- [ ] **步骤 4：验证语法正确**

```bash
cd task_scorer && python -c "from server.app import app; print('OK')"
```
预期：`OK`

- [ ] **步骤 5：Commit**

```bash
git add task_scorer/server/app.py
git commit -m "feat: 添加 /ws WebSocket 协作端点"
```

---

### 任务 4：扩展前端类型定义

**文件：**
- 修改：`src/types.ts`

- [ ] **步骤 1：在文件末尾追加协作类型**

```typescript
// ========== WebSocket 消息 & 协作类型 ==========

export type WsMessageType =
  | 'analyze_text' | 'analyze_result'
  | 'analyze_batch' | 'analyze_batch_result'
  | 'auth' | 'auth_ok' | 'auth_fail'
  | 'task_add' | 'task_added'
  | 'task_update' | 'task_updated'
  | 'task_delete' | 'task_deleted'
  | 'task_toggle' | 'task_toggled'
  | 'member_join' | 'member_leave' | 'members_list'
  | 'error';

export interface WsMessage {
  type: WsMessageType;
  [key: string]: unknown;
}

export interface Collaborator {
  nickname: string;
  online: boolean;
}

export interface CollabState {
  isJoined: boolean;
  groupId: string;
  nickname: string;
  members: Collaborator[];
}
```

- [ ] **步骤 2：验证编译**

```bash
npx tsc --noEmit
```
预期：无新增错误

- [ ] **步骤 3：Commit**

```bash
git add src/types.ts
git commit -m "feat: 添加 WebSocket 消息和协作类型"
```

---

### 任务 5：创建 WebSocket 客户端

**文件：**
- 创建：`src/api/websocket.ts`

- [ ] **步骤 1：编写 WsClient 类**

```typescript
import type { WsMessage } from '../types';

type MessageHandler = (msg: WsMessage) => void;
type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const WS_URL = `ws://${window.location.hostname}:8001/ws`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private state: ConnectionState = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stateListeners = new Set<(s: ConnectionState) => void>();

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    this.setState('connecting');
    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.setState('connected');
      this.reconnectAttempt = 0;
    };
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        this.dispatch(msg);
      } catch { /* 忽略解析失败 */ }
    };
    this.ws.onclose = () => {
      this.setState('disconnected');
      this.ws = null;
      this.scheduleReconnect();
    };
    this.ws.onerror = () => { /* onclose 会紧随 */ };
  }

  disconnect() {
    this.cancelReconnect();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  send(msg: WsMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[WS] 未连接，无法发送:', msg.type);
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => { this.handlers.get(type)?.delete(handler); };
  }

  onStateChange(listener: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => { this.stateListeners.delete(listener); };
  }

  getState(): ConnectionState { return this.state; }

  private setState(s: ConnectionState) {
    if (this.state === s) return;
    this.state = s;
    this.stateListeners.forEach(fn => fn(s));
  }

  private dispatch(msg: WsMessage) {
    this.handlers.get(msg.type)?.forEach(fn => fn(msg));
    this.handlers.get('*')?.forEach(fn => fn(msg));
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
  }

  private cancelReconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}

export const wsClient = new WsClient();
```

- [ ] **步骤 2：验证编译**

```bash
npx tsc --noEmit
```
预期：无新增错误

- [ ] **步骤 3：Commit**

```bash
git add src/api/websocket.ts
git commit -m "feat: 创建 WebSocket 客户端封装 WsClient"
```

---

### 任务 6：微调 TaskInputForm Props

**文件：**
- 修改：`src/components/TaskInputForm.tsx`

- [ ] **步骤 1：修改 Props —— 重命名回调，移除 AI 相关文案**

将 `Props` 接口（第 5-10 行）修改为：

```typescript
interface Props {
  onTextSubmit: (title: string, description: string) => void;
  onImageReady: (base64: string) => void;
  loading: boolean;
  loadingMessage?: string;
}
```

将 `onSubmit` 调用（第 101 行）改为：

```typescript
onTextSubmit(title.trim(), description.trim());
```

将 `onImageSubmit` 调用（第 108 行）改为：

```typescript
onImageReady(compressedBase64);
```

修改按钮文案（第 179 行和 255 行），将 "AI 分析" 改为 "模型分析"：

- 文字模式按钮：`{loadingMessage || '模型分析并添加'}`
- 图片模式按钮：`{loadingMessage || 'OCR 识别并分析'}`

修改图片上传区 loading 文案（第 208 行）：

```
<p className="text-sm text-cyan-300 mb-1">{loadingMessage || '模型分析中...'}</p>
```

- [ ] **步骤 2：验证编译**

```bash
npx tsc --noEmit
```
预期：只有 App.tsx Props 不匹配的预先错误（任务 8 修复）

- [ ] **步骤 3：Commit**

```bash
git add src/components/TaskInputForm.tsx
git commit -m "refactor: TaskInputForm Props 重命名，移除 AI 文案"
```

---

### 任务 7：创建 CollaborationPanel

**文件：**
- 创建：`src/components/CollaborationPanel.tsx`

- [ ] **步骤 1：编写组件**

```typescript
import { useState, useCallback, useEffect } from 'react';
import type { CollabState, WsMessage, Collaborator } from '../types';
import { wsClient } from '../api/websocket';
import { Panel, SectionTitle, Button, TextInput, Badge, cn } from './ui';

interface Props {
  collabState: CollabState;
  onCollabStateChange: (s: CollabState) => void;
  onTasksReceived: (tasks: Array<Record<string, unknown>>) => void;
  onMemberJoin: (nickname: string) => void;
  onMemberLeave: (nickname: string) => void;
}

export default function CollaborationPanel({
  collabState,
  onCollabStateChange,
  onTasksReceived,
  onMemberJoin,
  onMemberLeave,
}: Props) {
  const [groupId, setGroupId] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [joining, setJoining] = useState(false);

  // 注册协作消息处理器
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(wsClient.on('auth_ok', (msg: WsMessage) => {
      onTasksReceived((msg.tasks as Array<Record<string, unknown>>) || []);
      onCollabStateChange({
        isJoined: true,
        groupId: msg.group_id as string,
        nickname: nickname,
        members: (msg.members as Collaborator[]) || [],
      });
      setJoining(false);
    }));

    unsubs.push(wsClient.on('auth_fail', (_msg: WsMessage) => {
      setJoining(false);
    }));

    unsubs.push(wsClient.on('member_join', (msg: WsMessage) => {
      onMemberJoin(msg.nickname as string);
    }));

    unsubs.push(wsClient.on('member_leave', (msg: WsMessage) => {
      onMemberLeave(msg.nickname as string);
    }));

    return () => unsubs.forEach(fn => fn());
  }, [nickname, onCollabStateChange, onTasksReceived, onMemberJoin, onMemberLeave]);

  const handleJoin = useCallback(() => {
    const gid = groupId.trim();
    const pwd = password.trim();
    const nick = nickname.trim();
    if (!gid || !pwd || !nick) return;
    setJoining(true);
    wsClient.send({ type: 'auth', group_id: gid, password: pwd, nickname: nick } as WsMessage);
  }, [groupId, password, nickname]);

  const handleLeave = useCallback(() => {
    wsClient.disconnect();
    setTimeout(() => wsClient.connect(), 100);
    onCollabStateChange({ isJoined: false, groupId: '', nickname: '', members: [] });
  }, [onCollabStateChange]);

  return (
    <Panel className="p-4 lg:p-5">
      <SectionTitle eyebrow="Collaboration" title="云端协作" />

      {!collabState.isJoined ? (
        <div className="space-y-2">
          <TextInput
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
            placeholder="组 ID（例如：my-team）"
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            disabled={joining}
          />
          <TextInput
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="组密码"
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            disabled={joining}
          />
          <TextInput
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="你的昵称"
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            disabled={joining}
          />
          <Button
            onClick={handleJoin}
            disabled={joining || !groupId.trim() || !password.trim() || !nickname.trim()}
            variant="primary"
            className="w-full py-2.5"
          >
            {joining ? '加入中...' : '加入/创建协作组'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
            <span className="text-sm text-slate-300 font-medium">{collabState.groupId}</span>
            <Badge tone="success">
              {collabState.members.filter(m => m.online).length} 人在线
            </Badge>
          </div>
          <div className="space-y-1">
            {collabState.members.map(m => (
              <div
                key={m.nickname}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm',
                  m.online ? 'text-slate-200' : 'text-slate-500',
                )}
              >
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full flex-shrink-0',
                  m.online ? 'bg-emerald-400' : 'bg-slate-600',
                )} />
                <span className="truncate">{m.nickname}</span>
                {m.nickname === collabState.nickname && (
                  <span className="text-[10px] text-slate-500 ml-auto">我</span>
                )}
              </div>
            ))}
          </div>
          <Button onClick={handleLeave} variant="ghost" className="w-full text-xs text-slate-500 hover:text-red-300">
            离开协作组
          </Button>
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **步骤 2：验证编译**

```bash
npx tsc --noEmit
```
预期：仅有 App.tsx 的预先错误

- [ ] **步骤 3：Commit**

```bash
git add src/components/CollaborationPanel.tsx
git commit -m "feat: 创建协作组面板 CollaborationPanel"
```

---

### 任务 8：重构 App.tsx

**文件：**
- 修改：`src/App.tsx`

这是核心集成任务。按步骤逐步修改。

- [ ] **步骤 1：更新 import（第 1-11 行）**

```typescript
import { useState, useCallback, useEffect } from 'react';
import type { Task, ImageTaskDraft, CollabState, Collaborator, WsMessage } from './types';
import { wsClient } from './api/websocket';
import { recognizeTextFromImage } from './api/ocr';
import TaskInputForm from './components/TaskInputForm';
import QuadrantChart from './components/QuadrantChart';
import TaskList from './components/TaskList';
import ActionPanel from './components/ActionPanel';
import CollaborationPanel from './components/CollaborationPanel';
import ImageTaskPreview from './components/ImageTaskPreview';
import { Badge, Button, Panel, SectionTitle } from './components/ui';
```

删除 `import { analyzeTask, analyzeOcrText, getApiKey }` 和 `import ApiKeyInput`。

- [ ] **步骤 2：替换状态声明（第 47-54 行）**

```typescript
  const [tasks, setTasks] = useState<Task[]>(loadStoredTasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [imageDrafts, setImageDrafts] = useState<ImageTaskDraft[] | null>(null);
  const [lastOcrText, setLastOcrText] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [collabState, setCollabState] = useState<CollabState>({
    isJoined: false, groupId: '', nickname: '', members: [],
  });
```

- [ ] **步骤 3：添加 WebSocket 生命周期（在状态块之后、handleAddTask 之前）**

```typescript
  // ---- WebSocket 连接 & 全局消息处理 ----
  useEffect(() => {
    wsClient.connect();
    const unsubState = wsClient.onStateChange(s => setWsConnected(s === 'connected'));

    // 单机：文字分析结果
    const unsub1 = wsClient.on('analyze_result', (msg: WsMessage) => {
      const r = msg.task as Record<string, unknown> | undefined;
      if (!r) { setLoading(false); return; }
      const quadrant = getQuadrant(Number(r.urgency ?? 0), Number(r.importance ?? 0));
      const task: Task = {
        id: nextId(),
        title: String(r.title || ''),
        description: String(r.description || r.suggestion || ''),
        urgency: Number(r.urgency ?? 0),
        importance: Number(r.importance ?? 0),
        quadrant,
        completed: false,
        createdAt: new Date(),
      };
      setTasks(prev => { const next = [task, ...prev]; saveStoredTasks(next); return next; });
      setSelectedTaskId(task.id);
      setLoading(false);
      setLoadingMessage('');
    });

    // 单机：批量分析结果
    const unsub2 = wsClient.on('analyze_batch_result', (msg: WsMessage) => {
      const results = (msg.tasks as Array<Record<string, unknown>>) || [];
      const drafts: ImageTaskDraft[] = results.map(t => ({
        title: String(t.title || ''),
        description: String(t.description || ''),
        urgency: Number(t.urgency ?? 0),
        importance: Number(t.importance ?? 0),
      }));
      setImageDrafts(drafts);
      setLoading(false);
      setLoadingMessage('');
    });

    // 全局错误
    const unsub3 = wsClient.on('error', (msg: WsMessage) => {
      setError(msg.message as string || '未知错误');
      setLoading(false);
      setLoadingMessage('');
    });

    // ---- 协作模式消息（仅在已加入组时生效） ----
    const unsub4 = wsClient.on('task_added', (msg: WsMessage) => {
      const t = msg.task as Record<string, unknown>;
      if (!t) return;
      const task: Task = {
        id: t.id as string,
        title: String(t.title || ''),
        description: String(t.description || ''),
        urgency: Number(t.urgency ?? 0),
        importance: Number(t.importance ?? 0),
        quadrant: Number(t.quadrant ?? 1) as 1 | 2 | 3 | 4,
        completed: Boolean(t.completed),
        createdAt: new Date(t.createdAt as string),
      };
      setTasks(prev => [task, ...prev]);
    });

    const unsub5 = wsClient.on('task_updated', (msg: WsMessage) => {
      const t = msg.task as Record<string, unknown>;
      if (!t) return;
      setTasks(prev => prev.map(task =>
        task.id === t.id
          ? { ...task, urgency: Number(t.urgency), importance: Number(t.importance), quadrant: Number(t.quadrant) as 1|2|3|4 }
          : task
      ));
    });

    const unsub6 = wsClient.on('task_deleted', (msg: WsMessage) => {
      const tid = msg.task_id as string;
      setTasks(prev => prev.filter(t => t.id !== tid));
      setSelectedTaskId(prev => prev === tid ? null : prev);
    });

    const unsub7 = wsClient.on('task_toggled', (msg: WsMessage) => {
      const tid = msg.task_id as string;
      const completed = msg.completed as boolean;
      setTasks(prev => prev.map(t => t.id === tid ? { ...t, completed } : t));
    });

    return () => {
      unsubState(); unsub1(); unsub2(); unsub3();
      unsub4(); unsub5(); unsub6(); unsub7();
    };
  }, []);
```

- [ ] **步骤 4：修改 handleAddTask → 改为 handleTextSubmit + handleImageReady**

删除旧的 `handleAddTask`（第 56-85 行），替换为：

```typescript
  const handleTextSubmit = useCallback((title: string, description: string) => {
    setError(null);
    setLoading(true);
    setLoadingMessage('正在调用模型分析...');
    if (collabState.isJoined) {
      // 协作模式：发送 task_add
      wsClient.send({ type: 'task_add', title, description } as WsMessage);
      // loading 在收到 task_added 时清除（见上面 unsub4），但需要超时保护
      setTimeout(() => { setLoading(false); setLoadingMessage(''); }, 15000);
    } else {
      // 单机模式：发送 analyze_text
      wsClient.send({ type: 'analyze_text', title, description } as WsMessage);
    }
  }, [collabState.isJoined]);

  const handleImageReady = useCallback(async (base64: string) => {
    setError(null);
    setLoading(true);
    setLoadingMessage('正在识别图片文字...');
    try {
      const ocrText = await recognizeTextFromImage(base64);
      setLastOcrText(ocrText);
      const lines = ocrText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !/^[\s\p{P}]+$/u.test(l));
      if (lines.length === 0) {
        setError('OCR 未识别出有效任务文字，请换一张更清晰的图片');
        setLoading(false);
        setLoadingMessage('');
        return;
      }
      setLoadingMessage('正在调用模型评分...');
      wsClient.send({
        type: 'analyze_batch',
        texts: lines.map(title => ({ title, description: '' })),
      } as WsMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR 识别失败');
      setLoading(false);
      setLoadingMessage('');
    }
  }, []);
```

- [ ] **步骤 5：删除 `handleImageSubmit`（第 87-107 行）**

该回调已被 `handleImageReady` + WebSocket 消息处理器取代。

- [ ] **步骤 6：修改 handleTaskDelete、handleToggleComplete、handleUpdateTask 以支持协作模式**

修改 `handleTaskDelete`（第 144-151 行）：

```typescript
  const handleTaskDelete = useCallback((id: string) => {
    if (collabState.isJoined) {
      wsClient.send({ type: 'task_delete', task_id: id } as WsMessage);
      return;
    }
    setTasks(prev => {
      const next = prev.filter(t => t.id !== id);
      saveStoredTasks(next);
      return next;
    });
    setSelectedTaskId(prev => prev === id ? null : prev);
  }, [collabState.isJoined]);
```

修改 `handleToggleComplete`（第 153-159 行）：

```typescript
  const handleToggleComplete = useCallback((id: string) => {
    if (collabState.isJoined) {
      wsClient.send({ type: 'task_toggle', task_id: id } as WsMessage);
      return;
    }
    setTasks(prev => {
      const next = prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
      saveStoredTasks(next);
      return next;
    });
  }, [collabState.isJoined]);
```

修改 `handleUpdateTask`（第 161-172 行）：

```typescript
  const handleUpdateTask = useCallback((id: string, updates: Partial<Pick<Task, 'urgency' | 'importance'>>) => {
    if (collabState.isJoined) {
      wsClient.send({ type: 'task_update', task_id: id, ...updates } as WsMessage);
      return;
    }
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== id) return t;
        const urgency = updates.urgency ?? t.urgency;
        const importance = updates.importance ?? t.importance;
        return { ...t, urgency, importance, quadrant: getQuadrant(urgency, importance) };
      });
      saveStoredTasks(next);
      return next;
    });
  }, [collabState.isJoined]);
```

- [ ] **步骤 7：添加协作相关回调**

在 `handleUpdateTask` 之后添加：

```typescript
  const handleCollabStateChange = useCallback((s: CollabState) => {
    setCollabState(s);
  }, []);

  const handleCollabTasksReceived = useCallback((serverTasks: Array<Record<string, unknown>>) => {
    const parsed: Task[] = serverTasks.map(t => ({
      id: t.id as string,
      title: String(t.title || ''),
      description: String(t.description || ''),
      urgency: Number(t.urgency ?? 0),
      importance: Number(t.importance ?? 0),
      quadrant: Number(t.quadrant ?? 1) as 1 | 2 | 3 | 4,
      completed: Boolean(t.completed),
      createdAt: new Date(t.createdAt as string),
    }));
    setTasks(parsed);
  }, []);

  const handleMemberJoin = useCallback((nickname: string) => {
    setCollabState(prev => {
      const members = prev.members.map(m =>
        m.nickname === nickname ? { ...m, online: true } : m
      );
      if (!members.find(m => m.nickname === nickname)) {
        members.push({ nickname, online: true });
      }
      return { ...prev, members };
    });
  }, []);

  const handleMemberLeave = useCallback((nickname: string) => {
    setCollabState(prev => ({
      ...prev,
      members: prev.members.map(m =>
        m.nickname === nickname ? { ...m, online: false } : m
      ),
    }));
  }, []);
```

- [ ] **步骤 8：更新 JSX —— 替换 ApiKeyInput 为连接状态、添加 CollaborationPanel**

删除 `{!hasKey && (<ApiKeyInput ... />)}`（第 197-199 行）。

删除 `{hasKey && (<div className="flex items-center gap-2...>`（第 223-233 行）。

在 `TaskInputForm` 的 JSX（第 236-241 行）中修改 props：

```tsx
            <TaskInputForm
              onTextSubmit={handleTextSubmit}
              onImageReady={handleImageReady}
              loading={loading}
              loadingMessage={loadingMessage}
            />
```

在 `ActionPanel` 之后（第 244-246 行之后）添加协作面板和连接状态：

```tsx
            {/* Collaboration Panel */}
            <div>
              <CollaborationPanel
                collabState={collabState}
                onCollabStateChange={handleCollabStateChange}
                onTasksReceived={handleCollabTasksReceived}
                onMemberJoin={handleMemberJoin}
                onMemberLeave={handleMemberLeave}
              />
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-2 text-xs">
              <span className={wsConnected ? 'text-emerald-400' : 'text-amber-400'}>
                {wsConnected ? '●' : '○'}
              </span>
              <span className="text-slate-500">
                {wsConnected ? '后端已连接' : '后端未连接'}
              </span>
            </div>
```

- [ ] **步骤 9：验证编译**

```bash
npx tsc --noEmit
```
预期：零错误

- [ ] **步骤 10：Commit**

```bash
git add src/App.tsx
git commit -m "refactor: App 集成 WebSocket + 协作模式 + 删除 API Key 依赖"
```

---

### 任务 9：删除废弃文件

**文件：**
- 删除：`src/api/deepseek.ts`
- 删除：`src/components/ApiKeyInput.tsx`

- [ ] **步骤 1：删除文件**

```bash
git rm src/api/deepseek.ts src/components/ApiKeyInput.tsx
```

- [ ] **步骤 2：验证编译**

```bash
npx tsc --noEmit
```
预期：零错误

- [ ] **步骤 3：Commit**

```bash
git commit -m "chore: 删除 deepseek.ts 和 ApiKeyInput（已由 WebSocket 替代）"
```

---

### 任务 10：微调 ImageTaskPreview 文案

**文件：**
- 修改：`src/components/ImageTaskPreview.tsx`

- [ ] **步骤 1：将标题文案中的 "AI" 改为 "模型"**

第 54 行：`AI 从图片中识别出`

改为：`模型从图片中识别出`

- [ ] **步骤 2：Commit**

```bash
git add src/components/ImageTaskPreview.tsx
git commit -m "chore: ImageTaskPreview 文案 'AI' → '模型'"
```

---

### 任务 11：端到端验证

- [ ] **步骤 1：启动后端**

```bash
cd task_scorer && python -m server.app
```
预期：服务启动在 `0.0.0.0:8001`，模型加载成功

- [ ] **步骤 2：启动前端**

新终端：
```bash
npm run dev
```
预期：开发服务器启动，页面显示"后端已连接"

- [ ] **步骤 3：测试单机模式**

1. 输入任务标题，点击「模型分析并添加」
2. 验证任务出现在四象限图和任务列表中
3. 刷新页面验证 localStorage 持久化

- [ ] **步骤 4：测试协作模式**

1. 在 CollaborationPanel 中输入组 ID、密码、昵称，点击加入
2. 开第二个浏览器 tab，同样加入
3. 在 tab A 添加任务 → 验证 tab B 实时显示
4. tab A 删除/完成/拖动任务 → 验证 tab B 同步
5. 关闭 tab A → 验证 tab B 显示成员离线

- [ ] **步骤 5：运行 TypeScript 编译检查**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 6：Commit（如有修改）**
