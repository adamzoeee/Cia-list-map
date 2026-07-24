# 云端协作 + 全栈重构 设计规格

> 日期：2025-07-17  
> 话题：协作模式、WebSocket 通信、后端统一网关、前端瘦身

---

## 1. 目标

将当前「纯前端 + 外部 AI API」架构重构为「瘦前端 + 胖后端」，同时引入实时协作能力：

1. **前端不再直接调用任何外部 API**——所有操作（任务 CRUD、AI 分析、协作）通过一条 WebSocket 连接完成
2. **AI 分析使用自研 MacBERT 模型**（已训练好的 `TaskScorer`），不再依赖 DeepSeek 等外部服务
3. **支持多用户实时协作**——通过组 ID + 密码加入同一个协作组，共享任务列表

---

## 2. 架构总览

```
┌──────────┐  WebSocket   ┌──────────────────────┐
│  前端 A   │◄────────────►│      FastAPI 后端      │
│ (React)  │   JSON 消息   │                      │
└──────────┘              │  ┌────────────────┐  │
                          │  │ TaskScorer      │  │
┌──────────┐              │  │ (MacBERT 双头)   │  │
│  前端 B   │◄────────────►│  │ urgency/import  │  │
│ (React)  │              │  └────────────────┘  │
└──────────┘              │  ┌────────────────┐  │
                          │  │ GroupManager    │  │
                          │  │ 组管理+持久化    │  │
                          │  └────────────────┘  │
                          └──────────────────────┘
```

- **单 WebSocket 连接**：前端建立一条 `/ws` 连接，所有请求/响应/广播走此通道
- **后端一体**：FastAPI 同时承担 HTTP（健康检查、静态文件）、WebSocket（实时通信）、模型推理（MacBERT）

---

## 3. WebSocket 消息协议

### 3.1 消息信封

所有消息均为 JSON，必含 `type` 字段：

```json
{
  "type": "消息类型",
  "payload": { }
}
```

实际传输时 `payload` 字段提升至顶层以减少嵌套（见各消息定义）。

### 3.2 协作认证

| 消息 | 方向 | 字段 |
|------|------|------|
| `auth` | C→S | `{type:"auth", group_id, password, nickname}` |
| `auth_ok` | S→C | `{type:"auth_ok", tasks:[], members:[], group_id}` |
| `auth_fail` | S→C | `{type:"auth_fail", reason:"密码错误"}` |

- 组不存在时自动创建（首次 `auth` 即创建组，密码即设定的组密码）
- 后续加入需匹配密码
- `members` 为 `[{nickname, online}]` 数组

### 3.3 任务操作（均需已认证）

| 消息 | 方向 | 字段 | 行为 |
|------|------|------|------|
| `task_add` | C→S | `{type:"task_add", title, description}` | 服务端调模型评分 → 广播 `task_added` |
| `task_added` | S→C | `{type:"task_added", task:{id,title,description,urgency,importance,quadrant,completed,createdBy,createdAt}}` | 全组广播 |
| `task_update` | C→S | `{type:"task_update", task_id, urgency?, importance?}` | 广播 `task_updated` |
| `task_updated` | S→C | 同上 + 完整 task 对象 | 全组广播 |
| `task_delete` | C→S | `{type:"task_delete", task_id}` | 广播 `task_deleted` |
| `task_deleted` | S→C | `{type:"task_deleted", task_id}` | 全组广播 |
| `task_toggle` | C→S | `{type:"task_toggle", task_id}` | 切换 completed → 广播 `task_toggled` |
| `task_toggled` | S→C | `{type:"task_toggled", task_id, completed}` | 全组广播 |

### 3.4 协作事件

| 消息 | 方向 | 说明 |
|------|------|------|
| `member_join` | S→C | `{type:"member_join", nickname}` |
| `member_leave` | S→C | `{type:"member_leave", nickname}` |
| `members_list` | S→C | `{type:"members_list", members:[{nickname,online}]}` |

### 3.5 单机模式（未加入组时）

前端未加入组时仍可通过 WebSocket 发送任务分析请求，但任务只存 localStorage，不走协作：

| 消息 | 方向 | 字段 |
|------|------|------|
| `analyze_text` | C→S | `{type:"analyze_text", title, description}` |
| `analyze_result` | S→C | `{type:"analyze_result", task:{title,description,urgency,importance,suggestion}}` |
| `analyze_batch` | C→S | `{type:"analyze_batch", texts:[{title,description}]}` |
| `analyze_batch_result` | S→C | `{type:"analyze_batch_result", tasks:[{title,description,urgency,importance}]}` |
| `error` | S→C | `{type:"error", message}` |

---

## 4. 前端改动

### 4.1 文件级变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/api/deepseek.ts` | **删除** | 不再直连外部 AI |
| `src/components/ApiKeyInput.tsx` | **删除** | API Key 不需前端管理 |
| `src/api/websocket.ts` | **新增** | WebSocket 连接管理 + 消息收发封装 |
| `src/components/CollaborationPanel.tsx` | **新增** | 协作面板（加入/离开组、成员列表） |
| `src/App.tsx` | **修改** | 集成 WebSocket、移除 API Key 逻辑 |
| `src/components/TaskInputForm.tsx` | **修改** | 提交走 WebSocket 而非直接调 AI |
| `src/types.ts` | **修改** | 新增 WebSocket 消息类型 |

### 4.2 WebSocket 客户端 (`src/api/websocket.ts`)

```typescript
// 核心职责：
// 1. 建立/重连 WebSocket 连接
// 2. send(type, payload) → 发送消息
// 3. on(type, handler) → 注册消息处理器
// 4. 连接状态管理（connecting / connected / disconnected）
// 5. 断线自动重连（指数退避，max 30s）
```

### 4.3 CollaborationPanel 组件

放在左侧栏 `<ActionPanel>` 下方。

**未加入态**：
- 组 ID 输入框
- 密码输入框
- 昵称输入框
- 「加入/创建协作组」按钮
- 错误提示（密码错误等）

**已加入态**：
- 组名显示 + 在线人数
- 成员列表（自己标注"我"）
- 在线状态指示灯
- 「离开组」按钮

### 4.4 App.tsx 状态变化

- **移除**：`hasKey`、`lastOcrText`（key 不再需要）、`analyzeTask`/`analyzeOcrText` 直接调用
- **新增**：`wsConnected`、`collabState: {group_id, nickname, members, isJoined}`
- **数据源切换**：未加入组 → localStorage；已加入组 → WebSocket 同步的服务端数据
- **OCR 流程不变**：Tesseract.js 仍在浏览器端运行，提取文本后通过 WebSocket 发 `analyze_batch`

---

## 5. 后端改动

### 5.1 文件结构

```
task_scorer/server/
├── app.py              # 现有 FastAPI + 新增 WebSocket 端点
├── group_manager.py    # 协作组生命周期管理
├── data/
│   └── groups/         # {group_id}.json 持久化文件
│       ├── my-team.json
│       └── ...
```

不新增依赖——`websockets` 在 FastAPI/uvicorn 中已内置，JSON 存储用标准库 `json`。

### 5.2 WebSocket 端点 (`/ws`)

```
GET /ws → WebSocket 升级
 ├── 鉴权阶段：等待 auth 消息
 │    ├── 组不存在 → 创建组（密码哈希 + 空任务列表）
 │    ├── 密码错误 → auth_fail
 │    └── 密码正确 → auth_ok（返回全量任务 + 成员列表）
 └── 消息循环：
      ├── task_add → 模型评分 → 持久化 → 全组广播
      ├── task_update / task_delete / task_toggle → 持久化 → 广播
      ├── analyze_text → 模型评分 → 单播返回
      ├── analyze_batch → 批量评分 → 单播返回
      └── 连接断开 → 标记离线 → member_leave 广播
```

### 5.3 GroupManager

```python
class GroupManager:
    """管理所有协作组"""
    
    def get_or_create(group_id, password) -> Group  # 创建/获取组
    def get(group_id) -> Group | None               # 获取已有组
    def save(group) -> None                          # 持久化到 JSON
    
class Group:
    group_id: str
    password_hash: str
    tasks: list[TaskDict]
    connections: dict[nickname, WebSocket]  # 在线连接
    all_members: set[str]                   # 历史成员
    
    def add_member(nickname, ws) -> None
    def remove_member(nickname) -> None
    def add_task(title, description) -> TaskDict
    def update_task(task_id, updates) -> TaskDict
    def delete_task(task_id) -> None
    def toggle_task(task_id) -> bool
    def to_json() -> dict                    # 序列化
```

### 5.4 密码处理

- `password_hash = hashlib.sha256(password.encode()).hexdigest()`
- 创建组时保存哈希，后续鉴权比哈希
- JSON 文件中 **不存明文密码**

### 5.5 模型推理复用

`analyze_text` 和 `task_add` 均调用现有的 `/predict` 逻辑（`model.predict`），不重复实现。将推理逻辑提取为 `predict_single(text: str) -> PredictionOutput` 内部函数，HTTP 端点和 WebSocket 端点共享。

---

## 6. 数据流

### 6.1 单机模式（未加入组）

```
用户输入任务 → 前端 ws.send('analyze_text', {title, desc})
            → 后端模型评分
            → 前端 ws.on('analyze_result', task)
            → 前端存 localStorage + 渲染
```

### 6.2 协作模式（已加入组）

```
用户A添加任务 → ws.send('task_add', {title, desc})
             → 后端模型评分 + 持久化
             → 广播 task_added 给 A + B + C ...
             → 所有前端更新渲染
```

### 6.3 OCR 批量模式

MacBERT 模型只能评分，不能做文本拆分。OCR 原始文本的拆分在前端完成：

```
用户上传图片 → 前端 Tesseract OCR（本地）得到原始文本
            → 前端按行拆分（每非空行 = 一个任务标题）
            → ws.send('analyze_batch', {texts: [{title:"行1", description:""}, ...]})
            → 后端批量评分
            → ws.on('analyze_batch_result', tasks)
            → ImageTaskPreview 展示（用户可编辑标题/描述后确认）
            → 用户确认 → ws.send('task_add', ...) × N
```

- **拆分策略**：按 `\n` 分割，过滤空行和纯标点行，每行作为 `title`，`description` 留空
- **用户可在预览中编辑**（现有 ImageTaskPreview 已支持）
- 若需智能拆分（如识别"1. xxx 2. xxx"格式），在前端做简单正则预处理

---

## 7. 错误处理

| 场景 | 处理 |
|------|------|
| WebSocket 连接失败 | 前端显示 disconnected 状态，自动重连（1s/2s/4s/8s/16s/30s 封顶） |
| 认证失败 | 前端显示错误提示，保持未加入态 |
| 模型推理失败 | 返回 `error` 消息，前端 toast 提示 |
| 重复昵称 | 拒绝加入，提示"昵称已被使用" |
| 组 JSON 损坏 | 记录日志，返回空列表 |

## 8. 不在此次范围

- 语音输入、PWA（Roadmap 已有，不做）
- 任务历史/趋势分析
- 权限角色（管理员/成员）
- TLS/WSS 加密（部署层解决）
- OCR 文本修正/编辑

---

## 9. 测试策略

| 层级 | 内容 |
|------|------|
| 后端单元测试 | GroupManager CRUD、密码鉴权、并发加入 |
| 后端集成测试 | WebSocket 端点：auth → task_add → task_toggle 全流程 |
| 前端 | 现有组件兼容性（TaskInputForm/QuadrantChart/TaskList 不改 UI，只换数据源） |

---

## 10. 迁移与兼容

- `localStorage` 中现有任务数据格式不变，单机模式下继续可用
- 用户首次打开新版本：默认单机模式，现有任务完整保留
- 加入协作组后：localStorage 任务保留但不显示（可后续加导入功能）
