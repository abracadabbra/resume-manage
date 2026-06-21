#!/usr/bin/env python3
"""
增强版面试题提取 - 处理之前跳过的45篇笔记
合并 txt + OCR 内容，放宽提取规则
"""
import json
import re
import glob
from pathlib import Path

import pandas as pd

try:
    import Vision
    import Quartz
    HAS_OCR = True
except ImportError:
    HAS_OCR = False


BASE_DIR = Path('/Users/shentao/Downloads/笔记_20260621_1782026000')
XLS_PATH = BASE_DIR / '笔记列表.xls'
NOTES_DIR = BASE_DIR / '笔记'
OUTPUT_DIR = Path(__file__).parent / 'output'

COMPANY_KEYWORDS = {
    "滴滴": ["滴滴", "didi"],
    "美团": ["美团", "meituan"],
    "字节跳动": ["字节", "字节跳动", "抖音", "tiktok"],
    "阿里": ["阿里", "淘宝", "天猫", "飞猪", "蚂蚁", "菜鸟"],
    "腾讯": ["腾讯", "微信"],
    "华为": ["华为"],
    "百度": ["百度"],
    "京东": ["京东", "JD"],
    "快手": ["快手"],
    "小红书": ["小红书"],
    "网易": ["网易"],
    "携程": ["携程", "去哪儿"],
    "得物": ["得物", "dewu"],
    "拼多多": ["拼多多", "pdd"],
    "B站": ["b站", "B站", "哔哩哔哩", "bilibili"],
    "小米": ["小米"],
    "米哈游": ["米哈游", "mihoyo"],
    "沐瞳": ["沐瞳", "moonton"],
    "蚂蚁": ["蚂蚁"],
    "特斯拉": ["特斯拉", "tesla"],
    "顺丰": ["顺丰"],
    "平安": ["平安"],
    "盒马": ["盒马"],
    "懂车帝": ["懂车帝"],
    "小鹏": ["小鹏"],
    "影石": ["影石"],
    "钉钉": ["钉钉"],
    "搜狗": ["搜狗"],
    "畅捷通": ["畅捷通"],
}

TECH_KEYWORDS = [
    "HashMap", "ArrayList", "LinkedList", "ConcurrentHashMap", "ThreadLocal",
    "volatile", "synchronized", "CAS", "AQS", "线程池",
    "JVM", "GC", "G1", "CMS", "ZGC", "类加载",
    "Spring", "SpringBoot", "SpringCloud", "IOC", "AOP", "事务",
    "MySQL", "索引", "B+树", "MVCC", "分库分表", "SQL优化",
    "Redis", "缓存", "缓存穿透", "缓存击穿", "缓存雪崩", "分布式锁",
    "Kafka", "RocketMQ", "RabbitMQ", "消息队列", "消息丢失",
    "分布式", "微服务", "RPC", "Dubbo", "gRPC",
    "分布式事务", "CAP", "负载均衡", "限流", "熔断",
    "高并发", "秒杀", "库存", "超卖", "分片",
    "MongoDB", "Elasticsearch", "ES",
    "Docker", "K8s", "Nginx",
    "TCP", "HTTP", "HTTPS", "WebSocket", "CDN",
    "链表", "树", "动态规划", "二分", "排序", "手撕", "算法",
    "RAG", "LLM", "Prompt", "大模型", "AI",
    "单例", "工厂", "策略", "观察者", "模板方法", "设计模式",
    "Python", "Go", "C++", "PHP",
]


def ocr_image(image_path: str) -> str:
    if not HAS_OCR:
        return ""
    try:
        url = Quartz.CFURLCreateWithFileSystemPath(None, image_path, Quartz.kCFURLPOSIXPathStyle, False)
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
        return '\n'.join([obs.topCandidates_(1)[0].string() for obs in request.results()])
    except Exception:
        return ""


def find_note_folder(title: str) -> Path:
    """查找笔记对应的文件夹"""
    clean_title = re.sub(r'[#\s]+$', '', title).strip()
    for folder in NOTES_DIR.iterdir():
        if folder.is_dir() and (clean_title in folder.name or folder.name in clean_title):
            return folder
    return None


def get_txt_content(folder: Path) -> str:
    """读取 txt 文件"""
    if not folder:
        return ""
    for f in folder.glob('*.txt'):
        try:
            content = f.read_text(encoding='utf-8')
            content = re.sub(r'^标题:.*?\n内容:\n?', '', content)
            return content.strip()
        except Exception:
            pass
    return ""


def get_ocr_content(folder: Path) -> str:
    """对图片做 OCR"""
    if not folder or not HAS_OCR:
        return ""
    images = sorted(
        list(folder.glob('*.webp')) +
        list(folder.glob('*.jpg')) +
        list(folder.glob('*.png'))
    )
    if not images:
        return ""
    texts = []
    for img in images:
        text = ocr_image(str(img))
        if text and len(text) > 5:
            texts.append(text)
    return '\n'.join(texts)


def strip_hashtags(text: str) -> str:
    """去掉小红书标签"""
    lines = text.split('\n')
    filtered = []
    for line in lines:
        s = line.strip()
        if re.match(r'^#[^#\[]+\[话题\]#', s):
            continue
        if re.match(r'^(#[^#]+?\[话题\]\s*)+$', s):
            continue
        filtered.append(line)
    return '\n'.join(filtered).strip()


def detect_company(title: str, body: str) -> str:
    text = f"{title} {body}"
    for company, keywords in COMPANY_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in text.lower():
                return company
    return ""


def extract_tech_keywords(body: str) -> list[str]:
    found = []
    body_lower = body.lower()
    for kw in TECH_KEYWORDS:
        if kw.lower() in body_lower:
            found.append(kw)
    return found


_PROSE_MARKERS = [
    "然后", "接下来", "面试官说", "面试官问",
    "他问", "她说", "他说", "我说", "我答", "我回答",
    "我忘记", "记不清", "又开始问", "又开始",
]


def is_prose_question(text: str) -> bool:
    if len(text) <= 300:
        return False
    if text.rstrip().endswith(("?", "？")):
        return False
    marker_hits = sum(1 for m in _PROSE_MARKERS if m in text)
    return marker_hits >= 2


def is_code_block(text: str) -> bool:
    t = text.strip()
    if "```" in t:
        return True
    sql_kw = ("SELECT ", "INSERT ", "UPDATE ", "DELETE ", "FROM ", "WHERE ")
    if sum(1 for k in sql_kw if k in t) >= 2:
        return True
    if "def " in t and ":" in t and "\n" in t:
        return True
    if "function " in t and "{" in t and "}" in t:
        return True
    if "class " in t and "{" in t and "}" in t:
        return True
    return False


def is_truncated(text: str) -> bool:
    t = text.strip()
    if len(t) >= 25:
        return False
    if t.endswith(("?", "？", ".", "。", ":", "：", ",", "，", "别", "差异", "对比")):
        return False
    return True


def extract_questions_aggressive(body: str) -> list[str]:
    """增强版题目提取 - 多行合并 + 代码块/截断/散文感知"""
    questions = []
    lines = body.split('\n')

    patterns = [
        r'^[\s]*[\(（]?[\d①②③④⑤⑥⑦⑧⑨⑩❶❷❸❹❺❻❼❽❾❿]+[\)）]?[\s\.、\:：\.\,，]',
        r'^[\s]*Q\d+[\s\.\:：、]',
        r'^[\s]*[•\-\*·▫✅🔹▪►▶]\s*',
        r'^#{1,4}\s*(\d+[\.\、])?\s*',
        r'^[\s]*[\d][️⃣]\s*',
    ]

    max_continuation = 4

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line or len(line) < 4:
            i += 1
            continue

        if re.match(r'^#[^#\[]+\[话题\]#', line):
            i += 1
            continue

        matched = None
        for pat in patterns:
            if re.match(pat, line):
                matched = pat
                break

        if not matched:
            if ('手撕' in line or '手写' in line) and len(line) > 4:
                questions.append(line)
                i += 1
                continue
            if (line.endswith('？') or line.endswith('?')) and len(line) > 8 and not line.startswith('#'):
                questions.append(line)
                i += 1
                continue
            if re.match(r'^[讲说解介描分谈谈聊请说]', line) and len(line) > 8:
                questions.append(line)
                i += 1
                continue
            question_kws = ['怎么', '如何', '为什么', '什么是', '区别', '原理',
                            '底层', '实现', '优缺点', '场景', '用法', '作用',
                            '对比', '有哪些', '什么时候', '触发']
            if any(kw in line and len(line) > 10 for kw in question_kws) and not line.startswith('#'):
                questions.append(line)
                i += 1
                continue
            i += 1
            continue

        # 命中题号：吸收首行 + 最多 4 行续行
        q = re.sub(matched, '', line).strip()
        q = re.split(r'答题[思要]路[：:]?', q)[0].strip()

        # 如果当前行已是代码块，整段吃下来直到收尾
        collected_extra = 0
        if is_code_block(q):
            j = i + 1
            buf = [q]
            while j < len(lines) and collected_extra < 20:
                nxt = lines[j].rstrip()
                if not nxt.strip():
                    break
                # 见到新的题号则停止
                if any(re.match(p, nxt.strip()) for p in patterns):
                    break
                buf.append(nxt)
                collected_extra += 1
                j += 1
            q = '\n'.join(buf).strip()
            i = j
        else:
            j = i + 1
            while j < len(lines) and collected_extra < max_continuation:
                nxt = lines[j].strip()
                if not nxt:
                    j += 1
                    break  # 空行作为段落分隔
                if any(re.match(p, nxt) for p in patterns):
                    break
                if nxt.startswith('#') and len(nxt) > 1:
                    break
                q += ' ' + nxt
                collected_extra += 1
                j += 1
            i = j

        if not q or len(q) <= 3:
            continue

        if is_prose_question(q):
            continue

        if is_truncated(q):
            continue

        questions.append(q)

    seen = set()
    unique = []
    for q in questions:
        q = q.strip()
        if q and q not in seen and len(q) > 3:
            seen.add(q)
            unique.append(q)
    return unique


def main():
    # 加载已提取的数据
    extracted_file = OUTPUT_DIR / 'interview_questions_extracted.json'
    with open(extracted_file, 'r') as f:
        existing = json.load(f)
    extracted_titles = {r['title'] for r in existing}

    # 加载 XLS
    df = pd.read_excel(XLS_PATH)

    new_results = []
    ocr_count = 0

    for idx, row in df.iterrows():
        title = str(row.get('标题', '') or '')
        if title in extracted_titles:
            continue

        body_xls = str(row.get('正文', '') or '')
        body_xls = '' if body_xls == 'nan' else body_xls
        note_id = str(row.get('笔记ID', '') or '')
        author = str(row.get('用户名', '') or '')
        likes = row.get('点赞数量', 0)
        favorites = row.get('收藏数量', 0)
        comments = row.get('评论数量', 0)
        pub_time = str(row.get('发布时间', '') or '')
        link = str(row.get('笔记链接', '') or '')

        # 找文件夹
        folder = find_note_folder(title)

        # 获取 txt 内容
        txt_content = get_txt_content(folder) if folder else ''

        # 清理标签
        body_xls_clean = strip_hashtags(body_xls)
        txt_clean = strip_hashtags(txt_content)

        # 合并 XLS + txt
        combined_text = body_xls_clean
        if txt_clean and len(txt_clean) > 20:
            if combined_text:
                combined_text += '\n' + txt_clean
            else:
                combined_text = txt_clean

        # 先尝试从合并文本提取
        questions = extract_questions_aggressive(combined_text)
        source = 'text'

        # 如果提取不到，做 OCR
        if len(questions) < 2 and folder:
            ocr_count += 1
            if ocr_count % 5 == 0:
                print(f'  [OCR] 已处理 {ocr_count} 篇...')
            ocr_text = get_ocr_content(folder)
            if ocr_text:
                # OCR + 已有文本合并
                full_text = combined_text + '\n' + ocr_text if combined_text else ocr_text
                questions = extract_questions_aggressive(full_text)
                if questions:
                    source = 'ocr'
                    combined_text = full_text

        if not questions:
            # 最后手段：如果文本足够长，把整段作为"面试内容描述"
            if len(combined_text) > 50:
                questions = [combined_text[:200] + '...']
                source = 'raw'
            else:
                continue

        company = detect_company(title, combined_text)
        tech_kws = extract_tech_keywords(combined_text)

        new_results.append({
            'note_id': note_id,
            'title': title,
            'author': author,
            'company': company,
            'pub_time': pub_time,
            'likes': int(likes) if pd.notna(likes) else 0,
            'favorites': int(favorites) if pd.notna(favorites) else 0,
            'comments': int(comments) if pd.notna(comments) else 0,
            'tech_keywords': tech_kws,
            'questions': questions,
            'link': link,
            'source': source,
        })

    # 合并
    all_results = existing + new_results

    # 保存
    with open(extracted_file, 'w') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)

    # 更新按公司分类
    by_company = {}
    for r in all_results:
        c = r['company'] or '其他'
        if c not in by_company:
            by_company[c] = []
        by_company[c].append(r)

    company_output = {}
    for company, notes in sorted(by_company.items(), key=lambda x: -len(x[1])):
        all_qs = []
        for n in notes:
            for q in n['questions']:
                all_qs.append({'question': q, 'source': n['title']})
        company_output[company] = {
            'note_count': len(notes),
            'total_questions': len(all_qs),
            'questions': all_qs,
        }

    company_file = OUTPUT_DIR / 'interview_by_company.json'
    with open(company_file, 'w') as f:
        json.dump(company_output, f, ensure_ascii=False, indent=2)

    # 打印结果
    print(f'\n{"=" * 50}')
    print(f'  增强提取完成！')
    print(f'{"=" * 50}')
    print(f'\n  原提取: {len(existing)} 篇')
    print(f'  新增:   {len(new_results)} 篇 (OCR: {ocr_count})')
    print(f'  总计:   {len(all_results)} 篇')
    print(f'  总题目: {sum(len(r["questions"]) for r in all_results)} 道')
    print(f'\n  来源分布:')
    sources = {}
    for r in all_results:
        s = r.get('source', 'unknown')
        sources[s] = sources.get(s, 0) + 1
    for s, c in sorted(sources.items(), key=lambda x: -x[1]):
        print(f'    {s}: {c}')

    print(f'\n  公司分布 (Top 12):')
    for company, data in list(company_output.items())[:12]:
        print(f'    {company}: {data["note_count"]} 篇, {data["total_questions"]} 题')

    # 展示新增笔记
    print(f'\n  新增笔记示例:')
    for r in new_results[:10]:
        print(f'    [{r["source"]}] {r["title"][:35]} ({len(r["questions"])} 题)')
        for q in r['questions'][:2]:
            print(f'      • {q[:60]}')


if __name__ == '__main__':
    main()
