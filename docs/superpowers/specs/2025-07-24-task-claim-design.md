# 认领任务功能设计

**日期**: 2025-07-24  
**状态**: 已批准

## 概述

为协作模式添加任务认领功能。成员可以认领任务表示参与，支持多人同时认领同一个任务，可取消自己的认领。

## 数据模型

### Task 新增字段

```ts
assignees: string[]  // 认领人昵称列表
```

### WebSocket 消息

```ts
// C→S
{ type: "task_assign", task_id: string, action: "claim" | "unclaim" }

// S→C (广播)
{ type: "task_assigned", task_id: string, assignees: string[], by: string }
```

## UI 设计

TaskCard 展开区域，U/I slider 下方，仅在协作模式显示：

- 已认领成员列表：昵称标签（自己的带 ✕ 取消按钮）
- 认领按钮：自己未认领时显示「🙋 认领任务」

## 后端逻辑

- claim：昵称加入 assignees 去重
- unclaim：昵称从 assignees 移除
- 操作后广播 task_assigned，持久化到组 JSON

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/types.ts` | Task 加 assignees，新增 task_assign/task_assigned |
| `src/components/TaskCard.tsx` | 展开区加认领区域 |
| `src/components/TaskList.tsx` | 传递认领回调 |
| `src/App.tsx` | handleAssign + task_assigned 监听 |
| `task_scorer/server/group_manager.py` | assign 方法 |
| `task_scorer/server/app.py` | WebSocket 处理 task_assign |
