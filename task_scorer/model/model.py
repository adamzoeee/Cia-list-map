"""
MacBERT 双头回归模型
同时预测任务的 urgency（紧迫度）和 importance（重要性）
评分范围: [-5, 5]
"""
import torch
import torch.nn as nn
from transformers import BertPreTrainedModel, BertModel


class TaskScorer(BertPreTrainedModel):
    """
    基于 MacBERT 的双头回归模型
    输入: 任务标题 + 描述（拼接文本）
    输出: urgency (浮点数), importance (浮点数)
    """

    def __init__(self, config, hidden_dropout_prob: float = 0.1):
        super().__init__(config)

        # 兼容 transformers 4.42+ 的 tied weights 检查
        # 必须在 init_weights() 之前设置
        self.all_tied_weights_keys = {}

        # MacBERT 编码器
        self.bert = BertModel(config)

        # 共享的隐藏层
        self.dropout = nn.Dropout(hidden_dropout_prob)
        self.shared_hidden = nn.Linear(config.hidden_size, 128)
        self.activation = nn.GELU()

        # Urgency 回归头
        self.urgency_head = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Dropout(hidden_dropout_prob),
            nn.Linear(64, 1)
        )

        # Importance 回归头
        self.importance_head = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Dropout(hidden_dropout_prob),
            nn.Linear(64, 1)
        )

        # 初始化权重
        self.init_weights()

    def tie_weights(self, **kwargs):
        """
        覆盖父类 BertPreTrainedModel 的 tie_weights 方法。
        TaskScorer 没有需要 tied 的权重（不共享 embedding），
        直接跳过父类复杂的 tied weights 逻辑，避免 transformers 版本兼容问题。
        """
        pass

    def forward(self, input_ids, attention_mask=None, token_type_ids=None,
                urgency_labels=None, importance_labels=None):
        # BERT 编码
        outputs = self.bert(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
        )

        # 取 [CLS] token 的表示
        cls_output = outputs.last_hidden_state[:, 0, :]  # (batch, hidden_size)
        cls_output = self.dropout(cls_output)

        # 共享表示
        shared = self.activation(self.shared_hidden(cls_output))

        # 双头输出
        urgency = self.urgency_head(shared).squeeze(-1)      # (batch,)
        importance = self.importance_head(shared).squeeze(-1) # (batch,)

        # 将输出限制在 [-5, 5] 范围
        urgency = torch.tanh(urgency) * 5.0
        importance = torch.tanh(importance) * 5.0

        loss = None
        if urgency_labels is not None and importance_labels is not None:
            # Huber Loss (Smooth L1)，对异常标注更鲁棒
            huber = nn.SmoothL1Loss(beta=1.0)
            loss_urgency = huber(urgency, urgency_labels)
            loss_importance = huber(importance, importance_labels)
            loss = loss_urgency + loss_importance

        return {
            'loss': loss,
            'urgency': urgency,
            'importance': importance,
        }

    def predict(self, input_ids, attention_mask=None, token_type_ids=None):
        """推理接口：返回 Python 原生类型"""
        self.eval()
        with torch.no_grad():
            outputs = self.forward(
                input_ids=input_ids,
                attention_mask=attention_mask,
                token_type_ids=token_type_ids,
            )
        return {
            'urgency': outputs['urgency'].cpu().numpy(),
            'importance': outputs['importance'].cpu().numpy(),
        }
