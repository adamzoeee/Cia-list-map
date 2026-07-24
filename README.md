# 优先级矩阵 · Priority Matrix

> **AI 驱动的四象限任务管理 —— 输入即分类，聚焦真正重要的事。**

基于 **艾森豪威尔矩阵** 的智能任务管理工具。React + TypeScript 前端，**MacBERT 自训练模型**后端评分，WebSocket 实时通信，支持**多人协作**与**任务认领**。内置浏览器端 OCR，截图/手写待办一键导入。

🔗 在线体验：[adamzoeee.github.io/Cia-list-map](https://adamzoeee.github.io/Cia-list-map/)

---

## 目录

- [为什么是四象限](#为什么是四象限)
- [核心能力](#核心能力)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [API 接口](#api-接口)
- [协作模式](#协作模式)
- [MacBERT 评分模型](#macbert-评分模型)
- [设计系统](#设计系统)
- [算法说明](#算法说明)
- [许可证](#许可证)

---

## 为什么是四象限

艾森豪威尔矩阵将任务沿 **紧迫度** 与 **重要性** 两个独立维度划分为四个象限：

| 象限 | 特征 | 策略 |
|------|------|------|
| **Q1 · 重要且紧急** | 危机、截止日期驱动 | **立即去做** |
| **Q2 · 重要不紧急** | 规划、能力建设、深度工作 | **计划去做** |
| **Q3 · 不重要不紧急** | 消遣、琐事 | **减少或消除** |
| **Q4 · 紧急不重要** | 干扰、可代理事务 | **委派或压缩** |

传统用法依赖主观判断——人倾向高估琐事紧迫性而低估深度工作价值。本项目用专用 **MacBERT 双头回归模型** 替代主观打分，以 -5 ~ +5 连续频谱给出客观评分，同时消除手动分类的摩擦。

---

## 核心能力

**智能评分** — 输入标题和描述，MacBERT 模型瞬间返回紧迫度、重要性、象限归类及行动建议。评分一致、响应快速，无需依赖外部 LLM API。

**图片 OCR 批量导入** — 支持拖拽、点击上传、Ctrl+V 粘贴截图。Canvas 客户端压缩后由 Tesseract.js 本地 OCR（中英文），图片不离开设备。识别结果在模态框中预览编辑，批量确认添加。

**四象限可视化** — 纯 SVG 散点图，四象限背景色区分 + 虚线分割。任务卡片带 Motion spring 入场动画，自动识别"今天""DDL""本周"等时间关键词。响应式自适应：任务多时自动缩小卡片。

**任务管理** — 按 U+I 总分降序排列，已完成自动沉底。展开卡片可拖拽 slider 微调评分，实时联动象限。已完成/未完成视觉分隔。

**执行建议** — 按 Q1→Q2→Q4→Q3 优先级排序 Top 5 待办，附带策略建议和随机励志语。

**多人实时协作** — WebSocket 实时通信，创建/加入协作组，密码认证。成员在线状态可见，任务增删改完成状态实时广播。**支持多人认领同一任务**，非独占、可取消，认领变更即时同步全组。

---

## 技术架构

```
┌──────────────────────────────────────────────────────────┐
│                       Browser                             │
│  React UI (SVG + Motion)  ←→  Tesseract OCR (local)      │
│  WebSocket Client (auto-reconnect)  ←→  localStorage     │
└──────────────────────┬───────────────────────────────────┘
                       │ ws://host:8001/ws
                       ▼
┌──────────────────────────────────────────────────────────┐
│                 FastAPI Server (:8001)                    │
│  /predict · /predict_batch   │  WebSocket Handler        │
│  MacBERT TaskScorer          │  GroupManager (协作组)     │
│  双头回归: urgency+importance│  JSON 持久化 + 广播        │
└──────────────────────────────────────────────────────────┘
```

| 层 | 技术 | 
|----|------|
| 前端框架 | React 19 + TypeScript |
| 构建 | Vite 6 + Tailwind CSS 4 |
| 动画 | Motion (Framer Motion) |
| OCR | Tesseract.js 5（中英文） |
| 通信 | 原生 WebSocket（指数退避自动重连） |
| 后端 | FastAPI + Python |
| ML | MacBERT-base (hfl/chinese-macbert-base) + PyTorch |
| 部署 | GitHub Actions → GitHub Pages |

---

## 项目结构

```
├── src/                              # 前端
│   ├── App.tsx                       # 根组件 — 全局状态 & 业务逻辑
│   ├── types.ts                      # TypeScript 类型定义
│   ├── index.css                     # Dark Neumorphism 设计系统
│   ├── api/
│   │   ├── websocket.ts              # WebSocket 客户端（自动重连）
│   │   └── ocr.ts                    # Tesseract.js OCR 封装
│   └── components/
│       ├── ui.tsx                    # 设计系统组件（Panel/Button/Input/Badge）
│       ├── TaskInputForm.tsx         # 输入表单（文字/图片双模式）
│       ├── QuadrantChart.tsx         # SVG 四象限散点图
│       ├── TaskCard.tsx              # 任务卡片（展开编辑 + 认领）
│       ├── TaskList.tsx              # 任务列表（排序 + 分隔线）
│       ├── ActionPanel.tsx           # 执行建议面板
│       ├── CollaborationPanel.tsx    # 协作面板（创建/加入组）
│       └── ImageTaskPreview.tsx      # OCR 结果预览模态框
│
├── task_scorer/                      # 后端
│   ├── model/
│   │   ├── model.py                  # MacBERT 双头回归模型
│   │   ├── dataset.py               # PyTorch Dataset
│   │   └── train.py                 # 训练脚本
│   ├── server/
│   │   ├── app.py                   # FastAPI（REST + WebSocket + 协作）
│   │   └── group_manager.py         # 协作组管理（CRUD + 广播）
│   ├── scripts/                     # 数据生成/转换脚本
│   ├── evaluate.py                  # 模型评估
│   ├── checkpoints/best_model/      # 模型权重（需自行训练/下载）
│   └── data/                        # 训练/验证/测试数据
│
└── .github/workflows/deploy.yml     # GitHub Pages 自动部署
```

---

## 快速开始

### 前置条件

- Node.js ≥ 18、npm ≥ 9
- Python ≥ 3.9、PyTorch ≥ 2.4（GPU 推荐）

### 前端

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 生产构建 → dist/
```

### 后端

```bash
cd task_scorer
pip install -r requirements.txt
python -m server.app    # http://localhost:8001
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MODEL_PATH` | `./checkpoints/best_model` | 模型权重路径 |
| `VITE_WS_URL` | `ws://localhost:8001/ws` | WebSocket 地址（构建时注入） |

---

## API 接口

### REST

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/` | API 信息 |
| `GET` | `/health` | 健康检查 |
| `POST` | `/predict` | 单任务评分 |
| `POST` | `/predict_batch` | 批量评分（≤50） |

**`POST /predict` 示例：**

```json
// 请求
{ "title": "准备期末考试", "description": "下周三考试，还没复习完" }

// 响应
{ "title": "准备期末考试", "urgency": 5, "importance": 4, "suggestion": "立即执行，火烧眉毛" }
```

### WebSocket

| 端点 | 说明 |
|------|------|
| `ws://host:8001/ws` | 主连接 |

**单机模式：**
`analyze_text` / `analyze_result` · `analyze_batch` / `analyze_batch_result` · `error`

**协作模式：**
`auth` / `auth_ok` / `auth_fail` · `task_add` / `task_added` · `task_update` / `task_updated` · `task_delete` / `task_deleted` · `task_toggle` / `task_toggled` · `task_assign` / `task_assigned` · `member_join` / `member_leave`

---

## 协作模式

### 加入协作组

在「云端协作」面板输入 **组 ID**、**密码**、**昵称**，点击加入。组不存在则自动创建。密码 SHA-256 加盐哈希存储。

### 任务认领

展开任务卡片 → 认领区域显示已认领成员标签 → 点击 **🙋 认领任务** 认领，点击自己标签旁的 **✕** 取消。多人可同时认领同一任务，变更实时广播全组。

### 持久化

协作组数据以 JSON 存储在 `task_scorer/server/data/groups/`，任务和成员状态自动落盘。

---

## MacBERT 评分模型

```
输入文本 (title + description)
        │
        ▼
  MacBERT-base (hfl/chinese-macbert-base)
        │ [CLS] hidden state (768d)
        ▼
  Shared Hidden (768→128, GELU)
        │
   ┌────┴────┐
   ▼         ▼
Urgency   Importance    各: 128→64→1, tanh×5 → [-5, 5]
```

- **基座**：哈工大中文纠错预训练 MacBERT
- **损失**：Smooth L1 Loss (β=1.0)
- **训练**：人工标注 + 合成数据

```bash
cd task_scorer
# 准备 data/raw/all.json
python -m model.train --data_dir ./data --output_dir ./checkpoints
python evaluate.py --test_data ./data/test.json --model_path ./checkpoints/best_model
```

---

## 设计系统

暗色新拟态（Dark Neumorphism）设计语言，基底 `#111827`，强调色 cyan `#22d3ee`。

| 类名 | 效果 |
|------|------|
| `neu-raised` | 凸起面板 |
| `neu-inset` | 凹陷输入框 |
| `neu-btn` / `neu-btn-accent` | 按钮（raised → pressed 按下） |
| `neu-selected` | 选中发光态 |
| `neu-divider` | 渐变凹槽分隔线 |

响应式：`< lg` 单列堆叠 / `≥ lg` 12 列网格。

---

## 算法说明

```
urgency ≥ 0 ∧ importance ≥ 0 → Q1     urgency < 0 ∧ importance ≥ 0 → Q2
urgency < 0 ∧ importance < 0 → Q3     urgency ≥ 0 ∧ importance < 0 → Q4
```

SVG 映射：`toX = margin + (urgency+5)/10 × plotWidth`，`toY` 同理翻转。

排序：任务列表按 U+I 降序（已完成沉底），执行建议按 Q1→Q2→Q4→Q3 优先级。

---

## 许可证

MIT License · Copyright (c) 2026 Adam Zoeee
