"""
合成数据生成脚本（备选方案）
当人工标注数据不足时，可用此脚本调用现有 LLM API 批量生成带标注的训练数据

用法:
    1. 配置环境变量或修改下方 API_KEY / API_URL
    2. cd task_scorer
    3. python scripts/generate_synthetic.py --output ./data/raw/synthetic.json --num 500

注意:
    - 此脚本需要有效的 API Key，会消耗 API 额度
    - 生成后建议人工抽检 10%~20% 确保标注质量
    - 建议与人工标注数据混合使用，比例约 8:2
"""
import os
import json
import random
import argparse
import time
from pathlib import Path
from typing import List, Dict

import requests


# ============== 配置 ==============
# 从环境变量读取 API 配置，也可直接修改下方默认值
API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
API_URL = os.environ.get("DEEPSEEK_API_URL", "https://api.deepseek.com/chat/completions")
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")

# 任务模板库（用于生成多样化的任务描述）
TASK_TEMPLATES = [
    # 高紧迫 + 高重要 (Q1)
    {"template": "明天{time}前要{action}，{reason}", "urgency": (3, 5), "importance": (3, 5)},
    {"template": "今晚必须完成{action}，否则{consequence}", "urgency": (4, 5), "importance": (2, 5)},
    {"template": "客户临时要求{action}，{deadline}", "urgency": (3, 5), "importance": (2, 5)},
    {"template": "{deadline}截止，{action}还没开始", "urgency": (3, 5), "importance": (1, 5)},

    # 低紧迫 + 高重要 (Q2)
    {"template": "计划下个月开始{action}，为{goal}做准备", "urgency": (-4, -1), "importance": (3, 5)},
    {"template": "想学习{skill}，提升自己的{ability}", "urgency": (-5, -2), "importance": (3, 5)},
    {"template": "打算每天抽时间{action}，长期坚持下去", "urgency": (-4, -1), "importance": (2, 5)},
    {"template": "{goal}很重要，但短期内不用急", "urgency": (-4, -2), "importance": (3, 5)},

    # 低紧迫 + 低重要 (Q3)
    {"template": "周末想{action}放松一下", "urgency": (-5, -2), "importance": (-4, -1)},
    {"template": "有空的时候打算{action}，纯属消遣", "urgency": (-5, -1), "importance": (-5, -2)},
    {"template": "刷{platform}上的{content}，打发时间", "urgency": (-5, -2), "importance": (-5, -1)},
    {"template": "朋友约我{action}，但不去也行", "urgency": (-4, -1), "importance": (-3, -1)},

    # 高紧迫 + 低重要 (Q4)
    {"template": "{person}催我{action}，但其实不急", "urgency": (2, 5), "importance": (-3, 0)},
    {"template": "群里要求今天{action}，形式主义", "urgency": (2, 4), "importance": (-4, -1)},
    {"template": "临时通知{action}，很急但没什么用", "urgency": (3, 5), "importance": (-4, 0)},
    {"template": "{action}明天要交，但做好了也没人看", "urgency": (2, 4), "importance": (-3, 0)},
]

ACTIONS = [
    "写报告", "做PPT", "回复邮件", "参加会议", "整理文档",
    "完成项目", "提交申请", "准备面试", "学习Python", "学英语",
    "锻炼身体", "读书", "写日记", "做饭", "打扫房间",
    "看电影", "刷短视频", "打游戏", "逛淘宝", "刷朋友圈",
    "做实验", "写论文", "复习考试", "预习课程", "做笔记",
    "联系客户", "跟进订单", "处理投诉", "安排日程", "制定计划",
]

REASONS = [
    "领导催了好几次", "影响到团队进度", " deadline 快到了",
    "这是关键节点", "关系到绩效考核", "客户很着急",
]

CONSEQUENCES = [
    "会被扣分", "影响团队进度", "客户会不满意", "失去机会",
    "白白浪费时间", "没什么后果",
]

TIMES = ["上午", "下午", "晚上", "凌晨", "中午"]

DEADLINES = ["本周五", "下周一", "月底", "本周内", "三天后", "两周后"]

GOALS = ["职业发展", "技能提升", "身体健康", "财务规划", "人际关系"]

SKILLS = ["Python", "英语", "数据分析", "演讲", "写作", "绘画"]

ABILITIES = ["竞争力", "表达能力", "思维能力", "专业水平"]

PLATFORMS = ["抖音", "B站", "小红书", "微博", "知乎"]

CONTENTS = ["搞笑视频", "美食教程", "旅行攻略", "八卦新闻", "游戏直播"]

PERSONS = ["老板", "导师", "客户", "同事", "家长"]


def generate_task_from_template(template_info: Dict) -> Dict:
    """根据模板生成一条带标注的任务数据"""
    tmpl = template_info["template"]
    urgency_range = template_info["urgency"]
    importance_range = template_info["importance"]

    # 填充模板变量
    text = tmpl.format(
        action=random.choice(ACTIONS),
        reason=random.choice(REASONS),
        consequence=random.choice(CONSEQUENCES),
        time=random.choice(TIMES),
        deadline=random.choice(DEADLINES),
        goal=random.choice(GOALS),
        skill=random.choice(SKILLS),
        ability=random.choice(ABILITIES),
        platform=random.choice(PLATFORMS),
        content=random.choice(CONTENTS),
        person=random.choice(PERSONS),
    )

    # 在范围内随机采样标签值
    urgency = random.randint(urgency_range[0], urgency_range[1])
    importance = random.randint(importance_range[0], importance_range[1])

    return {
        "title": text[:30] + "..." if len(text) > 30 else text,
        "description": text,
        "urgency": urgency,
        "importance": importance,
    }


def call_llm_for_annotation(title: str, description: str) -> Dict:
    """
    调用 LLM API 为任务生成标注
    使用与前端相同的 System Prompt 确保标注一致性
    """
    if not API_KEY:
        raise ValueError("请设置环境变量 DEEPSEEK_API_KEY 或在脚本中配置 API_KEY")

    system_prompt = """你是一个任务管理专家。用户会描述一个任务，你需要分析并返回一个 JSON 对象。

分析维度：
- urgency（时间紧迫度，-5~5分）：deadline 有多近？拖延的后果有多严重？
- importance（任务重要性，-5~5分）：这个任务对目标达成有多关键？

重要规则：
- 娱乐、消遣、刷视频、打游戏等不创造价值的活动，importance 必须评为负数
- 只有对个人成长、工作产出、重要关系有实质帮助的任务，importance 才给正分

严格要求：
1. 只返回一个合法的 JSON 对象，不要包含任何其他文字
2. JSON 格式：{"title":"精简后的任务名","description":"一句话描述","urgency":数字,"importance":数字}
3. title 不超过15个字，description 不超过50个字"""

    user_message = f"任务名称：{title}\n任务描述：{description}"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    }

    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.3,
        "max_tokens": 200,
    }

    try:
        response = requests.post(API_URL, headers=headers, json=body, timeout=30)
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]

        # 解析 JSON
        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            # 尝试从 markdown code block 中提取
            import re
            match = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
            if match:
                result = json.loads(match.group(1).strip())
            else:
                raise ValueError(f"无法解析 LLM 返回: {content}")

        return {
            "title": result.get("title", title),
            "description": result.get("description", description),
            "urgency": max(-5, min(5, round(result.get("urgency", 0)))),
            "importance": max(-5, min(5, round(result.get("importance", 0)))),
        }

    except Exception as e:
        print(f"[Error] API 调用失败: {e}")
        return None


def generate_synthetic_data(num_samples: int, use_llm: bool = False, delay: float = 0.5) -> List[Dict]:
    """
    生成合成数据
    :param num_samples: 生成数量
    :param use_llm: 是否调用 LLM 重新标注（更准但更慢、消耗额度）
    :param delay: API 调用间隔（秒），避免限流
    """
    data = []
    print(f"[Generate] 开始生成 {num_samples} 条合成数据...")

    for i in range(num_samples):
        template = random.choice(TASK_TEMPLATES)
        task = generate_task_from_template(template)

        if use_llm:
            annotated = call_llm_for_annotation(task["title"], task["description"])
            if annotated:
                task = annotated
            time.sleep(delay)

        data.append(task)

        if (i + 1) % 50 == 0:
            print(f"[Generate] 已生成 {i + 1}/{num_samples} 条")

    return data


def main():
    parser = argparse.ArgumentParser(description="生成合成训练数据")
    parser.add_argument("--output", type=str, default="./data/raw/synthetic.json",
                        help="输出文件路径")
    parser.add_argument("--num", type=int, default=500,
                        help="生成数量")
    parser.add_argument("--use_llm", action="store_true",
                        help="调用 LLM API 重新标注（需要 API Key）")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="API 调用间隔（秒）")
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    data = generate_synthetic_data(args.num, use_llm=args.use_llm, delay=args.delay)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n[Done] 已生成 {len(data)} 条数据，保存到 {output_path}")

    # 打印分布统计
    urgencies = [d["urgency"] for d in data]
    importances = [d["importance"] for d in data]
    print(f"\n[Stats] Urgency 分布: min={min(urgencies)}, max={max(urgencies)}, mean={sum(urgencies)/len(urgencies):.1f}")
    print(f"[Stats] Importance 分布: min={min(importances)}, max={max(importances)}, mean={sum(importances)/len(importances):.1f}")


if __name__ == "__main__":
    main()
