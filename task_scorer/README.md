# Task Scorer - 任务紧迫度/重要性评分模型

基于 `hfl/chinese-macbert-base` 双头回归模型，为任务描述预测紧迫度（urgency）和重要性（importance）评分。

## 项目结构

```
task_scorer/
├── data/
│   ├── raw/                 # 原始数据（人工标注或合成数据）
│   │   └── all.json         # 合并后的完整数据集（会被自动拆分为 train/val/test）
│   ├── train.json           # 训练集（自动生成）
│   ├── val.json             # 验证集（自动生成）
│   └── test.json            # 测试集（自动生成）
├── model/
│   ├── model.py             # MacBERT 双头回归模型定义
│   ├── dataset.py           # PyTorch Dataset + 数据加载
│   └── train.py             # 训练入口脚本
├── server/
│   └── app.py               # FastAPI 推理服务
├── scripts/
│   └── generate_synthetic.py # 合成数据生成（备选）
├── evaluate.py              # 模型评估脚本
├── requirements.txt         # Python 依赖
└── README.md                # 本文件
```

## 快速开始

### 1. 安装依赖

```bash
cd task_scorer
pip install -r requirements.txt
```

### 2. 准备数据

将标注好的数据集放到 `data/raw/all.json`，格式如下：

```json
[
  {
    "title": "写周报",
    "description": "周五前提交本周工作总结",
    "urgency": 3,
    "importance": 2
  },
  {
    "title": "刷抖音",
    "description": "睡前想放松一下",
    "urgency": -4,
    "importance": -3
  }
]
```

> 如果已经有 `data/train.json`、`data/val.json`、`data/test.json`，则跳过此步。

### 3. 训练模型

```bash
python -m model.train --data_dir ./data --output_dir ./checkpoints
```

训练完成后，最佳模型会保存到 `./checkpoints/best_model/`。

### 4. 启动推理服务

```bash
python -m server.app
# 服务将运行在 http://localhost:8001
```

或使用 uvicorn：
```bash
uvicorn server.app:app --host 0.0.0.0 --port 8001 --reload
```

### 5. 测试 API

```bash
curl -X POST http://localhost:8001/predict \
  -H "Content-Type: application/json" \
  -d '{"title": "准备期末考试", "description": "下周三考试，还没复习完"}'
```

### 6. 评估模型

```bash
python evaluate.py --test_data ./data/test.json --model_path ./checkpoints/best_model
```

## 数据格式说明

支持两种 JSON 格式：

**格式一：直接数组（推荐）**
```json
[
  {"title": "...", "description": "...", "urgency": N, "importance": N},
  ...
]
```

**格式二：嵌套 tasks 对象**
```json
{
  "tasks": [
    {"title": "...", "description": "...", "urgency": N, "importance": N},
    ...
  ]
}
```

## 训练参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| MODEL_NAME | hfl/chinese-macbert-base | 预训练模型 |
| MAX_LENGTH | 128 | 最大序列长度 |
| BATCH_SIZE | 32 | 批次大小 |
| LEARNING_RATE | 2e-5 | BERT 层学习率 |
| HEAD_LR | 1e-3 | 回归头学习率 |
| MAX_EPOCHS | 20 | 最大训练轮数 |
| PATIENCE | 3 | 早停耐心值 |

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/` | GET | API 信息 |
| `/health` | GET | 健康检查 |
| `/predict` | POST | 单任务分析 |
| `/predict_batch` | POST | 批量任务分析 |

### `/predict` 请求/响应示例

**请求：**
```json
{
  "title": "写毕业论文",
  "description": "下周要交初稿，导师催了两次"
}
```

**响应：**
```json
{
  "title": "写毕业论文",
  "description": "下周要交初稿，导师催了两次",
  "urgency": 4,
  "importance": 5,
  "suggestion": "立即执行，火烧眉毛"
}
```

## 环境要求

- Python >= 3.9
- PyTorch >= 2.4.0（CUDA 11.8+ 推荐）
- 显存 >= 4GB（训练）/ >= 2GB（推理）
- RTX 5070 Laptop 8GB 完全支持

## 与前端集成

前端在 `deepseek.ts` 中新增「自训练模型」预设，Base URL 指向 `http://localhost:8001`，即可无缝切换到本地模型。
