# 优先级矩阵 · Priority Matrix

> **AI 驱动的四象限任务管理 —— 输入即分类，聚焦真正重要的事。**

一个基于 **艾森豪威尔矩阵（Eisenhower Matrix）** 方法论的智能任务管理工具。前端使用 React + TypeScript + Vite 构建，后端基于 **MacBERT 自训练双头回归模型** 进行任务评分，通过 WebSocket 实时通信，支持**多人协作**。同时内置浏览器端 OCR，可将手写/截图中的待办清单一键导入。

---

## 目录

- [科学依据：为什么是四象限](#科学依据为什么是四象限)
- [核心能力](#核心能力)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
  - [前端](#前端)
  - [后端推理服务](#后端推理服务)
- [API 接口](#api-接口)
- [协作模式](#协作模式)
- [MacBERT 评分模型](#macbert-评分模型)
- [设计与交互](#设计与交互)
- [算法说明](#算法说明)
- [项目愿景](#项目愿景)
- [许可证](#许可证)

---

## 科学依据：为什么是四象限

### 艾森豪威尔矩阵

该方法论源自美国第 34 任总统 **德怀特·D·艾森豪威尔** 的时间管理原则，后经史蒂芬·柯维在《高效能人士的七个习惯》中系统化推广：

> "I have two kinds of problems: the urgent and the important. The urgent are not important, and the important are never urgent."

矩阵将任务沿两个独立维度——**紧迫度** 与 **重要性**——划分为四个象限：

| 象限 | 特征 | 策略 |
|------|------|------|
| **Q1 · 重要且紧急** | 危机、截止日期驱动的核心产出 | **立即去做** |
| **Q2 · 重要不紧急** | 长期规划、能力建设、深度工作 | **计划去做** |
| **Q3 · 不重要不紧急** | 消遣、琐事、无意义的时间消耗 | **减少或消除** |
| **Q4 · 紧急不重要** | 干扰、部分会议、可代理的事务 | **委派或压缩** |

### 为什么引入 AI

经典 Eisenhower 矩阵依赖用户**主观判断**，存在两个痛点：

1. **自我认知偏差**：人倾向于高估琐事的紧迫性，而低估深度工作的长期价值；
2. **分类摩擦**：为每个任务手动打分是一种认知负担，阻碍持续使用。

本项目的解决方案是训练一个专用的 **MacBERT 双头回归模型**，以相对客观的尺度对任务进行双维度连续评分（-5 ~ +5），将传统二元分类扩展为**连续频谱**，使散点图上的任务分布具有更细粒度的区分力。

---

## 核心能力

### 1. 智能任务评分
- 输入任务标题 + 可选描述
- 后端 MacBERT 模型返回：紧迫度评分（-5~5）、重要性评分（-5~5）、象限归类、行动建议
- 评分一致性高（模型推理无随机性），响应快速

### 2. 图片 OCR + 批量导入
- 支持 `jpg / png / gif`，**拖拽上传** 与 **Ctrl+V 剪贴板粘贴**
- 上传前 Canvas API 客户端压缩（max 1920px）
- **Tesseract.js** 本地 OCR（`chi_sim + eng` 中英文），图片**不离开用户设备**
- 识别后在模态框中预览、编辑，批量确认添加

### 3. SVG 四象限可视化
- 纯 SVG 渲染散点图，X 轴 = 时间紧迫度，Y 轴 = 任务重要性
- 四个象限以不同背景色标注，虚线分割
- 任务卡片使用 **Motion spring 弹簧动画** 入场/退出
- 时间关键词自动识别（"今天""DDL""本周"等）并标注
- 响应式自适应：任务多时自动缩小卡片

### 4. 任务列表管理
- 按 U+I 总分降序排列，已完成任务自动沉底
- 支持勾选完成、删除、展开拖拽 slider 微调评分
- 已完成/未完成任务视觉分隔

### 5. 执行建议面板
- 按 Q1 → Q2 → Q4 → Q3 优先级排序
- 展示 Top 5 待办及策略建议
- 随机中文励志语

### 6. 多人实时协作 🆕
- WebSocket 实时通信，支持创建/加入协作组
- 组内成员可见在线状态
- 任务增删改完成状态实时广播同步
- 密码认证 + SHA-256 加盐哈希，JSON 文件持久化

---

## 技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│                                                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐                  │
│  │  React   │  │ Tesseract │  │  WebSocket   │                  │
│  │  UI      │  │ OCR       │  │  Client      │                  │
│  │  (SVG +  │  │ (local)   │  │  (reconnect) │                  │
│  │  Motion) │  │           │  │              │                  │
│  └──────────┘  └───────────┘  └──────┬───────┘                  │
│        │              │               │                          │
│        └──────────────┴───────────────┘                          │
│                       │ localStorage                            │
└───────────────────────┼─────────────────────────────────────────┘
                        │ ws://host:8001/ws
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FastAPI Server (:8001)                         │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────────┐  │
│  │  /predict  │  │  WebSocket │  │  GroupManager            │  │
│  │  /predict  │  │  Handler   │  │  - auth/create/join      │  │
│  │  _batch    │  │            │  │  - task CRUD broadcast   │  │
│  └─────┬──────┘  └────────────┘  │  - JSON persistence      │  │
│        │                         └──────────────────────────┘  │
│  ┌─────▼──────┐                                                  │
│  │ MacBERT    │                                                  │
│  │ TaskScorer │  双头回归: urgency + importance                 │
│  └────────────┘                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| **前端框架** | React 19 + TypeScript 5.6 | 函数组件 + Hooks |
| **构建** | Vite 6 | 开发服务器 & 生产打包 |
| **样式** | Tailwind CSS 4 + 自定义 Neumorphism | 暗色拟态设计系统 |
| **动画** | Motion (Framer Motion) | SVG spring 动画 |
| **OCR** | Tesseract.js 5 | 浏览器端中英文识别 |
| **通信** | WebSocket (原生) | 自动重连+指数退避 |
| **后端框架** | FastAPI | Python 异步 Web 框架 |
| **ML 模型** | MacBERT-base (Chinese) | Hugging Face Transformers |
| **深度学习** | PyTorch 2.4+ | 双头回归训练 & 推理 |
| **部署** | GitHub Actions → GitHub Pages | 静态前端自动部署 |

---

## 项目结构

```
Cia-list-map/
├── .github/workflows/deploy.yml     # GitHub Pages 自动部署
├── index.html                       # Vite 入口 HTML
├── package.json                     # 前端依赖 & 脚本
├── tsconfig.json                    # TypeScript 严格模式配置
├── vite.config.ts                   # Vite (React + Tailwind 插件)
│
├── src/                             # 前端源码
│   ├── main.tsx                     # React 挂载入口
│   ├── App.tsx                      # 根组件 — 全局状态 & 业务逻辑
│   ├── types.ts                     # TypeScript 类型定义
│   ├── index.css                    # Tailwind + Dark Neumorphism 设计系统
│   ├── api/
│   │   ├── websocket.ts             # WebSocket 客户端（自动重连）
│   │   └── ocr.ts                   # Tesseract.js OCR 封装
│   └── components/
│       ├── ui.tsx                   # 设计系统组件库（Panel/Button/Input/Badge）
│       ├── TaskInputForm.tsx         # 任务输入（文字/图片双模式+拖拽+粘贴+压缩）
│       ├── QuadrantChart.tsx         # SVG 四象限散点图（Motion 动画）
│       ├── TaskCard.tsx              # 任务卡片（展开编辑 U/I slider）
│       ├── TaskList.tsx              # 任务列表（排序+分隔线+空状态）
│       ├── ActionPanel.tsx           # 执行建议面板（Top 5+励志语）
│       ├── CollaborationPanel.tsx    # 云端协作面板（创建/加入组+在线成员）
│       └── ImageTaskPreview.tsx      # OCR 结果预览模态框
│
├── task_scorer/                     # 后端：评分模型 + 推理服务
│   ├── requirements.txt             # Python 依赖（含 PyTorch）
│   ├── model/
│   │   ├── model.py                 # MacBERT 双头回归模型定义
│   │   ├── dataset.py               # PyTorch Dataset + 数据加载
│   │   └── train.py                 # 训练脚本
│   ├── server/
│   │   ├── app.py                   # FastAPI 服务（REST + WebSocket + 协作）
│   │   └── group_manager.py         # 协作组管理（CRUD + 广播 + 持久化）
│   ├── scripts/
│   │   ├── generate_synthetic.py    # 合成训练数据生成
│   │   ├── generate_q3_data.py      # Q3 象限数据生成
│   │   └── convert_csv_to_json.py   # CSV→JSON 数据转换
│   ├── evaluate.py                  # 模型评估脚本
│   ├── checkpoints/best_model/      # 预训练模型权重
│   └── data/                        # 训练/验证/测试数据
│
└── dist/                            # 构建产物（GitHub Pages 部署）
```

---

## 快速开始

### 前置条件

- **Node.js** ≥ 18（推荐 20+）
- **npm** ≥ 9
- **Python** ≥ 3.9（后端推理服务）
- **PyTorch** ≥ 2.4.0（推荐 CUDA 版本用于 GPU 推理）

### 前端

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 构建生产版本
npm run build

# 本地预览构建产物
npm run preview
```

构建产物输出至 `dist/`，可直接部署到任何静态托管服务。`main` 分支推送自动触发 GitHub Pages 部署。

### 后端推理服务

```bash
cd task_scorer

# 安装依赖
pip install -r requirements.txt

# 启动推理服务（包含 WebSocket 协作）
python -m server.app
# 或: uvicorn server.app:app --host 0.0.0.0 --port 8001 --reload
```

> **注意**：如果 `checkpoints/best_model/` 中的模型文件因 Git LFS 未拉取，请确保模型权重已下载。服务默认监听 `0.0.0.0:8001`。

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MODEL_PATH` | `./checkpoints/best_model` | MacBERT 模型权重路径 |
| `VITE_WS_URL` | `ws://localhost:8001/ws` | 前端 WebSocket 地址（构建时注入） |

---

## API 接口

后端（`task_scorer/server/app.py`）提供以下接口：

### REST

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/` | API 信息 |
| `GET` | `/health` | 健康检查 |
| `POST` | `/predict` | 单任务评分 |
| `POST` | `/predict_batch` | 批量任务评分（最多 50 个） |

**`POST /predict` 请求示例：**
```json
{
  "title": "准备期末考试",
  "description": "下周三考试，还没复习完"
}
```

**响应：**
```json
{
  "title": "准备期末考试",
  "description": "下周三考试，还没复习完",
  "urgency": 5,
  "importance": 4,
  "suggestion": "立即执行，火烧眉毛"
}
```

### WebSocket

| 端点 | 说明 |
|------|------|
| `ws://host:8001/ws` | 主 WebSocket 连接 |

**支持的消息类型（单机模式）：**

| type | 方向 | 说明 |
|------|------|------|
| `analyze_text` | C→S | 提交文字任务分析 |
| `analyze_result` | S→C | 返回单任务分析结果 |
| `analyze_batch` | C→S | 批量提交（OCR 结果） |
| `analyze_batch_result` | S→C | 返回批量分析结果 |
| `error` | S→C | 错误通知 |

---

## 协作模式

协作模式允许多人实时共享同一个任务看板。

### 加入协作组

1. 确保后端服务已启动
2. 在前端「云端协作」面板中输入 **组 ID**、**组密码** 和 **你的昵称**
3. 点击「加入/创建协作组」——如果组不存在则自动创建
4. 加入后，你将看到组内所有成员及在线状态

### 协作消息类型

| type | 说明 |
|------|------|
| `auth` / `auth_ok` / `auth_fail` | 认证流程 |
| `task_add` / `task_added` | 添加任务（广播） |
| `task_update` / `task_updated` | 更新任务评分（广播） |
| `task_delete` / `task_deleted` | 删除任务（广播） |
| `task_toggle` / `task_toggled` | 切换完成状态（广播） |
| `member_join` / `member_leave` | 成员上下线通知 |
| `members_list` | 成员列表 |

### 数据持久化

协作组数据以 JSON 文件形式存储在 `task_scorer/server/data/groups/` 目录下，密码使用 SHA-256 加盐哈希。

---

## MacBERT 评分模型

### 模型架构

```
输入文本 (title + description)
      │
      ▼
┌─────────────────┐
│  MacBERT-base   │  ← hfl/chinese-macbert-base
│  (Chinese)      │
└────────┬────────┘
         │ [CLS] token hidden state (768d)
         ▼
┌─────────────────┐
│  Shared Hidden  │  768 → 128, GELU
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│Urgency│ │Import │  各: 128→64→1, tanh×5
│ Head  │ │ Head  │  输出范围 [-5, 5]
└───────┘ └───────┘
```

- **基座模型**：`hfl/chinese-macbert-base`（哈工大中文纠错预训练 BERT）
- **损失函数**：Smooth L1 Loss（Huber Loss, β=1.0）
- **输出约束**：`tanh(x) × 5.0`，确保输出在 [-5, 5]
- **训练数据**：人工标注 + 合成数据，约数千条中文任务样本

### 训练

```bash
cd task_scorer

# 准备数据：将标注数据放到 data/raw/all.json

# 训练模型
python -m model.train --data_dir ./data --output_dir ./checkpoints

# 评估模型
python evaluate.py --test_data ./data/test.json --model_path ./checkpoints/best_model
```

训练超参数：`MAX_LENGTH=128`, `BATCH_SIZE=32`, `LR=2e-5` (BERT) / `1e-3` (Head), `EPOCHS≤20` (早停 patience=3)。

---

## 设计与交互

### Dark Neumorphism 设计系统

项目实现了一套完整的**暗色新拟态** CSS 设计语言（`src/index.css`）：

| 工具类 | 效果 |
|--------|------|
| `.neu-raised` / `.neu-raised-sm` | 凸起表面 — 卡片、面板 |
| `.neu-inset` | 凹陷表面 — 输入框、文本域 |
| `.neu-btn` / `.neu-btn-accent` | 按钮 — raised 默认 + pressed 按下 |
| `.neu-selected` | 选中态 — inset 发光 + cyan 边框 |
| `.neu-divider` | 分隔线 — 渐变凹槽 |

设计参数：

- **基底色**：`#111827`（slate-900）
- **强调色**：cyan `#22d3ee`
- **阴影体系**：暗影 `rgba(0,0,0,0.45)` 深压 + 亮边 `rgba(255,255,255,0.025)` 微提
- **全局过渡**：250ms 平滑动画
- **自定义滚动条**：6px 宽，inset 轨道 + 凸起滑块

### 响应式布局

| 断点 | 布局 |
|------|------|
| `< lg` | 单列纵向堆叠 |
| `≥ lg` | 12 列网格：左侧栏 4/12 + 右侧主区域 8/12 |

---

## 算法说明

### 象限判定

```
urgency ≥ 0  ∧  importance ≥ 0  →  Q1（重要且紧急）
urgency < 0  ∧  importance ≥ 0  →  Q2（重要不紧急）
urgency < 0  ∧  importance < 0  →  Q3（不重要不紧急）
urgency ≥ 0  ∧  importance < 0  →  Q4（紧急不重要）
```

零点归入非负侧：`urgency = 0` 视为"有一定紧迫感"，`importance = 0` 视为"有一定重要性"。

### SVG 坐标映射

```
toX(urgency)   = margin + (urgency + 5) / 10 × plotWidth
toY(importance) = margin + plotHeight − (importance + 5) / 10 × plotHeight
```

### 任务排序

| 场景 | 排序策略 |
|------|----------|
| 任务列表 | `(urgency + importance)` 降序，已完成沉底 |
| 执行建议 | Q1(U+I↓) → Q2(I↓) → Q4(U↓) → Q3(U+I↓) |

---

## 项目愿景

**让任务管理从"记录"进化到"洞察"。**

大多数任务管理工具停留在"收集箱"层面。真正的瓶颈从来不是"忘记要做"，而是：

- **分不清轻重缓急**——把所有事情当紧急处理，陷入救火循环；
- **缺乏外部校准**——自我评估不可靠，娱乐披着"放松"的外衣挤占深度工作时间；
- **管理成本过高**——手动排优先级本身就成了一个待办项。

本项目的追求：

1. **零摩擦输入**：文字或图片，AI 接管所有分类；
2. **专用模型评分**：MacBERT 自训练模型，一致性远优于通用 LLM；
3. **可视化直觉**：四象限散点图，一眼看清任务的时间-价值分布；
4. **可执行优先级**：不仅分类，更告诉你"接下来做什么、为什么、怎么做"；
5. **团队协作**：实时共享任务看板，成员状态感知。

---

## 许可证

本项目基于 **MIT License** 开源。

```
MIT License

Copyright (c) 2026 Adam Zoeee

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction...
```

---

<p align="center">
  <sub>Powered by MacBERT + FastAPI + React · 四象限法则（Eisenhower Matrix）· Built with TypeScript + Vite + Tailwind CSS</sub>
</p>
