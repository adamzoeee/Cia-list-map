# 千列万表~任务清单 · Quadrant Tasks

基于 **艾森豪威尔矩阵（Eisenhower Matrix）** 的任务管理工具。输入任务文本或截图，AI 自动评估紧迫度与重要性，将任务映射到四象限图表中，辅助你做出「先做什么」的决策。

---

## 特性

- **AI 智能分析** — 输入任务描述，由大模型自动评估紧迫度（-5 ~ +5）和重要性（-5 ~ +5），并给出执行建议。
- **截图提取任务** — 支持拖拽、点击上传或 Ctrl+V 粘贴图片，通过本地 OCR（Tesseract.js）识别文字后交由 AI 批量提取并分类。
- **四象限可视化** — SVG 绘制的散点象限图，一、二、三、四象限以不同背景色区分，任务卡片可拖拽调整位置。
- **任务管理** — 标记完成（粒子动画）、删除、手动微调紧迫度/重要性滑块、展开查看详情。
- **行动面板** — AI 按优先级排序的待办建议（Q1 → Q2 → Q4 → Q3），附带激励文案。
- **多平台 API 支持** — 内置 DeepSeek 官方、硅基流动、阿里云百炼、火山引擎 Ark、OpenRouter 五个平台的预设，兼容任意 OpenAI Chat Completions 格式的接口。
- **纯前端，数据本地化** — 无需后端，无需数据库，所有任务数据存储在浏览器 `localStorage` 中。API Key 仅保存在本地。

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript 6 |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS 4 + 自研拟态（Neumorphism）深色主题 |
| 动画 | Framer Motion（任务完成粒子爆炸） |
| OCR | Tesseract.js 7（中英文识别） |
| AI 接口 | OpenAI-compatible `/chat/completions` |

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建产物
npm run preview
```

构建产物为纯静态文件，`dist/` 目录可直接部署到任意静态托管服务（Nginx、GitHub Pages、Vercel 等）。

---

## 配置

### 获取 API Key

选择以下任一平台注册并获取 API Key：

| 平台 | 默认模型 | 接口地址 |
|------|----------|----------|
| DeepSeek 官方 | `deepseek-chat` | `https://api.deepseek.com` |
| 硅基流动 | `deepseek-ai/DeepSeek-V3` | `https://api.siliconflow.cn/v1` |
| 阿里云百炼 | `deepseek-v3` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 火山引擎 Ark | `deepseek-v3-241226` | `https://ark.cn-beijing.volces.com/api/v3` |
| OpenRouter | `deepseek/deepseek-chat` | `https://openrouter.ai/api/v1` |

> 也可使用任何兼容 OpenAI `/v1/chat/completions` 格式的自定义接口。

### 使用步骤

1. 打开应用，点击「API 设置」
2. 选择一个平台预设，或手动填写接口地址和模型名称
3. 填入 API Key，点击「测试连接」
4. 确认连接成功后即可开始使用

---

## 工作原理

```
┌──────────────┐     ┌────────────────┐     ┌─────────────────┐
│  文字输入     │────▶│  AI 分析接口    │────▶│  返回 urgency    │
│  或截图 OCR   │     │  (/chat/        │     │  importance     │
│              │     │   completions)   │     │  suggestion     │
└──────────────┘     └────────────────┘     └────────┬────────┘
                                                     │
                     ┌───────────────────────────────┘
                     ▼
           ┌───────────────────┐
           │  四象限散点图       │
           │  ┌──────┬──────┐   │
           │  │ Q2   │ Q1   │   │  Y = 重要性 (importance)
           │  │ 重要  │ 重要  │   │
           │  │ 不紧迫│ 紧迫  │   │
           │  ├──────┼──────┤   │
           │  │ Q3   │ Q4   │   │
           │  │不重要 │不重要 │   │
           │  │ 不紧迫│ 紧迫  │   │
           │  └──────┴──────┘   │
           │     X = 紧迫度      │
           └───────────────────┘
```

### 象限含义

| 象限 | 条件 | 策略 |
|------|------|------|
| **Q1** 重要且紧迫 | urgency ≥ 0, importance ≥ 0 | 立即去做 |
| **Q2** 重要不紧迫 | urgency < 0, importance ≥ 0 | 计划安排 |
| **Q3** 不重要不紧迫 | urgency < 0, importance < 0 | 尽量减少 |
| **Q4** 不重要但紧迫 | urgency ≥ 0, importance < 0 | 委派他人 |

---

## 项目结构

```
src/
├── main.tsx                    # 入口
├── App.tsx                     # 根组件：状态管理、持久化、布局
├── types.ts                    # TypeScript 类型定义
├── index.css                   # Tailwind + 拟态主题令牌
├── api/
│   ├── deepseek.ts             # AI 接口客户端、平台预设、JSON 解析
│   └── ocr.ts                  # Tesseract.js OCR 封装
└── components/
    ├── ui.tsx                  # 拟态暗色 UI 原语（Panel/Button/Input 等）
    ├── ApiKeyInput.tsx         # API 配置面板（平台选择 + 连接测试）
    ├── TaskInputForm.tsx       # 文字 + 图片输入表单
    ├── ImageTaskPreview.tsx    # OCR 提取任务预览与编辑弹窗
    ├── QuadrantChart.tsx       # SVG 四象限散点图
    ├── TaskList.tsx            # 任务列表（排序 + 汇总）
    ├── TaskCard.tsx            # 单条任务（展开滑块微调）
    └── ActionPanel.tsx         # 优先行动建议面板
```

---

## 许可证

[MIT](LICENSE) © 2026 Adam Zoeee
