"""
手动生成 Q3（不重要不紧急）数据并追加到 all.json
Q3 定义: urgency < 0 且 importance < 0
"""
import json
import random
from pathlib import Path

Q3_TEMPLATES = [
    # urgency: -1, importance: -1 ~ -2（轻度Q3）
    {"text": "下个月想去公园野餐但天气不好就算了", "u": -1, "i": -2},
    {"text": "半个月后想整理衣柜但懒得动", "u": -1, "i": -3},
    {"text": "二十天后想给旧手机充个电看看照片", "u": -1, "i": -2},
    {"text": "一个月后想试着做一道新菜但可学可不学", "u": -1, "i": -2},
    {"text": "下个月想去旧书店淘书但没什么特别想买的", "u": -1, "i": -1},
    {"text": "二十天后想清理电脑桌面图标但一直拖着", "u": -1, "i": -2},
    {"text": "一个月后想试试冥想但估计坚持不了", "u": -1, "i": -2},
    {"text": "下个月想去江边散步但一个人不想去", "u": -1, "i": -1},
    {"text": "二十天后想整理微信收藏的文章但都是垃圾", "u": -1, "i": -3},
    {"text": "一个月后想学折纸但手残估计学不会", "u": -1, "i": -2},
    {"text": "下个月想去花鸟市场看鱼但不买", "u": -1, "i": -1},
    {"text": "二十天后想给盆栽浇点水但还不干", "u": -1, "i": -1},
    {"text": "一个月后想听一张冷门专辑打发时间", "u": -1, "i": -2},
    {"text": "下个月想去图书馆随便翻翻杂志", "u": -1, "i": -1},
    {"text": "二十天后想清理手机里的截图但太多了", "u": -1, "i": -2},
    {"text": "一个月后想试试做手账但可能三天热度", "u": -1, "i": -2},
    {"text": "下个月想去商场吹空调顺便走走", "u": -1, "i": -1},
    {"text": "二十天后想整理抽屉里的杂物但无所谓", "u": -1, "i": -2},
    {"text": "一个月后想玩一个简单的拼图但没什么意义", "u": -1, "i": -2},
    {"text": "下个月想去天台看看夕阳但懒得爬", "u": -1, "i": -1},

    # urgency: -2, importance: -1 ~ -3（中度Q3）
    {"text": "两个月后想去爬山看红叶但时间还早", "u": -2, "i": -1},
    {"text": "三个月后想通关塞尔达传说但进度还早", "u": -2, "i": -1},
    {"text": "两个月后想去看一场老电影重映但可去可不去", "u": -2, "i": -1},
    {"text": "三个月后想参加一个线上画画打卡但可能忘记", "u": -2, "i": -2},
    {"text": "两个月后想去看一场话剧但票价略高在犹豫", "u": -2, "i": -1},
    {"text": "三个月后想玩一款新出的种田游戏但还在观望", "u": -2, "i": -1},
    {"text": "两个月后想去古镇走走但交通不太方便", "u": -2, "i": -1},
    {"text": "三个月后想学习简单的摄影但设备一般", "u": -2, "i": -2},
    {"text": "两个月后想整理旧相册回忆但浪费时间", "u": -2, "i": -3},
    {"text": "三个月后想尝试做蛋糕但怕做不好", "u": -2, "i": -1},
    {"text": "两个月后想去看一场足球赛但同伴不确定", "u": -2, "i": -1},
    {"text": "三个月后想学一点简单的日语但没用处", "u": -2, "i": -2},
    {"text": "两个月后想去植物园看花但花期不确定", "u": -2, "i": -1},
    {"text": "三个月后想整理邮箱里的垃圾邮件但太麻烦", "u": -2, "i": -2},
    {"text": "两个月后想玩一个解谜游戏但攻略太难", "u": -2, "i": -1},
    {"text": "三个月后想去海边看一次日出但起不来", "u": -2, "i": -1},
    {"text": "两个月后想学一个魔术但没啥实际用处", "u": -2, "i": -2},
    {"text": "三个月后想去看一次艺术展但不太懂", "u": -2, "i": -1},
    {"text": "两个月后想听一期哲学播客催眠用", "u": -2, "i": -1},
    {"text": "三个月后想整理书柜里的旧书卖二手", "u": -2, "i": -1},

    # urgency: -3, importance: -1 ~ -3（较深度Q3）
    {"text": "半年后想去旅游一趟但还没计划去哪里", "u": -3, "i": -1},
    {"text": "四个月后想学习油画但估计坚持不下去", "u": -3, "i": -2},
    {"text": "半年后想参加一个线上马拉松但佛系跑", "u": -3, "i": -1},
    {"text": "五个月后想玩一个策略游戏但规则复杂", "u": -3, "i": -1},
    {"text": "半年后想去看一场音乐节但阵容一般", "u": -3, "i": -1},
    {"text": "四个月后想写一本日记但没什么可写的", "u": -3, "i": -2},
    {"text": "半年后想养一只猫但还没决定", "u": -3, "i": -1},
    {"text": "五个月后想学习陶艺但附近没有工作室", "u": -3, "i": -1},
    {"text": "半年后想整理电脑里的旧文件但太多了", "u": -3, "i": -2},
    {"text": "四个月后想玩一个恐怖游戏但不敢玩", "u": -3, "i": -1},
    {"text": "半年后想去一个冷门博物馆但可去可不去", "u": -3, "i": -1},
    {"text": "五个月后想学一段舞蹈但肢体不协调", "u": -3, "i": -1},
    {"text": "半年后想去看一场乒乓球赛但可选时间很多", "u": -3, "i": -1},
    {"text": "四个月后想玩一个文字冒险游戏但没时间", "u": -3, "i": -1},
    {"text": "半年后想学习插花但没什么必要", "u": -3, "i": -2},
    {"text": "五个月后想去看一场舞台剧但可能睡着", "u": -3, "i": -1},
    {"text": "半年后想学习木工做一个小板凳", "u": -3, "i": -1},
    {"text": "四个月后想整理旧磁带和CD但设备坏了", "u": -3, "i": -2},
    {"text": "半年后想学习篆刻但工具太贵", "u": -3, "i": -1},
    {"text": "五个月后想去湿地公园但交通麻烦", "u": -3, "i": -1},

    # urgency: -4, importance: -1 ~ -4（深度Q3）
    {"text": "一年后想学钢琴但担心坚持不下去", "u": -4, "i": -1},
    {"text": "八个月后想写一本小说但没什么灵感", "u": -4, "i": -2},
    {"text": "一年后想去西藏旅游但身体可能受不了", "u": -4, "i": -1},
    {"text": "九个月后想学习编程但 age 大了怕学不会", "u": -4, "i": -1},
    {"text": "一年后想考潜水证但恐水", "u": -4, "i": -1},
    {"text": "八个月后想学习击剑但附近没有馆", "u": -4, "i": -1},
    {"text": "一年后想开一个小红书账号分享生活但怕没人看", "u": -4, "i": -2},
    {"text": "九个月后想学习滑雪但怕冷", "u": -4, "i": -1},
    {"text": "一年后想养一只狗但家里太小", "u": -4, "i": -1},
    {"text": "八个月后想学做西餐但平时吃食堂", "u": -4, "i": -1},
    {"text": "一年后想参加一次马拉松但体能不行", "u": -4, "i": -1},
    {"text": "九个月后想学书法但字太丑怕丢人", "u": -4, "i": -2},
    {"text": "一年后想去国外旅游但语言不通", "u": -4, "i": -1},
    {"text": "八个月后想学习调酒但没什么场合用", "u": -4, "i": -2},
    {"text": "一年后想做一个个人博客但没什么内容", "u": -4, "i": -2},
    {"text": "九个月后想学习瑜伽但柔韧性太差", "u": -4, "i": -1},
    {"text": "一年后想考一个没用的证书充实简历", "u": -4, "i": -3},
    {"text": "八个月后想学习缝纫做一件裙子但手笨", "u": -4, "i": -1},
    {"text": "一年后想去跳伞但胆子小", "u": -4, "i": -1},
    {"text": "九个月后想学习塔罗牌但觉得迷信", "u": -4, "i": -2},

    # urgency: -5, importance: -1 ~ -5（极深度Q3，纯幻想型）
    {"text": "五年后想退休搬到乡下种菜但还早得很", "u": -5, "i": -1},
    {"text": "三年后想开一家咖啡店但完全没经验", "u": -5, "i": -2},
    {"text": "五年后想学开飞机但太贵了", "u": -5, "i": -1},
    {"text": "三年后想写一本自传但人生平平无奇", "u": -5, "i": -2},
    {"text": "五年后想环球旅行但存款不够", "u": -5, "i": -1},
    {"text": "三年后想学一门失传的手艺但找不到师傅", "u": -5, "i": -1},
    {"text": "五年后想建一个树屋但没地", "u": -5, "i": -1},
    {"text": "三年后想参加一次极光之旅但怕冻", "u": -5, "i": -1},
    {"text": "五年后想学骑马但城市里没有马场", "u": -5, "i": -1},
    {"text": "三年后想制作一部微电影但不懂拍摄", "u": -5, "i": -2},
    {"text": "五年后想去深海潜水但有深海恐惧症", "u": -5, "i": -1},
    {"text": "三年后想学习建筑设计但数学不好", "u": -5, "i": -1},
    {"text": "五年后想养一匹马但养不起", "u": -5, "i": -1},
    {"text": "三年后想学开帆船但没海", "u": -5, "i": -1},
    {"text": "五年后想建立一个公益图书馆但没资源", "u": -5, "i": -1},
    {"text": "三年后想学习鸟类语言但似乎不可能", "u": -5, "i": -2},
    {"text": "五年后想种一片竹林等竹笋长大", "u": -5, "i": -1},
    {"text": "三年后想学习古代文字但没人交流", "u": -5, "i": -2},
    {"text": "五年后想去火星旅游但技术不成熟", "u": -5, "i": -1},
    {"text": "三年后想培养一种新爱好但不知道选什么", "u": -5, "i": -2},
]


def extract_title(description: str, max_len: int = 20) -> str:
    if len(description) <= max_len:
        return description
    cut = max_len
    for i in range(max_len, max_len // 2, -1):
        if description[i] in '，。、；！？':
            cut = i + 1
            break
    return description[:cut].strip()


def generate_q3_data():
    data = []
    for template in Q3_TEMPLATES:
        text = template["text"]
        title = extract_title(text)
        remaining = text[len(title):].strip('，。、 ')
        data.append({
            'title': title,
            'description': remaining,
            'urgency': template["u"],
            'importance': template["i"],
        })
    return data


def append_to_json(new_data, json_path):
    path = Path(json_path)
    if path.exists():
        with open(path, 'r', encoding='utf-8') as f:
            existing = json.load(f)
    else:
        existing = []

    existing.extend(new_data)

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    return len(existing)


def print_stats(data):
    urgencies = [d['urgency'] for d in data]
    importances = [d['importance'] for d in data]

    q1 = sum(1 for d in data if d['urgency'] >= 0 and d['importance'] >= 0)
    q2 = sum(1 for d in data if d['urgency'] < 0 and d['importance'] >= 0)
    q3 = sum(1 for d in data if d['urgency'] < 0 and d['importance'] < 0)
    q4 = sum(1 for d in data if d['urgency'] >= 0 and d['importance'] < 0)

    print(f"\n{'='*50}")
    print(f"总数据量: {len(data)} 条")
    print(f"\n[四象限分布]")
    print(f"Q1 (重要且紧急):  {q1} ({q1/len(data)*100:.1f}%)")
    print(f"Q2 (重要不紧急):  {q2} ({q2/len(data)*100:.1f}%)")
    print(f"Q3 (不重要不紧急): {q3} ({q3/len(data)*100:.1f}%)")
    print(f"Q4 (紧急不重要):  {q4} ({q4/len(data)*100:.1f}%)")
    print(f"{'='*50}")


if __name__ == '__main__':
    print("[Generate] 生成 Q3 数据...")
    q3_data = generate_q3_data()
    print(f"[Generate] 生成 {len(q3_data)} 条 Q3 数据")

    json_path = './data/raw/all.json'
    total = append_to_json(q3_data, json_path)
    print(f"[Append] 已追加到 {json_path}，当前总量 {total} 条")

    # 重新统计
    with open(json_path, 'r', encoding='utf-8') as f:
        all_data = json.load(f)
    print_stats(all_data)
