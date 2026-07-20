"""
CSV 数据集转换脚本
将队友提供的 CSV 文件转换为训练代码期望的 JSON 格式

用法:
    cd task_scorer
    python scripts/convert_csv_to_json.py

输入:
    - 队友提供的 CSV 文件（包含 days_until_event, event_description, urgency_score, importance_score）
    - event_description 中可能包含逗号，需要智能合并

输出:
    - data/raw/all.json（合并后的训练数据集）
"""
import csv
import json
import argparse
from pathlib import Path


def extract_title(description: str, max_len: int = 20) -> str:
    """从描述中提取标题（前 max_len 个字符）"""
    if len(description) <= max_len:
        return description
    # 尝试在 max_len 范围内找到句末标点
    cut = max_len
    for i in range(max_len, max_len // 2, -1):
        if description[i] in '，。、；！？':
            cut = i + 1
            break
    return description[:cut].strip()


def parse_csv_row(row: list) -> dict:
    """
    智能解析CSV行，处理 event_description 中包含逗号的情况。

    数据格式: days_until_event, event_description, urgency_score, importance_score
    其中 event_description 可能包含逗号，导致列数 > 4。
    策略：第一列是 days，最后两列是 urgency/importance，中间全部是 description。
    """
    if len(row) < 4:
        return None

    # 第一列：days_until_event
    days_raw = row[0].strip()

    # 最后两列：urgency_score, importance_score
    u_raw = row[-2].strip()
    i_raw = row[-1].strip()

    # 中间所有列合并为 event_description
    desc = ','.join(row[1:-2]).strip()

    if not desc or not u_raw or not i_raw:
        return None

    try:
        urgency = int(float(u_raw))
        importance = int(float(i_raw))
    except (ValueError, TypeError):
        return None

    # 限制范围 [-5, 5]
    urgency = max(-5, min(5, urgency))
    importance = max(-5, min(5, importance))

    title = extract_title(desc)
    remaining = desc[len(title):].strip('，。、 ')

    return {
        'title': title,
        'description': remaining,
        'urgency': urgency,
        'importance': importance,
    }


def convert_csv_to_json(csv_paths: list, output_path: str):
    """将多个 CSV 合并转换为一个 JSON 文件"""
    all_data = []
    skipped = 0
    file_counts = []

    for csv_path in csv_paths:
        path = Path(csv_path)
        if not path.exists():
            print(f"[Warning] 文件不存在，跳过: {csv_path}")
            continue

        print(f"[Convert] 处理 {path.name}...")
        count = 0

        with open(path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            if not header:
                print(f"[Warning] 空文件: {csv_path}")
                continue

            for row in reader:
                # 跳过空行
                if not row:
                    skipped += 1
                    continue

                parsed = parse_csv_row(row)
                if parsed is None:
                    skipped += 1
                    continue

                all_data.append(parsed)
                count += 1

        file_counts.append(count)
        print(f"[Convert] {path.name}: {count} 条")

    # 保存
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    with open(output, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*50}")
    print(f"转换完成！")
    print(f"总数据量: {len(all_data)} 条")
    print(f"跳过行数: {skipped} 条")
    print(f"输出路径: {output}")

    # 统计分布
    urgencies = [d['urgency'] for d in all_data]
    importances = [d['importance'] for d in all_data]

    print(f"\n[数据分布统计]")
    print(f"Urgency:    min={min(urgencies)}, max={max(urgencies)}, mean={sum(urgencies)/len(urgencies):.2f}")
    print(f"Importance: min={min(importances)}, max={max(importances)}, mean={sum(importances)/len(importances):.2f}")

    # 四象限分布
    q1 = sum(1 for d in all_data if d['urgency'] >= 0 and d['importance'] >= 0)
    q2 = sum(1 for d in all_data if d['urgency'] < 0 and d['importance'] >= 0)
    q3 = sum(1 for d in all_data if d['urgency'] < 0 and d['importance'] < 0)
    q4 = sum(1 for d in all_data if d['urgency'] >= 0 and d['importance'] < 0)

    print(f"\n[四象限分布]")
    print(f"Q1 (重要且紧急):  {q1} ({q1/len(all_data)*100:.1f}%)")
    print(f"Q2 (重要不紧急):  {q2} ({q2/len(all_data)*100:.1f}%)")
    print(f"Q3 (不重要不紧急): {q3} ({q3/len(all_data)*100:.1f}%)")
    print(f"Q4 (紧急不重要):  {q4} ({q4/len(all_data)*100:.1f}%)")
    print(f"{'='*50}")

    return len(all_data)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='CSV 转 JSON')
    parser.add_argument('--csv', nargs='+', default=[
        r'c:\Users\hiahua\.trae-cn\attachments\6a5d722f955c244618de13f4\560e4397-bdec-4643-b3b0-8b798b7f52d0_043cea8c-f21f-43dc-892f-9bd4f83ba405_1.csv',
        r'c:\Users\hiahua\.trae-cn\attachments\6a5d722f955c244618de13f4\70ae3fe1-fd42-47ec-8770-b3714cab419b_b16165c7-ee3b-4977-8dc3-a77edd66a905_2.csv',
        r'c:\Users\hiahua\.trae-cn\attachments\6a5d722f955c244618de13f4\99747f90-9934-46b8-a86b-f4affcf2e1e4_e5a392c9-7bba-4a06-86c0-894391d38284_3.csv',
        r'c:\Users\hiahua\.trae-cn\attachments\6a5d722f955c244618de13f4\468e264f-9f31-4226-9565-c4e06825842c_ff9de269-ab9f-4201-b04d-65af99386c53_4.csv',
        r'c:\Users\hiahua\.trae-cn\attachments\6a5d722f955c244618de13f4\ddad2308-df4b-4446-9176-fbe098fa89d9_554b800a-47d9-43d1-af00-50009c72448c_5.csv',
        r'c:\Users\hiahua\.trae-cn\attachments\6a5d722f955c244618de13f4\60e51e30-bc4c-4209-bdce-ac14b96900fb_e191be7e-4754-4192-8533-4bddbbd55753_6.csv',
    ], help='CSV 文件路径列表')
    parser.add_argument('--output', default='./data/raw/all.json', help='输出 JSON 路径')
    args = parser.parse_args()

    convert_csv_to_json(args.csv, args.output)
