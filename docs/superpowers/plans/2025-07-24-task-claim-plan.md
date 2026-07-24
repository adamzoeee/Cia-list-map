# 认领任务功能 实现计划

> **面向 AI 代理的工作者：** 必需技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为协作模式添加多人认领任务功能——成员可认领/取消认领，非独占，实时广播。

**架构：** Task 新增 `assignees: string[]` 字段；WebSocket 新增 `task_assign`/`task_assigned` 消息对；Group 类新增 `assign_task` 方法；TaskCard 展开区新增认领 UI（仅在协作模式显示）。

**技术栈：** React 19 + TypeScript / FastAPI + WebSocket / Python dataclass

---

### 任务 1：类型定义更新

**文件：**
- 修改：`src/types.ts`

- [ ] **步骤 1：Task 加 assignees，消息类型加 task_assign/task_assigned**

```ts
// Task interface 新增
export interface Task {
  // ... 现有字段保持不变 ...
  assignees?: string[];  // 认领人昵称列表（协作模式）
}

// WsMessageType 新增两个值
export type WsMessageType =
  | // ... 现有值保持 ...
  | 'task_assign' | 'task_assigned'
  | 'error';
```

- [ ] **步骤 2：验证 TypeScript 编译**

运行：`npx tsc --noEmit`
预期：无新增错误

---

### 任务 2：后端 GroupManager 添加认领方法

**文件：**
- 修改：`task_scorer/server/group_manager.py`

- [ ] **步骤 1：Group 类添加 assign_task 方法**

```python
def assign_task(self, task_id: str, nickname: str, action: str) -> Optional[dict]:
    """
    claim: 将 nickname 加入 assignees（去重）
    unclaim: 将 nickname 从 assignees 移除
    返回更新后的任务，如果任务不存在返回 None
    """
    for t in self.tasks:
        if t["id"] == task_id:
            assignees: list = t.get("assignees", [])
            if action == "claim":
                if nickname not in assignees:
                    assignees.append(nickname)
            elif action == "unclaim":
                if nickname in assignees:
                    assignees.remove(nickname)
            t["assignees"] = assignees
            return t
    return None
```

- [ ] **步骤 2：检查语法**

运行：`python -m py_compile task_scorer/server/group_manager.py`
预期：无输出（编译成功）

---

### 任务 3：后端 WebSocket 处理 task_assign

**文件：**
- 修改：`task_scorer/server/app.py`

- [ ] **步骤 1：在 task_add 中初始化 assignees 为空数组**

在 `task_add` 处理中，task 字典新增 `"assignees": []`：

```python
task = {
    # ... 现有字段 ...
    "assignees": [],
    "createdBy": nickname,
    "createdAt": time_module.strftime("%Y-%m-%dT%H:%M:%S"),
}
```

- [ ] **步骤 2：在 task_toggle 之后添加 task_assign 处理**

```python
if msg_type == "task_assign":
    task_id = data.get("task_id", "")
    action = data.get("action", "")
    if action not in ("claim", "unclaim"):
        await ws.send_json({"type": "error", "message": "action 必须为 claim 或 unclaim"})
        continue
    result = group.assign_task(task_id, nickname, action)
    if result is None:
        await ws.send_json({"type": "error", "message": "任务不存在"})
        continue
    group_manager.save_group(group)
    await ws.send_json({
        "type": "task_assigned",
        "task_id": task_id,
        "assignees": result["assignees"],
        "by": nickname,
    })
    await group.broadcast({
        "type": "task_assigned",
        "task_id": task_id,
        "assignees": result["assignees"],
        "by": nickname,
    }, exclude=nickname)
    continue
```

注意：先回发给操作者自己，再广播给其他人（exclude=nickname）。前端 App.tsx 需要两个地方都能收到。

- [ ] **步骤 3：检查语法**

运行：`python -m py_compile task_scorer/server/app.py`
预期：无输出

---

### 任务 4：TaskCard 添加认领 UI

**文件：**
- 修改：`src/components/TaskCard.tsx`

- [ ] **步骤 1：扩展 Props，添加认领相关属性**

```ts
interface Props {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onToggleComplete: () => void;
  onUpdateUrgency: (v: number) => void;
  onUpdateImportance: (v: number) => void;
  // 认领相关 — 仅在协作模式传入
  onAssign?: (action: 'claim' | 'unclaim') => void;
  collabNickname?: string;
  isCollab?: boolean;
}
```

解构新增：

```ts
onAssign,
collabNickname = '',
isCollab = false,
```

- [ ] **步骤 2：在展开区域 U/I slider 下方添加认领区域**

在 `{isSelected && (` 块中，U/I grid 之后、`</div>` 闭合之前添加：

```tsx
{/* 认领区域 — 仅协作模式 */}
{isCollab && (
  <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-2">
      <span>认领人</span>
    </div>
    <div className="flex flex-wrap items-center gap-1.5">
      {(task.assignees || []).map(name => (
        <span
          key={name}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px]',
            name === collabNickname
              ? 'bg-cyan-400/10 text-cyan-300 border border-cyan-400/20'
              : 'bg-white/3 text-slate-400 border border-white/5',
          )}
        >
          {name}
          {name === collabNickname && (
            <button
              onClick={(e) => { e.stopPropagation(); onAssign?.('unclaim'); }}
              className="ml-0.5 text-slate-500 hover:text-red-300 transition-colors"
              title="取消认领"
            >
              ✕
            </button>
          )}
        </span>
      ))}
      {!(task.assignees || []).includes(collabNickname) && (
        <button
          onClick={(e) => { e.stopPropagation(); onAssign?.('claim'); }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] bg-white/3 text-slate-400 border border-white/5 hover:border-cyan-400/20 hover:text-cyan-300 transition-all"
        >
          🙋 认领任务
        </button>
      )}
    </div>
  </div>
)}
```

- [ ] **步骤 3：验证 TypeScript 编译**

运行：`npx tsc --noEmit`
预期：无新增错误

---

### 任务 5：TaskList 传递认领 props

**文件：**
- 修改：`src/components/TaskList.tsx`

- [ ] **步骤 1：扩展 Props**

```ts
interface Props {
  // ... 现有 ...
  onAssign?: (taskId: string, action: 'claim' | 'unclaim') => void;
  collabNickname?: string;
  isCollab?: boolean;
}
```

解构：

```ts
onAssign,
collabNickname = '',
isCollab = false,
```

- [ ] **步骤 2：传递给 TaskCard**

```tsx
<TaskCard
  task={task}
  isSelected={task.id === selectedTaskId}
  onClick={() => onTaskClick(task)}
  onDelete={() => onTaskDelete(task.id)}
  onToggleComplete={() => onToggleComplete(task.id)}
  onUpdateUrgency={(v) => onUpdateTask(task.id, { urgency: v })}
  onUpdateImportance={(v) => onUpdateTask(task.id, { importance: v })}
  onAssign={onAssign ? (action) => onAssign(task.id, action) : undefined}
  collabNickname={collabNickname}
  isCollab={isCollab}
/>
```

- [ ] **步骤 3：验证 TypeScript 编译**

运行：`npx tsc --noEmit`
预期：无新增错误

---

### 任务 6：App.tsx 连接认领逻辑

**文件：**
- 修改：`src/App.tsx`

- [ ] **步骤 1：添加 task_assigned 消息监听**

在协作文消息处理区域（`task_toggled` 之后）添加：

```tsx
const unsub8 = wsClient.on('task_assigned', (msg: WsMessage) => {
  const tid = msg.task_id as string;
  const assignees = msg.assignees as string[];
  setTasks(prev => prev.map(t => t.id === tid ? { ...t, assignees } : t));
});
```

并在 cleanup 中取消订阅：

```tsx
// return () => { ... unsub7(); unsub8(); };
```

- [ ] **步骤 2：添加 handleAssign 回调**

```tsx
const handleAssign = useCallback((taskId: string, action: 'claim' | 'unclaim') => {
  if (!collabState.isJoined) return;
  wsClient.send({ type: 'task_assign', task_id: taskId, action } as WsMessage);
}, [collabState.isJoined]);
```

- [ ] **步骤 3：传递给 TaskList**

```tsx
<TaskList
  tasks={tasks}
  selectedTaskId={selectedTaskId}
  onTaskClick={handleTaskClick}
  onTaskDelete={handleTaskDelete}
  onToggleComplete={handleToggleComplete}
  onUpdateTask={handleUpdateTask}
  onAssign={handleAssign}
  collabNickname={collabState.nickname}
  isCollab={collabState.isJoined}
/>
```

- [ ] **步骤 4：handleCollabTasksReceived 兼容旧数据**

```tsx
const parsed: Task[] = serverTasks.map(t => ({
  // ... 现有 ...
  assignees: (t.assignees as string[]) || [],
}));
```

- [ ] **步骤 5：验证 TypeScript 编译**

运行：`npx tsc --noEmit`
预期：无新增错误

---

### 任务 7：端到端验证

- [ ] **步骤 1：启动后端**

运行：`cd task_scorer && python -m server.app`
预期：服务启动在 :8001

- [ ] **步骤 2：启动前端**

运行：`npm run dev`
预期：开发服务器启动在 :5173

- [ ] **步骤 3：手动测试**

1. 打开两个浏览器窗口，分别加入同一协作组（不同昵称）
2. 窗口A添加一个任务
3. 窗口A展开任务 → 点击「认领任务」→ 确认标签显示
4. 窗口B展开同一任务 → 应看到A的认领标签（无✕）
5. 窗口B也认领 → 应看到两个标签
6. 窗口A取消认领 → 标签消失
7. 确认任务列表和四象限图中认领状态同步
