#!/usr/bin/env python3
"""
清洗面试题数据 + 转换为紧凑 JSON 格式
输入: scripts/output/interview_by_tech.json
输出: src/data/tech-interview-questions.json
"""
import json
import re
from pathlib import Path

BASE_DIR = Path(__file__).parent
INPUT_FILE = BASE_DIR / 'output' / 'interview_by_tech.json'
OUTPUT_FILE = BASE_DIR.parent / 'src' / 'data' / 'tech-interview-questions.json'

# 分类名称 → 稳定 ID 映射
CATEGORY_ID_MAP = {
    "Java基础": "java-basics",
    "JVM": "jvm",
    "并发编程": "concurrent",
    "Spring": "spring",
    "MySQL": "mysql",
    "Redis": "redis",
    "消息队列": "mq",
    "分布式系统": "distributed",
    "系统设计": "system-design",
    "计算机网络": "network",
    "算法与数据结构": "algorithm",
    "设计模式": "design-pattern",
    "AI与大模型": "ai-llm",
    "容器与运维": "devops",
    "其他数据库": "other-db",
    "Go/其他语言": "go-other",
    "项目与场景": "project",
    "智力题与开放题": "brainteaser",
    "其他": "other",
}

# 分类显示顺序（核心技术在前，综合分类在后）
CATEGORY_ORDER = [
    "MySQL", "Redis", "并发编程", "Java基础", "JVM", "Spring",
    "分布式系统", "消息队列", "系统设计", "计算机网络",
    "算法与数据结构", "设计模式", "AI与大模型",
    "容器与运维", "其他数据库", "Go/其他语言",
    # 分隔线后
    "项目与场景", "智力题与开放题", "其他",
]

# 短题保护：包含这些技术关键词的短题（<10字）保留
SHORT_TECH_KEYWORDS = [
    "AQS", "CAS", "JVM", "GC", "Redis", "MySQL", "Spring", "Kafka",
    "Dubbo", "gRPC", "MQ", "SQL", "HTTP", "TCP", "UDP", "DNS",
    "CDN", "SSL", "TLS", "Nginx", "Docker", "K8s", "Git",
    "B+树", "MVCC", "IO", "OOM", "RDB", "AOF", "ES",
    "线程池", "索引", "事务", "缓存", "锁", "消息", "限流",
    "离职", "实习", "学历", "方向", "意愿",
]

# 非问句保护：包含这些关键词的长文本（>30字）保留
QUESTION_KEYWORDS = [
    "怎么", "如何", "为什么", "区别", "原理", "底层", "实现",
    "哪些", "什么", "说说", "讲讲", "介绍", "描述", "分析",
    "设计", "优化", "对比", "场景", "优缺点", "用法",
    "能不能", "是否", "触发", "过程", "流程", "机制",
]

# 必须过滤的关键词
MUST_FILTER_KEYWORDS = [
    "自我介绍", "自我介",
    "开场", "寒暄", "暖场", "面试结束", "面试时长",
]

# 反问过滤模式
ANTI_QUESTION_PATTERNS = [
    r'^反问',
    r'^反问环节',
    r'反问[：:]',
    r'职业规划\+?反问',
]

# OCR 碎片模式
OCR_NOISE_PATTERNS = [
    r'^\d+min[）\)]',
    r'^\d+分钟[）\)]',
    r'^核心技术提问',
    r'^\d+\.\d+\s+需求',
    r'^else\s+\d+$',
    r'^include\s',
    r'^\d+\s+用例',
    r'^9\s+用例',
    r'^滴滴[一二三]面$',
    r'^共[享分]一个',
    r'^准备\d+-\d+个',
]


def is_noise(question: str) -> bool:
    """判断一道题是否为噪音，应被过滤"""
    q = question.strip()
    if not q:
        return True

    # 1. 必须过滤关键词
    for kw in MUST_FILTER_KEYWORDS:
        if kw in q:
            return True

    # 2. 反问类
    for pat in ANTI_QUESTION_PATTERNS:
        if re.search(pat, q):
            return True

    # 3. 标签残留
    if '[话题]#' in q:
        return True
    if re.match(r'^#[^#]+\[话题\]', q):
        return True

    # 4. OCR 碎片
    for pat in OCR_NOISE_PATTERNS:
        if re.match(pat, q):
            return True

    # 5. 太短无意义（<10字）
    if len(q) < 10:
        # 保护：含问号的不删
        if '？' in q or '?' in q:
            return False
        # 保护：含技术关键词的不删
        q_lower = q.lower()
        for kw in SHORT_TECH_KEYWORDS:
            if kw.lower() in q_lower:
                return False
        return True

    # 6. 非问句噪音（>30字，无问号，无关键词）
    if len(q) > 30 and '？' not in q and '?' not in q:
        has_keyword = False
        for kw in QUESTION_KEYWORDS:
            if kw in q:
                has_keyword = True
                break
        # 保护：含技术关键词的也保留
        if not has_keyword:
            q_lower = q.lower()
            for kw in SHORT_TECH_KEYWORDS:
                if kw.lower() in q_lower:
                    has_keyword = True
                    break
        if not has_keyword:
            return True

    # 7. 散文题：>300字 + 含对话词 + 无问号
    if len(q) > 300 and '？' not in q and '?' not in q:
        prose_markers = [
            "然后", "接下来", "面试官说", "面试官问",
            "他问", "她说", "他说", "我说", "我答", "我回答",
            "我忘记", "记不清", "又开始",
        ]
        if sum(1 for m in prose_markers if m in q) >= 2:
            return True

    return False


def main():
    # 加载数据
    with open(INPUT_FILE, 'r') as f:
        data = json.load(f)

    # 收集所有公司
    all_companies = set()
    total_raw = 0
    total_cleaned = 0
    category_stats = {}

    # 清洗 + 转换
    questions_by_cat = {}
    categories_meta = []

    # 第一步：所有分类写入到一个临时 list，再做全局跨分类去重
    all_cats_buffer = {}
    for cat_name in CATEGORY_ORDER:
        if cat_name not in data:
            continue
        cat_data = data[cat_name]
        all_cats_buffer[cat_name] = cat_data

    # 软去重：≥90% 字符相同视为同一题（最长公共前缀比 ≥0.9）
    def soft_same(a: str, b: str) -> bool:
        if not a or not b:
            return False
        shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
        if len(shorter) < 4:
            return False
        # 计算前缀匹配
        common = 0
        for x, y in zip(shorter, longer):
            if x != y:
                break
            common += 1
        return common / len(shorter) >= 0.9 and common >= 8

    norm_to_first_cat = {}
    pending_items = []  # (cat_name, item, norm)

    # 综合分类不参与"首选分类"，避免吃掉具体技术分类的题
    GENERAL_CATS = {'项目与场景', '智力题与开放题', '其他'}

    for cat_name in CATEGORY_ORDER:
        if cat_name not in all_cats_buffer:
            continue
        if cat_name in GENERAL_CATS:
            continue
        cat_data = all_cats_buffer[cat_name]
        for item in cat_data['questions']:
            q_text = item['question']
            if is_noise(q_text):
                continue
            norm = re.sub(r'[^一-鿿a-z]', '', q_text.lower())
            if not norm:
                continue
            # 软匹配：若与已有任一 norm 90% 相同，复用其分类
            existing = None
            for k in norm_to_first_cat:
                if soft_same(norm, k):
                    existing = k
                    break
            if existing is None and norm not in norm_to_first_cat:
                norm_to_first_cat[norm] = cat_name

    # 只有当具体技术分类都没命中时才落到综合分类
    for cat_name in CATEGORY_ORDER:
        if cat_name not in all_cats_buffer:
            continue
        if cat_name not in GENERAL_CATS:
            continue
        cat_data = all_cats_buffer[cat_name]
        for item in cat_data['questions']:
            q_text = item['question']
            if is_noise(q_text):
                continue
            norm = re.sub(r'[^一-鿿a-z]', '', q_text.lower())
            if not norm:
                continue
            # 软匹配：若与已有任一 norm 90% 相同，复用其分类
            existing = None
            for k in norm_to_first_cat:
                if soft_same(norm, k):
                    existing = k
                    break
            if existing is None and norm not in norm_to_first_cat:
                norm_to_first_cat[norm] = cat_name

    for cat_name in CATEGORY_ORDER:
        if cat_name not in all_cats_buffer:
            continue
        cat_data = all_cats_buffer[cat_name]
        cat_id = CATEGORY_ID_MAP.get(cat_name, cat_name)

        clean_qs = []
        for item in cat_data['questions']:
            total_raw += 1
            q_text = item['question']
            if is_noise(q_text):
                total_cleaned += 1
                continue

            norm = re.sub(r'[^一-鿿a-z]', '', q_text.lower())
            # 仅当此分类是该 norm 的"首选分类"时保留（软匹配）
            primary_cat = None
            for k, c in norm_to_first_cat.items():
                if soft_same(norm, k) or k == norm:
                    primary_cat = c
                    break
            if primary_cat != cat_name:
                continue

            # 截断题黑名单（仅硬黑名单，避免误伤合理短题）
            TRUNC_BLACKLIST = ['HashMap和ConcurrentHashMap的区']
            if any(b in q_text for b in TRUNC_BLACKLIST):
                total_cleaned += 1
                continue

            for company in item.get('companies', []):
                all_companies.add(company)

            clean_qs.append({
                'q': q_text,
                'f': item['frequency'],
                'c': item.get('companies', []),
            })

        clean_qs.sort(key=lambda x: -x['f'])
        questions_by_cat[cat_id] = clean_qs
        categories_meta.append({
            'id': cat_id,
            'name': cat_name,
            'count': len(clean_qs),
        })
        category_stats[cat_name] = {
            'raw': cat_data['unique_questions'],
            'clean': len(clean_qs),
            'removed': cat_data['unique_questions'] - len(clean_qs),
        }

    # 公司列表排序（按出现频次大致排序）
    company_list = sorted(all_companies)

    # 组装输出
    output = {
        'companies': company_list,
        'categories': categories_meta,
        'questions': questions_by_cat,
    }

    # 写入
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # 统计
    total_kept = sum(cat['clean'] for cat in category_stats.values())
    file_size = OUTPUT_FILE.stat().st_size

    print(f'=== 数据清洗 + 格式转换完成 ===')
    print(f'\n原始题目: {total_raw}')
    print(f'过滤噪音: {total_cleaned}')
    print(f'保留题目: {total_kept}')
    print(f'输出文件: {OUTPUT_FILE}')
    print(f'文件大小: {file_size / 1024:.1f} KB')
    print(f'公司数量: {len(company_list)}')
    print(f'\n各分类统计:')
    for name, stats in category_stats.items():
        mark = ' ❌' if stats['removed'] > 0 else ''
        print(f'  {name:<12} {stats["raw"]:>4} → {stats["clean"]:>4} (移除 {stats["removed"]}){mark}')


if __name__ == '__main__':
    main()
