#!/usr/bin/env python3
"""
从小红书笔记数据中提取面试内容
输入: 笔记列表.xls + 笔记文件夹
输出: 结构化面试内容 JSON
"""

import json
import re
import os
import glob
from pathlib import Path

import pandas as pd

# OCR 支持 (macOS Vision)
try:
    import Vision
    import Quartz
    HAS_OCR = True
except ImportError:
    HAS_OCR = False


def ocr_image(image_path: str) -> str:
    """使用 macOS Vision 框架进行 OCR"""
    if not HAS_OCR:
        return ""
    try:
        url = Quartz.CFURLCreateWithFileSystemPath(
            None, image_path, Quartz.kCFURLPOSIXPathStyle, False
        )
        source = Quartz.CGImageSourceCreateWithURL(url, None)
        image = Quartz.CGImageSourceCreateImageAtIndex(source, 0, None)
        if not image:
            return ""
        handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(image, None)
        request = Vision.VNRecognizeTextRequest.alloc().init()
        request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
        request.setRecognitionLanguages_(['zh-Hans', 'en'])
        request.setUsesLanguageCorrection_(True)
        handler.performRequests_error_([request], None)
        results = []
        for obs in request.results():
            text = obs.topCandidates_(1)[0].string()
            results.append(text)
        return '\n'.join(results)
    except Exception:
        return ""


def ocr_note_images(title: str, notes_path: Path) -> str:
    """对笔记的图片进行 OCR，合并所有图片文本"""
    if not notes_path or not notes_path.exists() or not HAS_OCR:
        return ""
    
    clean_title = re.sub(r'[#\s]+$', '', title).strip()
    
    for folder in notes_path.iterdir():
        if not folder.is_dir():
            continue
        if clean_title not in folder.name and folder.name not in clean_title:
            continue
        
        images = sorted(
            list(folder.glob("*.webp")) + 
            list(folder.glob("*.jpg")) + 
            list(folder.glob("*.png"))
        )
        if not images:
            return ""
        
        all_text = []
        for img_path in images:
            text = ocr_image(str(img_path))
            if text and len(text) > 10:
                all_text.append(text)
        
        if all_text:
            return '\n'.join(all_text)
    
    return ""


# ===== 公司名识别 =====
COMPANY_KEYWORDS = {
    "滴滴": ["滴滴", "didi", "DiDi"],
    "美团": ["美团", "meituan"],
    "字节跳动": ["字节", "字节跳动", "抖音", "tiktok", "TikTok"],
    "阿里": ["阿里", "淘宝", "天猫", "飞猪", "蚂蚁", "菜鸟", "alibaba"],
    "腾讯": ["腾讯", "微信", "tencent"],
    "华为": ["华为", "huawei"],
    "百度": ["百度", "baidu"],
    "京东": ["京东", "JD"],
    "快手": ["快手", "kuaishou"],
    "小红书": ["小红书", "xhs", "RED"],
    "网易": ["网易", "netease"],
    "携程": ["携程", "ctrip", "去哪儿"],
    "得物": ["得物", "毒", "dewu"],
    "拼多多": ["拼多多", "pdd", "PDD"],
    "B站": ["b站", "B站", "哔哩哔哩", "bilibili"],
    "小米": ["小米", "xiaomi"],
    "OPPO": ["oppo", "OPPO"],
    "vivo": ["vivo", "VIVO"],
    "联想": ["联想", "lenovo"],
    "微软": ["微软", "microsoft"],
    "Google": ["google", "Google", "谷歌"],
    "亚马逊": ["亚马逊", "amazon"],
    "虾皮": ["虾皮", "shopee", "Shopee"],
    "Grab": ["grab", "Grab"],
    "蔚来": ["蔚来", "nio"],
    "理想": ["理想汽车", "lixiang"],
    "小鹏": ["小鹏", "xpeng"],
    "比亚迪": ["比亚迪", "byd", "BYD"],
    "米哈游": ["米哈游", "mihoyo"],
    "沐瞳": ["沐瞳", "moonton"],
    "深信服": ["深信服", "sangfor"],
    "蚂蚁": ["蚂蚁", "ant"],
}


def detect_company(title: str, body: str) -> str:
    """从标题和正文中识别公司名"""
    text = f"{title} {body}"
    for company, keywords in COMPANY_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in text.lower():
                return company
    return ""


# ===== 面试轮次识别 =====
ROUND_PATTERNS = [
    (r"(?:一|1|第1|第一)[面面轮]", "一面"),
    (r"(?:二|2|第2|第二)[面面轮]", "二面"),
    (r"(?:三|3|第3|第三)[面面轮]", "三面"),
    (r"(?:四|4|第4|第四)[面面轮]", "四面"),
    (r"(?:终面|hr面|HR面|主管面)", "终面"),
]


def detect_rounds(title: str, body: str) -> list[str]:
    """识别面试轮次"""
    text = f"{title} {body}"
    rounds = []
    for pattern, name in ROUND_PATTERNS:
        if re.search(pattern, text):
            rounds.append(name)
    return rounds


# ===== 技术关键词提取 =====
TECH_KEYWORDS = [
    # Java 基础
    "HashMap", "ArrayList", "LinkedList", "ConcurrentHashMap", "ThreadLocal",
    "volatile", "synchronized", "CAS", "AQS", "线程池", "Goroutine",
    "JVM", "GC", "G1", "CMS", "ZGC", "类加载", "内存模型", "堆", "栈",
    # Spring
    "Spring", "SpringBoot", "SpringCloud", "IOC", "AOP", "事务",
    "Bean", "循环依赖", "自动装配",
    # MySQL
    "MySQL", "索引", "B+树", "事务", "MVCC", "锁", "分库分表",
    "SQL优化", "慢查询", "explain", "联合索引", "最左前缀",
    # Redis
    "Redis", "缓存", "缓存穿透", "缓存击穿", "缓存雪崩",
    "Redis集群", "哨兵", "主从", "分布式锁", "Caffeine",
    "Redis过期策略", "内存淘汰",
    # 消息队列
    "Kafka", "RocketMQ", "RabbitMQ", "MQ", "消息队列",
    "消息丢失", "消息重复", "顺序消费", "消息堆积",
    # 分布式
    "分布式", "微服务", "RPC", "Dubbo", "gRPC",
    "分布式事务", "CAP", "BASE", "一致性",
    "负载均衡", "限流", "熔断", "降级",
    # 系统设计
    "高并发", "高可用", "秒杀", "库存", "超卖",
    "分片", "分库分表", "ShardingSphere",
    # 数据库
    "MongoDB", "Elasticsearch", "ES", "ClickHouse",
    # 容器/DevOps
    "Docker", "K8s", "Kubernetes", "CI/CD", "Nginx",
    # 网络
    "TCP", "UDP", "HTTP", "HTTPS", "WebSocket", "CDN",
    "三次握手", "四次挥手", "DNS",
    # 算法/数据结构
    "链表", "树", "图", "动态规划", "二分", "排序",
    "回溯", "贪心", "手撕", "算法",
    # AI/大模型
    "RAG", "向量", "Embedding", "LLM", "Prompt", "大模型",
    "fine-tune", "微调", "Agent", "AI",
    # 设计模式
    "单例", "工厂", "策略", "观察者", "模板方法", "设计模式",
]


def extract_tech_keywords(body: str) -> list[str]:
    """从正文中提取技术关键词"""
    found = []
    body_lower = body.lower()
    for kw in TECH_KEYWORDS:
        if kw.lower() in body_lower:
            found.append(kw)
    return found


# ===== 面试题目提取 =====
def extract_questions(body: str) -> list[str]:
    """从正文中提取面试题目列表"""
    questions = []
    lines = body.split("\n")

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # 跳过标签行
        if line.startswith("#") and "[话题]" in line:
            continue
        # 跳过纯标签行 (e.g. #后端开发 #java)
        if re.match(r'^#[^#\[]+\[话题\]#', line):
            continue

        # 匹配 Q1: xxx / Q1：xxx
        if re.match(r'^Q\d+[\s\.:：\、]', line, re.IGNORECASE):
            q = re.sub(r'^Q\d+[\s\.:：\、]\s*', '', line)
            if q and len(q) > 3:
                questions.append(q)
            continue

        # 匹配常见题号格式: 1. xxx / 1、xxx / (1) xxx
        if re.match(r'^[\(（]?\d+[\)）]?[\s\.\、\:：]', line):
            q = re.sub(r'^[\(（]?\d+[\)）]?[\s\.\、\:：]\s*', '', line)
            if q and len(q) > 3:
                questions.append(q)
            continue

        # 匹配 bullet: • xxx / - xxx / * xxx / · xxx
        if re.match(r'^[•\-\*·]\s*', line):
            q = re.sub(r'^[•\-\*·]\s*', '', line)
            if q and len(q) > 5:
                questions.append(q)
            continue

        # 匹配 markdown 标题: ### 1. xxx / ## xxx
        m = re.match(r'^#{1,4}\s*(\d+[\.\、])?\s*(.+)', line)
        if m:
            q = m.group(2).strip()
            if q and len(q) > 2:
                questions.append(q)
            continue

        # 匹配"手撕"、"算法"相关
        if ("手撕" in line or "手写" in line) and len(line) > 4:
            questions.append(line)
            continue

        # 匹配 "答题思路:" 后的问题描述
        if "答题思路" in line and len(line) > 10:
            continue  # 跳过答案行

        # 匹配纯文字问题（以问号结尾）
        if line.endswith("？") or line.endswith("?"):
            if len(line) > 8 and not line.startswith("#"):
                questions.append(line)
            continue

        # 匹配以"讲一下"/"说一下"/"介绍"/"解释"/"说说"开头的句子
        if re.match(r'^[讲说解介描分谈谈聊]', line) and len(line) > 8:
            questions.append(line)
            continue

    # 去重
    seen = set()
    unique = []
    for q in questions:
        q_clean = q.strip()
        if q_clean and q_clean not in seen and len(q_clean) > 3:
            seen.add(q_clean)
            unique.append(q_clean)

    return unique


# ===== 按轮次分割面试题 =====
def split_by_round(body: str) -> dict:
    """将面试题按面试轮次分割"""
    rounds = {}
    current_round = "通用"

    # 按轮次分割的正则
    round_pattern = re.compile(
        r"(一面|二面|三面|四面|终面|hr面|HR面|主管面|"
        r"第[一二三四]面|[1-4]面|"
        r"🧩一面|🧩二面|🧩三面|🧩四面)",
        re.IGNORECASE
    )

    parts = round_pattern.split(body)

    for i, part in enumerate(parts):
        if round_pattern.match(part):
            current_round = part.strip()
            # 标准化轮次名
            current_round = re.sub(r"🧩", "", current_round)
            current_round = re.sub(r"[1一二]面", "一面", current_round)
            current_round = re.sub(r"[2二]面", "二面", current_round)
            current_round = re.sub(r"[3三]面", "三面", current_round)
            current_round = re.sub(r"[4四]面", "四面", current_round)
        elif current_round not in rounds:
            rounds[current_round] = part
        else:
            rounds[current_round] += part

    return rounds


# ===== 主流程 =====
def find_txt_content(title: str, notes_path: Path) -> str:
    """从笔记文件夹中查找匹配的 txt 文件"""
    if not notes_path or not notes_path.exists():
        return ""
    
    # 清理标题中的特殊字符用于匹配
    clean_title = re.sub(r'[#\s]+$', '', title).strip()
    
    for folder in notes_path.iterdir():
        if not folder.is_dir():
            continue
        folder_name = folder.name
        # 检查标题是否匹配文件夹名
        if clean_title in folder_name or folder_name in clean_title:
            for f in folder.glob("*.txt"):
                try:
                    with open(f, "r", encoding="utf-8") as tf:
                        content = tf.read()
                        # 去掉"标题:xxx\n内容:"前缀
                        content = re.sub(r'^标题:.*?\n内容:\n?', '', content)
                        return content.strip()
                except Exception:
                    pass
    return ""


def strip_hashtags(text: str) -> str:
    """去掉小红书标签行"""
    lines = text.split('\n')
    filtered = []
    for line in lines:
        line_s = line.strip()
        # 跳过 #xxx[话题]# 格式
        if re.match(r'^#[^#\[]+\[话题\]#', line_s):
            continue
        # 跳过连续的标签行
        if re.match(r'^(#[^#]+?\[话题\]\s*)+$', line_s):
            continue
        filtered.append(line)
    return '\n'.join(filtered).strip()


def process_notes(xls_path: str, notes_dir: str = None):
    """处理所有笔记，提取面试内容"""
    df = pd.read_excel(xls_path)
    notes_path = Path(notes_dir) if notes_dir else None

    results = []
    skipped_reasons = {"no_content": 0, "no_questions": 0, "image_only": 0}
    ocr_count = 0

    for idx, row in df.iterrows():
        title = str(row.get("标题", "") or "")
        body_xls = str(row.get("正文", "") or "")
        note_id = str(row.get("笔记ID", "") or "")
        author = str(row.get("用户名", "") or "")
        likes = row.get("点赞数量", 0)
        favorites = row.get("收藏数量", 0)
        comments = row.get("评论数量", 0)
        pub_time = str(row.get("发布时间", "") or "")
        link = str(row.get("笔记链接", "") or "")

        # 获取 txt 文件内容
        body_txt = find_txt_content(title, notes_path) if notes_path else ""

        # 清理标签
        body_xls_clean = strip_hashtags(body_xls) if body_xls != "nan" else ""
        body_txt_clean = strip_hashtags(body_txt) if body_txt else ""

        # 选择更丰富的内容
        if len(body_txt_clean) > len(body_xls_clean) + 20:
            body = body_txt_clean
            source = "txt"
        elif body_xls_clean:
            body = body_xls_clean
            source = "xls"
        else:
            body = body_txt_clean
            source = "txt"

        if not body or len(body) < 20:
            skipped_reasons["no_content"] += 1
            continue

        # 提取面试题
        questions = extract_questions(body)
        
        # 如果还是提取不到，尝试 OCR
        ocr_used = False
        if not questions and HAS_OCR:
            ocr_count += 1
            if ocr_count % 5 == 0:
                print(f"  [OCR] 已处理 {ocr_count} 篇图片笔记...")
            ocr_text = ocr_note_images(title, notes_path)
            if ocr_text and len(ocr_text) > 30:
                body = ocr_text
                questions = extract_questions(body)
                source = "ocr"
                ocr_used = True
        
        # 如果还是提取不到，标记为图片笔记
        if not questions:
            # 检查是否有图片（可能是图片笔记）
            img_count = 0
            if notes_path:
                clean_title = re.sub(r'[#\s]+$', '', title).strip()
                for folder in notes_path.iterdir():
                    if folder.is_dir() and (clean_title in folder.name or folder.name in clean_title):
                        img_count = len(list(folder.glob("*.webp")) + list(folder.glob("*.jpg")) + list(folder.glob("*.png")))
                        break
            if img_count > 0:
                skipped_reasons["image_only"] += 1
            else:
                skipped_reasons["no_questions"] += 1
            continue

        # 分析
        company = detect_company(title, body)
        rounds = detect_rounds(title, body)
        tech_kws = extract_tech_keywords(body)
        round_content = split_by_round(body)

        # 按轮次提取题目
        round_questions = {}
        for round_name, round_body in round_content.items():
            rq = extract_questions(round_body)
            if rq:
                round_questions[round_name] = rq

        results.append({
            "note_id": note_id,
            "title": title,
            "author": author,
            "company": company,
            "rounds": rounds,
            "pub_time": pub_time,
            "likes": int(likes) if pd.notna(likes) else 0,
            "favorites": int(favorites) if pd.notna(favorites) else 0,
            "comments": int(comments) if pd.notna(comments) else 0,
            "tech_keywords": tech_kws,
            "questions": questions,
            "round_questions": round_questions,
            "link": link,
            "source": source,
        })

    # 打印跳过统计
    print(f"\n  [统计] 跳过原因:")
    print(f"    无内容: {skipped_reasons['no_content']}")
    print(f"    图片笔记(需OCR): {skipped_reasons['image_only']}")
    print(f"    无匹配题目: {skipped_reasons['no_questions']}")

    return results


def generate_summary(results: list) -> dict:
    """生成统计摘要"""
    total = len(results)
    total_questions = sum(len(r["questions"]) for r in results)

    # 公司统计
    company_counts = {}
    for r in results:
        c = r["company"] or "未知"
        company_counts[c] = company_counts.get(c, 0) + 1
    company_sorted = sorted(company_counts.items(), key=lambda x: -x[1])

    # 技术关键词统计
    tech_counts = {}
    for r in results:
        for kw in r["tech_keywords"]:
            tech_counts[kw] = tech_counts.get(kw, 0) + 1
    tech_sorted = sorted(tech_counts.items(), key=lambda x: -x[1])[:30]

    return {
        "total_notes": total,
        "total_questions": total_questions,
        "company_distribution": dict(company_sorted),
        "top_tech_keywords": dict(tech_sorted),
    }


def main():
    xls_path = "/Users/shentao/Downloads/笔记_20260621_1782026000/笔记列表.xls"
    notes_dir = "/Users/shentao/Downloads/笔记_20260621_1782026000/笔记"
    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    print("[...] 处理笔记中...")
    results = process_notes(xls_path, notes_dir)

    # 保存完整数据
    output_file = output_dir / "interview_questions_extracted.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"[✓] 已提取 {len(results)} 篇面试笔记")
    print(f"    保存到: {output_file}")

    # 统计摘要
    summary = generate_summary(results)
    summary_file = output_dir / "interview_summary.json"
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    # 打印摘要
    print(f"\n{'=' * 50}")
    print(f"  面试内容提取摘要")
    print(f"{'=' * 50}")
    print(f"\n  总笔记数: {summary['total_notes']}")
    print(f"  总面试题数: {summary['total_questions']}")

    print(f"\n  公司分布 (Top 10):")
    for company, count in list(summary["company_distribution"].items())[:10]:
        print(f"    {company}: {count} 篇")

    print(f"\n  高频技术关键词 (Top 15):")
    for kw, count in list(summary["top_tech_keywords"].items())[:15]:
        print(f"    {kw}: {count} 次")

    # 生成按公司分类的面试题汇总
    by_company = {}
    for r in results:
        c = r["company"] or "其他"
        if c not in by_company:
            by_company[c] = []
        by_company[c].append(r)

    company_file = output_dir / "interview_by_company.json"
    company_output = {}
    for company, notes in sorted(by_company.items(), key=lambda x: -len(x[1])):
        all_qs = []
        for n in notes:
            for q in n["questions"]:
                all_qs.append({"question": q, "source": n["title"]})
        company_output[company] = {
            "note_count": len(notes),
            "total_questions": len(all_qs),
            "questions": all_qs,
        }

    with open(company_file, "w", encoding="utf-8") as f:
        json.dump(company_output, f, ensure_ascii=False, indent=2)
    print(f"\n  按公司分类已保存到: {company_file}")

    # 打印每个公司的面试题示例
    print(f"\n{'=' * 50}")
    print(f"  面试题示例")
    print(f"{'=' * 50}")

    for company in ["滴滴", "美团", "字节跳动", "阿里", "华为"]:
        if company in company_output:
            data = company_output[company]
            print(f"\n  【{company}】({data['note_count']} 篇, {data['total_questions']} 题)")
            for q in data["questions"][:8]:
                print(f"    • {q['question']}")
            if len(data["questions"]) > 8:
                print(f"    ... 还有 {len(data['questions']) - 8} 题")


if __name__ == "__main__":
    main()
