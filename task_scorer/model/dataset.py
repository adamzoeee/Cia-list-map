"""
数据集加载与预处理
支持从 JSON 文件加载训练/验证/测试数据
"""
import json
import os
from typing import List, Dict, Tuple
import torch
from torch.utils.data import Dataset
from transformers import BertTokenizer


class TaskDataset(Dataset):
    """
    任务评分数据集
    每条数据: {"title": str, "description": str, "urgency": int(-5~5), "importance": int(-5~5)}
    """

    def __init__(
        self,
        data_path: str,
        tokenizer: BertTokenizer,
        max_length: int = 128,
    ):
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.samples = self._load_data(data_path)

    def _load_data(self, path: str) -> List[Dict]:
        """加载 JSON 数据文件"""
        if not os.path.exists(path):
            raise FileNotFoundError(f"数据文件不存在: {path}")

        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # 支持两种格式：直接数组 或 {"tasks": [...]}
        if isinstance(data, dict) and 'tasks' in data:
            data = data['tasks']

        # 数据校验与清洗
        cleaned = []
        for item in data:
            title = item.get('title', '').strip()
            desc = item.get('description', item.get('desc', '')).strip()

            # 如果没有 description，至少要有 title
            text = title
            if desc:
                text = f"{title}。{desc}"

            if not text:
                continue

            # 标签处理：确保在 [-5, 5] 范围内
            urgency = float(item.get('urgency', item.get('urgency_score', 0)))
            importance = float(item.get('importance', item.get('importance_score', 0)))
            urgency = max(-5, min(5, urgency))
            importance = max(-5, min(5, importance))

            cleaned.append({
                'text': text,
                'urgency': urgency,
                'importance': importance,
            })

        print(f"[Dataset] 加载 {len(cleaned)} 条数据 from {path}")
        return cleaned

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        sample = self.samples[idx]

        encoding = self.tokenizer(
            sample['text'],
            max_length=self.max_length,
            padding='max_length',
            truncation=True,
            return_tensors='pt',
        )

        return {
            'input_ids': encoding['input_ids'].squeeze(0),
            'attention_mask': encoding['attention_mask'].squeeze(0),
            'token_type_ids': encoding.get('token_type_ids', torch.zeros(self.max_length)).squeeze(0),
            'urgency_labels': torch.tensor(sample['urgency'], dtype=torch.float32),
            'importance_labels': torch.tensor(sample['importance'], dtype=torch.float32),
        }


def collate_fn(batch: List[Dict]) -> Dict[str, torch.Tensor]:
    """DataLoader 的批处理函数"""
    return {
        'input_ids': torch.stack([item['input_ids'] for item in batch]),
        'attention_mask': torch.stack([item['attention_mask'] for item in batch]),
        'token_type_ids': torch.stack([item['token_type_ids'] for item in batch]),
        'urgency_labels': torch.stack([item['urgency_labels'] for item in batch]),
        'importance_labels': torch.stack([item['importance_labels'] for item in batch]),
    }


def split_dataset(data_path: str, train_path: str, val_path: str, test_path: str,
                  train_ratio=0.7, val_ratio=0.2, seed=42):
    """
    将原始数据文件按比例拆分为训练/验证/测试集
    如果拆分后的文件已存在则跳过
    """
    if all(os.path.exists(p) for p in [train_path, val_path, test_path]):
        print("[Dataset] 拆分文件已存在，跳过")
        return

    import random
    random.seed(seed)

    with open(data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if isinstance(data, dict) and 'tasks' in data:
        data = data['tasks']

    random.shuffle(data)
    n = len(data)
    n_train = int(n * train_ratio)
    n_val = int(n * val_ratio)

    train_data = data[:n_train]
    val_data = data[n_train:n_train + n_val]
    test_data = data[n_train + n_val:]

    for path, subset in [(train_path, train_data), (val_path, val_data), (test_path, test_data)]:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(subset, f, ensure_ascii=False, indent=2)
        print(f"[Dataset] 保存 {len(subset)} 条数据 -> {path}")
