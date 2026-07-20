"""
模型评估脚本
对比本地模型与 DeepSeek API 的评分结果，计算相关性指标

用法:
    cd task_scorer
    python evaluate.py --test_data ./data/test.json --model_path ./checkpoints/best_model
"""
import os
import sys
import json
import argparse
from pathlib import Path

import torch
import numpy as np
from scipy.stats import spearmanr, kendalltau
from transformers import BertTokenizer
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parent))

from model.model import TaskScorer
from model.dataset import TaskDataset


DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_local_model(model_path: str):
    """加载本地训练好的模型"""
    tokenizer = BertTokenizer.from_pretrained(model_path)
    # 加载训练后的同架构 checkpoint
    # model.py 中已添加 all_tied_weights_keys 属性兼容 transformers 4.42+
    model = TaskScorer.from_pretrained(model_path)
    model.to(DEVICE)
    model.eval()
    return model, tokenizer


def predict_local(model, tokenizer, title: str, description: str):
    """本地模型预测单条任务"""
    text = title.strip()
    if description.strip():
        text = f"{text}。{description.strip()}"

    encoding = tokenizer(
        text,
        max_length=128,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )

    input_ids = encoding["input_ids"].to(DEVICE)
    attention_mask = encoding["attention_mask"].to(DEVICE)
    token_type_ids = encoding.get("token_type_ids", torch.zeros_like(input_ids)).to(DEVICE)

    with torch.no_grad():
        outputs = model.predict(input_ids, attention_mask, token_type_ids)

    return {
        "urgency": float(outputs["urgency"][0]),
        "importance": float(outputs["importance"][0]),
    }


def evaluate_on_testset(model, tokenizer, test_data_path: str):
    """在测试集上评估本地模型"""
    with open(test_data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict) and "tasks" in data:
        data = data["tasks"]

    preds_u, preds_i = [], []
    true_u, true_i = [], []
    quadrant_correct = 0

    print(f"[Evaluate] 在 {len(data)} 条测试数据上评估...")

    for item in tqdm(data):
        title = item.get("title", "").strip()
        desc = item.get("description", item.get("desc", "")).strip()
        true_urgency = float(item.get("urgency", 0))
        true_importance = float(item.get("importance", 0))

        pred = predict_local(model, tokenizer, title, desc)

        preds_u.append(pred["urgency"])
        preds_i.append(pred["importance"])
        true_u.append(true_urgency)
        true_i.append(true_importance)

        # 四象限判断
        pred_q = 1 if pred["urgency"] >= 0 and pred["importance"] >= 0 else \
                 2 if pred["urgency"] < 0 and pred["importance"] >= 0 else \
                 3 if pred["urgency"] < 0 and pred["importance"] < 0 else 4
        true_q = 1 if true_urgency >= 0 and true_importance >= 0 else \
                 2 if true_urgency < 0 and true_importance >= 0 else \
                 3 if true_urgency < 0 and true_importance < 0 else 4
        if pred_q == true_q:
            quadrant_correct += 1

    preds_u = np.array(preds_u)
    preds_i = np.array(preds_i)
    true_u = np.array(true_u)
    true_i = np.array(true_i)

    def mae(p, t): return np.mean(np.abs(p - t))
    def rmse(p, t): return np.sqrt(np.mean((p - t) ** 2))
    def r2(p, t):
        ss_res = np.sum((t - p) ** 2)
        ss_tot = np.sum((t - np.mean(t)) ** 2)
        return 1 - ss_res / (ss_tot + 1e-8)

    results = {
        "urgency": {
            "mae": mae(preds_u, true_u),
            "rmse": rmse(preds_u, true_u),
            "r2": r2(preds_u, true_u),
            "spearman": spearmanr(preds_u, true_u)[0],
            "kendall": kendalltau(preds_u, true_u)[0],
        },
        "importance": {
            "mae": mae(preds_i, true_i),
            "rmse": rmse(preds_i, true_i),
            "r2": r2(preds_i, true_i),
            "spearman": spearmanr(preds_i, true_i)[0],
            "kendall": kendalltau(preds_i, true_i)[0],
        },
        "quadrant_accuracy": quadrant_correct / len(data),
        "total_samples": len(data),
    }

    return results, preds_u, preds_i, true_u, true_i


def print_results(results: dict):
    """打印评估结果"""
    print(f"\n{'='*60}")
    print("本地模型评估结果")
    print(f"{'='*60}")
    print(f"测试样本数: {results['total_samples']}")
    print(f"\n[Urgency - 紧迫度]")
    print(f"  MAE:      {results['urgency']['mae']:.3f}")
    print(f"  RMSE:     {results['urgency']['rmse']:.3f}")
    print(f"  R2:       {results['urgency']['r2']:.3f}")
    print(f"  Spearman: {results['urgency']['spearman']:.3f}")
    print(f"  Kendall:  {results['urgency']['kendall']:.3f}")
    print(f"\n[Importance - 重要性]")
    print(f"  MAE:      {results['importance']['mae']:.3f}")
    print(f"  RMSE:     {results['importance']['rmse']:.3f}")
    print(f"  R2:       {results['importance']['r2']:.3f}")
    print(f"  Spearman: {results['importance']['spearman']:.3f}")
    print(f"  Kendall:  {results['importance']['kendall']:.3f}")
    print(f"\n[Quadrant - 四象限分类]")
    print(f"  Accuracy: {results['quadrant_accuracy']:.2%}")
    print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="评估本地模型")
    parser.add_argument("--test_data", type=str, default="./data/test.json",
                        help="测试集路径")
    parser.add_argument("--model_path", type=str, default="./checkpoints/best_model",
                        help="模型路径")
    parser.add_argument("--output", type=str, default="./evaluation_results.json",
                        help="结果输出路径")
    args = parser.parse_args()

    print(f"[Load] 加载模型: {args.model_path}")
    model, tokenizer = load_local_model(args.model_path)

    results, preds_u, preds_i, true_u, true_i = evaluate_on_testset(
        model, tokenizer, args.test_data
    )

    print_results(results)

    # 保存结果
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n[Save] 评估结果已保存到 {args.output}")

    # 同时保存原始预测值（用于后续对比分析）
    predictions = {
        "pred_urgency": preds_u.tolist(),
        "pred_importance": preds_i.tolist(),
        "true_urgency": true_u.tolist(),
        "true_importance": true_i.tolist(),
    }
    pred_path = Path(args.output).parent / "predictions.json"
    with open(pred_path, "w", encoding="utf-8") as f:
        json.dump(predictions, f, ensure_ascii=False, indent=2)
    print(f"[Save] 预测值已保存到 {pred_path}")


if __name__ == "__main__":
    main()
