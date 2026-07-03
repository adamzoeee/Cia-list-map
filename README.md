# 千列万表·优先级矩阵 | Quadrant Tasks

> **AI 驱动的四象限任务管理 —— 输入即分类，聚焦真正重要的事。**

一个基于 **艾森豪威尔矩阵（Eisenhower Matrix）** 方法论、融合 **大语言模型（LLM）自然语言理解** 与 **浏览器端 OCR** 的纯前端单页应用。你只需用文字描述任务（或上传一张待办截图），AI 会瞬间分析每个任务的 **时间紧迫度** 与 **任务重要性**，将其归入四象限并可视化呈现，同时给出优先级排序后的执行建议。

---

## 目录

- [科学依据：为什么是四象限](#科学依据为什么是四象限)
- [核心能力](#核心能力)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [API 平台兼容](#api-平台兼容)
- [设计与交互](#设计与交互)
- [算法说明](#算法说明)
- [项目愿景](#项目愿景)
- [许可证](#许可证)

---

## 科学依据：为什么是四象限

### 艾森豪威尔矩阵（Eisenhower Matrix）

该项目的方法论基础源自美国第 34 任总统 **德怀特·D·艾森豪威尔**（Dwight D. Eisenhower）的时间管理原则，后经管理学家 **史蒂芬·柯维**（Stephen R. Covey）在《高效能人士的七个习惯》中系统化推广：

> "I have two kinds of problems: the urgent and the important. The urgent are not important, and the important are never urgent."
>
> "我有两种问题：紧急的与重要的。紧急的不重要，重要的从来不紧急。"

该矩阵将任务沿两个独立维度——**紧迫度** 与 **重要性**——划分为四个象限：

| 象限 | 特征 | 策略 |
|------|------|------|
| **Q1 · 重要且紧急** | 危机、截止日期驱动的核心产出 | **立即去做 (Do First)** |
| **Q2 · 重要不紧急** | 长期规划、能力建设、深度工作 | **计划去做 (Schedule)** |
| **Q3 · 不重要不紧急** | 消遣、琐事、无意义的时间消耗 | **减少或消除 (Eliminate)** |
| **Q4 · 紧急不重要** | 干扰、部分会议、可代理的事务 | **委派或压缩 (Delegate)** |

### 为什么引入 AI

经典 Eisenhower 矩阵依赖用户 **主观判断** 任务的紧迫度与重要性，存在两个痛点：

1. **自我认知偏差**：人倾向于高估琐事的紧迫性，而低估深度工作的长期价值；
2. **分类摩擦**：为每个任务手动打分是一种认知负担，阻碍持续使用。

本项目的核心创新在于将 LLM 作为 **外部判断代理**：通过精心设计的 system prompt，LLM 以相对客观的尺度对任务进行双维度连续评分（-5 ~ +5），将传统二元分类扩展为 **连续频谱**，使散点图上的任务分布具有更细粒度的区分力。AI 还内建 **价值导向规则**——将纯娱乐消遣类活动强制归类为负重要性——以此引导用户关注真正创造价值的事务。

### 图片识别的场景价值

对于习惯在笔记本、白板或手机备忘录上手写待办清单的用户，上传截图后由 **Tesseract.js 本地 OCR** 提取文字、再由 LLM 批量拆分并逐一评分的流程，消除了从"纸质想法"到"数字化管理"之间的手动录入鸿沟。

---

## 核心能力

### 1. 文本任务 AI 分析
- 输入任务标题 + 可选描述
- 调用兼容 OpenAI Chat Completions 的 API，返回：精简标题、一句话描述、紧迫度评分、重要性评分、行动建议
- AI temperature 固定为 0.3，确保评分一致性
- 评分自动 clamp 到 [-5, 5] 整数区间

### 2. 图片 OCR + AI 批量拆分
- 支持 `jpg / png / gif`，支持 **拖拽上传** 与 **Ctrl+V 剪贴板粘贴**
- 上传前使用 Canvas API **客户端压缩**（max 1920px，JPEG quality 0.8）
- **Tesseract.js** 本地 OCR，语言包 `chi_sim + eng`（中英文混合识别）
- 图片 **不离开用户设备**，仅 OCR 文本发送至 LLM
- LLM 智能过滤：自动跳过已勾选条目、页眉页脚、时间戳等非任务噪声
- 识别结果在模态框中预览，支持编辑/删除后批量确认添加

### 3. SVG 四象限可视化
- 纯 SVG 渲染的散点图，X 轴 = 时间紧迫度，Y 轴 = 任务重要性
- 四个象限以不同背景色标注，带虚线分割
- 每个任务渲染为带颜色标识的小卡片（标题 + 评分元信息 + 时间提示）
- 卡片入场使用 **spring 弹簧动画**（Motion 库），退出有缩放过渡
- 点击卡片可选中高亮，悬停显示详情 tooltip
- 时间关键词匹配：自动识别"今天""DDL""本周"等并在卡片上标注
- 响应式自适应宽度，任务数量多时自动缩小卡片尺寸

### 4. 任务列表管理
- 按 U+I 总分降序排列，已完成任务自动沉底
- 支持：勾选完成、删除、点击展开编辑
- 展开后可拖拽 slider 微调紧迫度/重要度（评分实时联动重新计算象限）
- 已完成与未完成任务之间有视觉分隔线
- 空状态引导 UI

### 5. 执行建议面板（ActionPanel）
- 按四象限优先级排序：Q1 → Q2 → Q4 → Q3
- 展示 Top 5 待办任务及每个的策略建议
- 随机显示一条中文励志语（8 条库）
- 全部完成时展示庆祝态

### 6. 多平台 API 兼容
| 平台预设 | 说明 |
|----------|------|
| **DeepSeek 官方** | `api.deepseek.com` — `deepseek-chat` / `deepseek-reasoner` |
| **硅基流动 (SiliconFlow)** | `api.siliconflow.cn` — DeepSeek-V3 / R1 / Qwen2.5-72B |
| **阿里云百炼** | `dashscope.aliyuncs.com` — deepseek-v3 / r1 / qwen-plus |
| **火山引擎 Ark** | `ark.cn-beijing.volces.com` — deepseek-v3 / r1 |
| **OpenRouter** | `openrouter.ai` — deepseek-chat / gpt-4o-mini |

- 同时支持自定义 Base URL 与 Model
- 一键连接测试功能
- API Key 存储于浏览器 localStorage

---

## 技术架构

### 技术栈一览

| 技术 | 版本 | 类别 | 用途 |
|------|------|------|------|
| **React** | ^19.2.7 | 运行时 | UI 组件框架 |
| **TypeScript** | ^6.0.3 | 语言 | 类型安全 |
| **Vite** | ^8.1.0 | 构建 | 开发服务器 & 生产打包 |
| **Tailwind CSS** | ^4.3.2 | 样式 | 原子化 CSS 框架 |
| **@tailwindcss/vite** | ^4.3.2 | 构建 | Tailwind 的 Vite 集成插件 |
| **@vitejs/plugin-react** | ^6.0.3 | 构建 | Vite React Fast Refresh |
| **Motion** (原 Framer Motion) | ^12.42.2 | 运行时 | SVG 卡片 spring 动画 & 进出场过渡 |
| **Tesseract.js** | ^7.0.0 | 运行时 | 浏览器端 OCR（中英文） |

### 架构特征

```
┌──────────────────────────────────────────────────────┐
│                    Browser Only                      │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  React   │  │ Tesseract│  │  fetch() → LLM    │  │
│  │  UI      │  │ OCR      │  │  API (OpenAI      │  │
│  │  (SVG +  │  │ (local)  │  │  Compatible)      │  │
│  │  Motion) │  │          │  │                   │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│        │              │                │             │
│        └──────────────┴────────────────┘             │
│                       │                              │
│               localStorage                          │
│           (tasks + API config)                      │
└──────────────────────────────────────────────────────┘
```

- **完全客户端运行**：无后端服务器，无数据库
- **状态管理**：React `useState` + `useCallback`，无全局状态库
- **持久化**：`localStorage`（任务数据 + API 配置）
- **路由**：零依赖，单页条件渲染
- **无环境变量依赖**：所有配置通过 UI 输入并本地持久化

### TypeScript 编译配置

- Target: `ES2020`
- JSX: `react-jsx`
- Module: `ESNext`，bundler 解析模式
- 严格模式全开：`strict`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`

---

## 项目结构

```
quadrant-tasks/
├── index.html                  # Vite 入口 HTML
├── package.json                # 依赖与脚本
├── tsconfig.json               # TypeScript 配置
├── vite.config.ts              # Vite 构建配置（React + Tailwind 插件）
├── README.md                   # 本文件
└── src/
    ├── main.tsx                # ReactDOM.createRoot 挂载入口
    ├── App.tsx                 # 根组件 — 全局状态（tasks, selectedTask, loading, error, imageDrafts）
    ├── types.ts                # TypeScript 类型定义（Task, AIAnalysisResult, QuadrantInfo 等）
    ├── index.css               # Tailwind 导入 + Dark Neumorphism 设计系统（~150 行自定义 CSS）
    ├── vite-env.d.ts           # Vite 客户端类型引用
    ├── api/
    │   ├── deepseek.ts         # LLM API 客户端（analyzeTask, analyzeOcrText, testApiConnection, 平台预设, JSON 容错解析）
    │   └── ocr.ts              # Tesseract.js OCR 封装（recognizeTextFromImage）
    └── components/
        ├── ui.tsx              # 设计系统组件库（Panel, Button, TextInput, TextArea, Badge, SectionTitle, cn）
        ├── ApiKeyInput.tsx     # API 配置面板（Key, Base URL, Model, 平台预设选择器, 连接测试按钮）
        ├── TaskInputForm.tsx   # 任务输入表单（文字/图片双模式, 拖拽上传, Ctrl+V 粘贴, Canvas 图片压缩）
        ├── QuadrantChart.tsx   # SVG 四象限散点图（含 QUADRANTS 常量导出, Motion spring 动画）
        ├── TaskCard.tsx        # 单个任务卡片（展开编辑 U/I slider, 完成/删除操作）
        ├── TaskList.tsx        # 任务列表（排序逻辑, 已完成分隔线, 空状态）
        ├── ActionPanel.tsx     # 执行建议面板（Top 5 优先任务, 随机励志语, 全部完成庆祝态）
        └── ImageTaskPreview.tsx # 图片识别结果预览模态框（编辑/删除/确认批量添加）
```

---

## 快速开始

### 前置条件

- **Node.js** ≥ 18（推荐 20+）
- **npm** ≥ 9

### 安装与运行

```bash
# 克隆仓库
git clone <repo-url> && cd quadrant-tasks

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`。

### 构建生产版本

```bash
npm run build    # TypeScript 类型检查 + Vite 打包
npm run preview  # 本地预览构建产物
```

构建产物输出至 `dist/`，可直接部署到任何静态托管服务（Vercel、Netlify、GitHub Pages、Nginx 等）。

### 首次使用

1. 在页面中展开 API 配置面板，选择一个平台预设（如 DeepSeek 官方）
2. 填入你的 API Key，点击 **测试连接** 验证可用性
3. 在输入框中描述一个任务（或上传待办截图），点击分析
4. 任务卡片出现在四象限图上，你可点击、编辑、完成或删除

---

## API 平台兼容

本项目调用的是兼容 **OpenAI Chat Completions** 格式的 API。只要平台的 `/chat/completions` 端点返回如下结构的响应，即可使用：

```json
{
  "choices": [
    {
      "message": {
        "content": "..."
      }
    }
  ]
}
```

### System Prompt 设计

LLM 被给予明确的价值判断编码：

- **紧迫度 (urgency)**：deadline 距离、拖延后果 —— 连续谱 -5（毫无压力）到 +5（火烧眉毛）
- **重要性 (importance)**：对个人成长/工作产出/重要关系的实质贡献 —— 连续谱 -5（纯娱乐消遣）到 +5（影响深远、关乎核心目标）
- **价值约束**：娱乐消遣、刷视频、打游戏等不创造价值的活动，importance 强制为负
- 返回纯 JSON，不允许多余文字或 markdown 包裹

### JSON 解析容错

考虑到不同 LLM 对 "只返回 JSON" 指令的遵循程度参差不齐，解析器实现了三层降级策略：

1. **直接 `JSON.parse`**
2. **匹配 markdown code block** （```json ... ```）
3. **提取首尾 JSON 子串**（定位第一个 `[`/`{` 到最后一个 `]`/`}`）

### 安全注意事项

> ⚠️ API Key 存储在浏览器 `localStorage` 中，存在 XSS 泄露风险。本项目设计为 **个人工具**，不推荐在共享设备或不可信网络环境下使用。生产部署时建议通过反向代理或 Edge Function 中转 API 请求以隐藏 Key。

---

## 设计与交互

### Dark Neumorphism 设计系统

项目实现了一套完整的 **暗色新拟态（Dark Neumorphism）** CSS 设计语言，定义在 `src/index.css` 中：

| 工具类 | 效果 |
|--------|------|
| `.neu-raised` / `.neu-raised-sm` | 凸起表面——卡片、面板 |
| `.neu-inset` | 凹陷表面——输入框、文本域 |
| `.neu-pressed` | 按下态——用于选中或激活状态 |
| `.neu-btn` / `.neu-btn-accent` | 按钮——raised 默认 + pressed 按下 |
| `.neu-selected` | 选中态——inset 发光 + cyan 边框 |
| `.neu-divider` | 分隔线——渐变凹槽 |

设计参数：

- **基底色**：`#111827`（slate-900）
- **强调色**：cyan（`#22d3ee`）
- **阴影体系**：多层 box-shadow 模拟凹凸——暗影 `rgba(0,0,0,0.45)` 深压，亮边 `rgba(255,255,255,0.025)` 微提
- **过渡动画**：全局 250ms，所有颜色/边框/阴影平滑过渡
- **自定义滚动条**：6px 宽，inset 凹槽轨道 + 凸起滑块

### 响应式布局

- 移动端（< `lg` 断点）：单列纵向布局，图表与表单垂直堆叠
- 桌面端（≥ `lg`）：12 列网格——左侧栏（输入 + 建议面板，4/12）+ 右侧主区域（图表 + 列表，8/12）
- 图表容器宽度自适应，卡片尺寸随任务数量动态调整（>14 个任务时缩小）

---

## 算法说明

### 象限判定

```
urgency ≥ 0  ∧  importance ≥ 0  →  Q1（重要且紧急）
urgency < 0  ∧  importance ≥ 0  →  Q2（重要不紧急）
urgency < 0  ∧  importance < 0  →  Q3（不重要不紧急）
urgency ≥ 0  ∧  importance < 0  →  Q4（紧急不重要）
```

零点作为非负侧——即 `urgency = 0` 被视为"有一定紧迫感"，`importance = 0` 被视为"有一定重要性"。

### SVG 坐标映射

将 [-5, 5] 评分线性映射到 SVG 绘图区域：

```
toX(urgency)   = margin + (urgency + 5) / 10 × plotWidth
toY(importance) = margin + plotHeight − (importance + 5) / 10 × plotHeight
```

### 任务排序策略

| 场景 | 排序依据 |
|------|----------|
| **任务列表** | `(urgency + importance)` 降序，已完成任务固定沉底 |
| **执行建议** | Q1 按 U+I↓ → Q2 按 I↓ → Q4 按 U↓ → Q3 按 U+I↓ |
| **象限内部** | Q1/Q3 按总分降序，Q2 按重要性降序，Q4 按紧迫度降序 |

### 图片压缩算法

上传图片在客户端使用 Canvas API 压缩：

1. 保持宽高比缩放到 max 1920px
2. 通过 `canvas.toDataURL('image/jpeg', 0.8)` 输出
3. 压缩后的 base64 传递给 Tesseract.js

### LLM 调用参数

| 参数 | 单任务分析 | 图片批量分析 |
|------|-----------|-------------|
| `temperature` | 0.3 | 0.3 |
| `max_tokens` | 300 | 2,000 |
| `messages` | system + user | system + user (含 OCR 原文) |

低 temperature 确保评分的一致性与可复现性。

---

## 项目愿景

### 终极追求

**让任务管理从"记录"进化到"洞察"。**

大多数任务管理工具停留在"收集箱"层面——你往里面扔任务，它帮你记着。但真正的瓶颈从来不是"忘记要做"，而是：

- **分不清轻重缓急**——把所有事情都当紧急处理，陷入救火循环；
- **缺乏外部校准**——自我评估不可靠，娱乐披着"放松"的外衣挤占深度工作时间；
- **管理成本过高**——为每个任务手动打标签、排优先级本身就成了一个待办项。

本项目的追求是：

1. **零摩擦输入**：文字或图片，一句话或一张截图，AI 接管所有分类工作；
2. **外部视角校准**：LLM 作为价值判断的第三方代理，帮助用户从"我觉得重要"过渡到"客观上值得投入"；
3. **可视化直觉**：一张四象限散点图，一眼看清所有任务的时间-价值分布——哪些在消耗你，哪些在成就你；
4. **可执行的优先级**：不仅仅是分类，而是告诉你"接下来 5 件事做什么、为什么、怎么做"。

### 未来方向（Roadmap）

- [ ] **分析历史与趋势**：追踪任务的完成率、平均滞留时间、象限迁移路径
- [ ] **多模型 A/B 对比**：支持同时调用两个模型分别评分，观察判断差异
- [ ] **语音输入**：Web Speech API，口述任务直接分析
- [ ] **导出与分享**：生成四象限截图 / Markdown 报告
- [ ] **PWA 离线支持**：Service Worker 缓存，作为独立 App 使用
- [ ] **标签与项目分组**：在四象限之上叠加项目维度过滤
- [ ] **协作模式**：团队共享任务视图（需后端支持）

---

## 许可证

本项目基于 **MIT License** 开源。

```
MIT License

Copyright (c) 2026 Adam Zoeee

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions: ...
```

---

<p align="center">
  <sub>Powered by Deepseek&Reasonix · 四象限法则（Eisenhower Matrix）· Built with React + TypeScript + Vite</sub>
</p>
