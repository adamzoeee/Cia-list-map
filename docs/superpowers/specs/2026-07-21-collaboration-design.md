# 云端协作功能设计规格

> 日期：2026-07-21  
> 状态：待审查  
> 关联：Cia-list-map（千列万表·优先级矩阵）

---

## 1. 目标

为 Cia-list-map 添加云端协作能力，实现**共享任务池模式**：团队成员共用同一个艾森豪威尔矩阵，添加、认领、完成任务时，所有在线成员准实时同步。

---

## 2. 核心决策

| 决策项 | 选择 |
|--------|------|
| 协作模式 | 共享任务池 —— 同一团队共用任务列表，各自认领执行 |
| 后端方案 | 轻量自托管 —— 扩展现有 `task_scorer` FastAPI 服务（端口 8001） |
| 数据库 | SQLite 单文件，零配置部署 |
| 认证方式 | 极简邀请码 —— 团队由 6 位 invite_code 标识，知道即可加入 |
| 实时同步 | WebSocket 事件广播 + 全量快照兜底 |
| 并发控制 | 乐观锁（task.version 字段） |

---

## 3. 架构概览

```
┌─────────────────────────────────────────────────────┐
│  前端 (React 19 + Vite)                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │ TeamPanel │  │ 现有组件  │  │ useCollaboration  │ │
│  │ 创建/加入 │  │ (矩阵/   │  │ (WebSocket hook)  │ │
│  │ 在线成员  │  │  列表等) │  │                   │ │
│  └──────────┘  └──────────┘  └───────────────────┘ │
│                       │ WebSocket + HTTP             │
└───────────────────────┼─────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────┐
│  后端 (FastAPI :8001)  │                             │
│  ┌────────────────────┴──────────────────────────┐  │
│  │  现有 API          新增 API                    │  │
│  │  /predict          POST /api/teams             │  │
│  │  /predict_batch    POST /api/teams/join        │  │
│  │  /health           GET/DELETE /api/teams/{id}  │  │
│  │                    CRUD /api/teams/{id}/tasks   │  │
│  │                    WS  /ws/{invite_code}        │  │
│  └───────────────────────────────────────────────┘  │
│                       │                             │
│              ┌────────┴────────┐                    │
│              │  SQLite 单文件   │                    │
│              │  (teams, tasks,  │                    │
│              │   members 表)    │                    │
│              └─────────────────┘                    │
└─────────────────────────────────────────────────────┘
```

### 数据流

1. **创建团队** → 后端生成 6 位 invite_code，返回给创建者
2. **加入团队** → 输入 invite_code → 拉取全量任务快照 → 建立 WebSocket
3. **任务操作** → 前端发 HTTP → 后端写 SQLite → 广播 WebSocket 事件给同队在线成员
4. **重连** → 先拉全量快照兜底，再接收增量事件

### 用户身份

前端首次访问自动生成 `user_id`（UUID）+ 设置昵称，存 localStorage，无需注册。

---

## 4. 数据模型

### 4.1 数据库表（SQLite）

```sql
CREATE TABLE teams (
    id          TEXT PRIMARY KEY,          -- UUID
    name        TEXT NOT NULL,             -- 团队名称
    invite_code TEXT NOT NULL UNIQUE,      -- 6位邀请码（大写字母+数字）
    created_by  TEXT NOT NULL,             -- 创建者 user_id
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE members (
    id        TEXT PRIMARY KEY,            -- UUID
    team_id   TEXT NOT NULL REFERENCES teams(id),
    user_id   TEXT NOT NULL,               -- 前端生成的 user_id
    nickname  TEXT NOT NULL DEFAULT '',    -- 成员昵称
    role      TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(team_id, user_id)
);

CREATE TABLE tasks (
    id           TEXT PRIMARY KEY,         -- UUID
    team_id      TEXT NOT NULL REFERENCES teams(id),
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    urgency      REAL NOT NULL DEFAULT 0,  -- -5 ~ 5
    importance   REAL NOT NULL DEFAULT 0,  -- -5 ~ 5
    quadrant     INTEGER NOT NULL DEFAULT 1,
    completed    INTEGER NOT NULL DEFAULT 0,
    created_by   TEXT NOT NULL,            -- 创建者 user_id
    assigned_to  TEXT,                     -- 认领者 user_id（NULL=未认领）
    version      INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tasks_team ON tasks(team_id);
```

### 4.2 TypeScript 类型扩展

```typescript
// 新增
interface Team {
  id: string;
  name: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
}

interface Member {
  id: string;
  teamId: string;
  userId: string;
  nickname: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

interface UserProfile {
  userId: string;   // 自动生成 UUID
  nickname: string;
}

// Task 扩展字段
interface Task {
  // ...现有: id, title, description, urgency, importance, quadrant, completed, createdAt
  createdBy: string;    // user_id
  assignedTo?: string;  // user_id，未认领为 null
  updatedAt: string;
  version: number;
}
```

---

## 5. API 设计

### 5.1 团队

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| `POST` | `/api/teams` | 创建团队 | `{ name, creatorUserId, creatorNickname }` → `Team + inviteCode` |
| `POST` | `/api/teams/join` | 加入团队 | `{ inviteCode, userId, nickname }` → `Team + tasks[]` |
| `GET` | `/api/teams/{teamId}` | 获取团队信息 | — |
| `DELETE` | `/api/teams/{teamId}` | 解散团队（仅 owner） | `{ userId }` |
| `GET` | `/api/teams/{teamId}/members` | 成员列表 | — |

### 5.2 任务

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/teams/{teamId}/tasks` | 拉取全量任务快照 |
| `POST` | `/api/teams/{teamId}/tasks` | 创建任务 → 广播 `task_created` |
| `PUT` | `/api/teams/{teamId}/tasks/{taskId}` | 更新任务（含认领/完成）→ 广播 `task_updated` |
| `DELETE` | `/api/teams/{teamId}/tasks/{taskId}` | 删除任务 → 广播 `task_deleted` |

- 所有写操作需带 `userId` + `version`（乐观锁校验）

### 5.3 WebSocket

| 路径 | 说明 |
|------|------|
| `WS /ws/{invite_code}` | 建立连接，加入该团队广播房间 |

**服务端 → 客户端消息格式：**

```json
{
  "type": "task_created | task_updated | task_deleted | member_joined | member_left",
  "payload": { /* task 或 member 对象 */ },
  "timestamp": "2026-01-01T00:00:00Z"
}
```

### 5.4 降级策略

- WebSocket 断开时前端自动重连（指数退避：1s → 2s → 4s → ... → 最大 30s）
- 重连成功后先 `GET /api/teams/{teamId}/tasks` 拉全量快照，保证一致性

---

## 6. 前端组件调整

### 6.1 新增组件

| 组件 | 职责 |
|------|------|
| `TeamPanel` | 创建 / 加入团队、显示在线成员列表、复制邀请码 |
| `TeamSetup` | 首次使用向导：设置昵称 → 创建或加入团队 |
| `NicknameBadge` | 任务卡片上显示 created_by / assigned_to 昵称 |

### 6.2 修改现有组件

| 组件 | 变更 |
|------|------|
| `App.tsx` | 新增 `currentUser`、`team`、`members`、`wsConnected` 状态；本地模式 / 协作模式切换 |
| `TaskCard.tsx` | 显示创建者和认领者昵称；添加「认领」按钮 |
| `TaskInputForm.tsx` | 提交走 HTTP API 创建任务（协作模式下） |
| `QuadrantChart.tsx` | 数据源从 localStorage 改为 tasks 状态（协作层驱动） |

### 6.3 新增 Hook

**`useCollaboration(teamId: string)`**：
- 管理 WebSocket 连接生命周期
- 监听事件 → 增量更新本地 `tasks` 状态
- 暴露 `createTask / updateTask / deleteTask / claimTask` 方法
- 断线自动重连 + 全量快照兜底

---

## 7. 错误处理

| 场景 | HTTP 状态 | 处理 |
|------|-----------|------|
| 邀请码不存在 | 404 | 前端提示「团队不存在」 |
| 乐观锁冲突 | 409 | 前端提示「数据已被他人修改，已刷新」→ 自动拉取最新版本 |
| 非 owner 解散团队 | 403 | 前端提示「仅创建者可解散团队」 |
| 重复加入同一团队 | 409 | 前端提示「你已在该团队中」 |
| WebSocket 断线 | — | 自动重连，重连后拉全量快照 |
| 并发创建任务 | — | 各自成功，无冲突（创建操作幂等独立） |

---

## 8. 与现有功能的共存

- **本地模式**：未加入团队时，行为和现在完全一致（localStorage 持久化）
- **协作模式**：加入团队后，任务数据以服务端为准，localStorage 本地缓存作为离线参考
- **评分功能**：`/predict` 和 `/predict_batch` 保持不变，前端在创建任务前仍然调用评分 API
- **OCR 功能**：保持不变，OCR 在前端本地完成
- **API Key 配置**：仅本地存储，不同步到团队
