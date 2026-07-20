"""
MacBERT 双头回归模型训练脚本
用法:
    cd task_scorer
    python -m model.train --data_dir ./data --output_dir ./checkpoints

环境要求:
    - CUDA 可用时自动使用 GPU (RTX 5070 Laptop 8GB 完全支持)
    - 无 CUDA 时回退到 CPU (训练会很慢)
"""
import os
import sys
import json
import argparse
import math
from pathlib import Path
from typing import Dict

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torch.optim import AdamW
from transformers import BertConfig, BertTokenizer, BertModel, get_linear_schedule_with_warmup
from tqdm import tqdm

# 将项目根目录加入路径
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from model.model import TaskScorer
from model.dataset import TaskDataset, collate_fn, split_dataset


# ============== 配置参数 ==============
MODEL_NAME = "hfl/chinese-macbert-base"
MAX_LENGTH = 128
BATCH_SIZE = 32          # 8GB 显存轻松支持
LEARNING_RATE = 2e-5     # BERT 层学习率
HEAD_LR = 1e-3           # 回归头学习率
WEIGHT_DECAY = 0.01
WARMUP_RATIO = 0.1
MAX_EPOCHS = 20
PATIENCE = 3             # 早停耐心值
SEED = 42


def set_seed(seed: int):
    """固定随机种子，保证可复现"""
    import random
    import numpy as np
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def get_device():
    """获取最佳可用设备"""
    if torch.cuda.is_available():
        device = torch.device("cuda")
        print(f"[Device] 使用 GPU: {torch.cuda.get_device_name(0)}")
        print(f"[Device] 显存: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
    else:
        device = torch.device("cpu")
        print("[Device] 使用 CPU (训练会很慢)")
    return device


def convert_to_native(obj):
    """递归将 numpy 类型转换为 Python 原生类型，确保 JSON 可序列化"""
    if isinstance(obj, dict):
        return {k: convert_to_native(v) for k, v in obj.items()}
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


def save_checkpoint(model, tokenizer, output_dir: str, epoch: int, metrics: Dict):
    """保存模型检查点"""
    save_path = Path(output_dir) / f"checkpoint-epoch-{epoch}"
    save_path.mkdir(parents=True, exist_ok=True)

    model.save_pretrained(save_path)
    tokenizer.save_pretrained(save_path)

    # 保存训练指标
    with open(save_path / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(convert_to_native(metrics), f, ensure_ascii=False, indent=2)

    print(f"[Checkpoint] 已保存到 {save_path}")
    return str(save_path)


def save_best_model(model, tokenizer, output_dir: str):
    """保存最终最佳模型"""
    best_path = Path(output_dir) / "best_model"
    best_path.mkdir(parents=True, exist_ok=True)

    model.save_pretrained(best_path)
    tokenizer.save_pretrained(best_path)

    print(f"[BestModel] 最终模型已保存到 {best_path}")
    return str(best_path)


def evaluate(model, dataloader, device) -> Dict[str, float]:
    """验证/测试评估"""
    model.eval()
    total_loss = 0.0
    all_urgency_pred = []
    all_urgency_true = []
    all_importance_pred = []
    all_importance_true = []

    with torch.no_grad():
        for batch in tqdm(dataloader, desc="Evaluating", leave=False):
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            token_type_ids = batch["token_type_ids"].to(device)
            urgency_labels = batch["urgency_labels"].to(device)
            importance_labels = batch["importance_labels"].to(device)

            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                token_type_ids=token_type_ids,
                urgency_labels=urgency_labels,
                importance_labels=importance_labels,
            )

            total_loss += outputs["loss"].item()
            all_urgency_pred.extend(outputs["urgency"].cpu().numpy())
            all_urgency_true.extend(urgency_labels.cpu().numpy())
            all_importance_pred.extend(outputs["importance"].cpu().numpy())
            all_importance_true.extend(importance_labels.cpu().numpy())

    # 计算指标
    import numpy as np
    urgency_pred = np.array(all_urgency_pred)
    urgency_true = np.array(all_urgency_true)
    importance_pred = np.array(all_importance_pred)
    importance_true = np.array(all_importance_true)

    def mae(pred, true):
        return np.mean(np.abs(pred - true))

    def rmse(pred, true):
        return np.sqrt(np.mean((pred - true) ** 2))

    def r2(pred, true):
        ss_res = np.sum((true - pred) ** 2)
        ss_tot = np.sum((true - np.mean(true)) ** 2)
        return 1 - ss_res / (ss_tot + 1e-8)

    def quadrant_acc(u_pred, u_true, i_pred, i_true):
        """四象限分类准确率"""
        q_pred = []
        q_true = []
        for up, ut, ip, it in zip(u_pred, u_true, i_pred, i_true):
            # urgency >= 0 && importance >= 0 -> Q1
            # urgency < 0  && importance >= 0 -> Q2
            # urgency < 0  && importance < 0  -> Q3
            # urgency >= 0 && importance < 0  -> Q4
            q_pred.append(1 if up >= 0 and ip >= 0 else
                         2 if up < 0 and ip >= 0 else
                         3 if up < 0 and ip < 0 else 4)
            q_true.append(1 if ut >= 0 and it >= 0 else
                         2 if ut < 0 and it >= 0 else
                         3 if ut < 0 and it < 0 else 4)
        return np.mean(np.array(q_pred) == np.array(q_true))

    return {
        "loss": total_loss / len(dataloader),
        "urgency_mae": mae(urgency_pred, urgency_true),
        "urgency_rmse": rmse(urgency_pred, urgency_true),
        "urgency_r2": r2(urgency_pred, urgency_true),
        "importance_mae": mae(importance_pred, importance_true),
        "importance_rmse": rmse(importance_pred, importance_true),
        "importance_r2": r2(importance_pred, importance_true),
        "quadrant_acc": quadrant_acc(urgency_pred, urgency_true, importance_pred, importance_true),
    }


def train(args):
    """主训练流程"""
    set_seed(SEED)
    device = get_device()

    # 路径配置
    data_dir = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    train_path = data_dir / "train.json"
    val_path = data_dir / "val.json"
    test_path = data_dir / "test.json"

    # 如果 train/val/test 不存在，尝试从 raw/all.json 拆分
    if not train_path.exists():
        raw_path = data_dir / "raw" / "all.json"
        if raw_path.exists():
            print(f"[Data] 从 {raw_path} 拆分数据集...")
            split_dataset(str(raw_path), str(train_path), str(val_path), str(test_path))
        else:
            raise FileNotFoundError(
                f"找不到训练数据。请将数据文件放到 {data_dir}/train.json "
                f"或 {data_dir}/raw/all.json"
            )

    # 加载 Tokenizer
    print(f"[Tokenizer] 加载 {MODEL_NAME}...")
    tokenizer = BertTokenizer.from_pretrained(MODEL_NAME)

    # 加载数据集
    print("[Dataset] 加载训练/验证/测试集...")
    train_dataset = TaskDataset(str(train_path), tokenizer, max_length=MAX_LENGTH)
    val_dataset = TaskDataset(str(val_path), tokenizer, max_length=MAX_LENGTH)
    test_dataset = TaskDataset(str(test_path), tokenizer, max_length=MAX_LENGTH)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, collate_fn=collate_fn)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, collate_fn=collate_fn)
    test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False, collate_fn=collate_fn)

    # 加载预训练配置并初始化模型
    print(f"[Model] 初始化 MacBERT 双头回归模型...")
    config = BertConfig.from_pretrained(MODEL_NAME)
    # 先加载预训练 BERT 编码器，再组装 TaskScorer
    # 避免 TaskScorer.from_pretrained 加载不同架构 checkpoint 时的兼容性问题
    bert = BertModel.from_pretrained(MODEL_NAME)
    model = TaskScorer(config)
    model.bert = bert
    model.to(device)

    # 参数分组：BERT 层用低学习率，回归头用高学习率
    bert_params = []
    head_params = []
    for name, param in model.named_parameters():
        if 'urgency_head' in name or 'importance_head' in name or 'shared_hidden' in name:
            head_params.append(param)
        else:
            bert_params.append(param)

    optimizer = AdamW([
        {'params': bert_params, 'lr': LEARNING_RATE},
        {'params': head_params, 'lr': HEAD_LR},
    ], weight_decay=WEIGHT_DECAY)

    # 学习率调度
    total_steps = len(train_loader) * MAX_EPOCHS
    warmup_steps = int(total_steps * WARMUP_RATIO)
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=warmup_steps, num_training_steps=total_steps
    )

    # 早停相关
    best_val_loss = float('inf')
    patience_counter = 0
    best_checkpoint_path = None

    print(f"\n{'='*60}")
    print("开始训练")
    print(f"{'='*60}")
    print(f"训练样本数: {len(train_dataset)}")
    print(f"验证样本数: {len(val_dataset)}")
    print(f"测试样本数: {len(test_dataset)}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Max epochs: {MAX_EPOCHS}")
    print(f"BERT LR: {LEARNING_RATE}, Head LR: {HEAD_LR}")
    print(f"{'='*60}\n")

    for epoch in range(1, MAX_EPOCHS + 1):
        # ===== 训练阶段 =====
        model.train()
        epoch_loss = 0.0
        progress = tqdm(train_loader, desc=f"Epoch {epoch}/{MAX_EPOCHS} [Train]")

        for batch in progress:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            token_type_ids = batch["token_type_ids"].to(device)
            urgency_labels = batch["urgency_labels"].to(device)
            importance_labels = batch["importance_labels"].to(device)

            optimizer.zero_grad()
            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                token_type_ids=token_type_ids,
                urgency_labels=urgency_labels,
                importance_labels=importance_labels,
            )

            loss = outputs["loss"]
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            scheduler.step()

            epoch_loss += loss.item()
            progress.set_postfix({"loss": f"{loss.item():.4f}"})

        avg_train_loss = epoch_loss / len(train_loader)

        # ===== 验证阶段 =====
        val_metrics = evaluate(model, val_loader, device)

        print(f"\n[Epoch {epoch}] Train Loss: {avg_train_loss:.4f} | "
              f"Val Loss: {val_metrics['loss']:.4f} | "
              f"Urgency MAE: {val_metrics['urgency_mae']:.3f} | "
              f"Importance MAE: {val_metrics['importance_mae']:.3f} | "
              f"Quadrant Acc: {val_metrics['quadrant_acc']:.2%}")

        # ===== 保存检查点 =====
        checkpoint_metrics = {
            "epoch": epoch,
            "train_loss": avg_train_loss,
            **val_metrics,
        }
        ckpt_path = save_checkpoint(model, tokenizer, str(output_dir), epoch, checkpoint_metrics)

        # ===== 早停判断 =====
        if val_metrics["loss"] < best_val_loss:
            best_val_loss = val_metrics["loss"]
            patience_counter = 0
            best_checkpoint_path = ckpt_path
            print(f"  >>> 最佳验证 loss 更新: {best_val_loss:.4f}")
        else:
            patience_counter += 1
            print(f"  >>> 验证 loss 未改善 ({patience_counter}/{PATIENCE})")

        if patience_counter >= PATIENCE:
            print(f"\n[EarlyStop] 连续 {PATIENCE} 轮未改善，提前停止训练")
            break

    # ===== 最终测试 =====
    print(f"\n{'='*60}")
    print("最终测试 (使用最佳验证模型)")
    print(f"{'='*60}")

    if best_checkpoint_path:
        print(f"加载最佳模型: {best_checkpoint_path}")
        model = TaskScorer.from_pretrained(best_checkpoint_path)
        model.to(device)

    test_metrics = evaluate(model, test_loader, device)
    print(f"\n[Test Results]")
    print(f"  Loss:           {test_metrics['loss']:.4f}")
    print(f"  Urgency MAE:    {test_metrics['urgency_mae']:.3f}")
    print(f"  Urgency RMSE:   {test_metrics['urgency_rmse']:.3f}")
    print(f"  Urgency R2:     {test_metrics['urgency_r2']:.3f}")
    print(f"  Importance MAE: {test_metrics['importance_mae']:.3f}")
    print(f"  Importance RMSE:{test_metrics['importance_rmse']:.3f}")
    print(f"  Importance R2:  {test_metrics['importance_r2']:.3f}")
    print(f"  Quadrant Acc:   {test_metrics['quadrant_acc']:.2%}")

    # 保存最终最佳模型
    final_path = save_best_model(model, tokenizer, str(output_dir))

    # 保存测试指标
    with open(Path(final_path) / "test_metrics.json", "w", encoding="utf-8") as f:
        json.dump(convert_to_native(test_metrics), f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print("训练完成！")
    print(f"最终模型路径: {final_path}")
    print(f"{'='*60}")

    return final_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="训练任务评分模型")
    parser.add_argument("--data_dir", type=str, default="./data",
                        help="数据目录 (包含 train.json, val.json, test.json)")
    parser.add_argument("--output_dir", type=str, default="./checkpoints",
                        help="模型输出目录")
    args = parser.parse_args()

    train(args)
