#!/usr/bin/env python3
"""重建 tech-interview-questions.json，从笔记列表_含OCR.xlsx 第二个 sheet（面试题库）读取数据。"""

import openpyxl
import json
import os
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
INPUT_FILE = os.path.join(PROJECT_ROOT, '笔记列表_含OCR.xlsx')
OUTPUT_FILE = os.path.join(PROJECT_ROOT, 'src', 'data', 'tech-interview-questions.json')

# 分类归一化映射（原始值 → 目标分类）
# 规则：从上到下匹配，第一个命中为准
CATEGORY_RULES = [
    # 轮次跳过
    ('一面', None),
    ('二面', None),
    ('三面', None),
    ('终面', None),
    ('新三面', None),
    ('HR', None),
    ('HR面', None),
    ('反问环节', None),
    # Java 生态
    ('JVM', 'Java'),
    ('Java基础', 'Java'),
    ('Java 基础', 'Java'),
    ('Java深入', 'Java'),
    ('Java并发', 'Java'),
    ('Java / 并发编程', 'Java'),
    ('并发编程', 'Java'),
    ('并发', 'Java'),
    ('集合进阶（深挖源码）', 'Java'),
    ('Java集合', 'Java'),
    ('Spring', 'Java'),
    ('Spring/SpringBoot', 'Java'),
    ('SpringBoot', 'Java'),
    ('Spring/SpringBoot/MyBatis', 'Java'),
    ('Spring 进阶', 'Java'),
    ('MyBatis', 'Java'),
    ('Java（Spring / SpringBoot / SpringMVC）', 'Java'),
    ('Java（Spring/JVM）', 'Java'),
    ('Java（Spring）', 'Java'),
    ('Java基础/JVM', 'Java'),
    ('Java/JVM', 'Java'),
    ('Java vs Go 对比', 'Java'),
    # 消息队列
    ('MQ（Kafka/RabbitMQ/RocketMQ）', '消息队列'),
    ('MQ', '消息队列'),
    ('Kafka', '消息队列'),
    ('RabbitMQ', '消息队列'),
    ('RocketMQ', '消息队列'),
    ('Kafka/MQ', '消息队列'),
    ('MQ（消息队列）', '消息队列'),
    ('MQ（RabbitMQ）', '消息队列'),
    ('MQ（Kafka）', '消息队列'),
    ('Kafka / 消息队列', '消息队列'),
    # 系统设计 / 架构
    ('系统设计', '系统设计'),
    ('系统设计/架构', '系统设计'),
    ('系统设计 / 项目', '系统设计'),
    ('系统设计/场景题', '系统设计'),
    ('系统设计 / 业务场景', '系统设计'),
    ('系统设计 / 数据结构', '系统设计'),
    ('系统设计/算法', '系统设计'),
    ('系统设计/高并发', '系统设计'),
    ('系统设计 / 高并发', '系统设计'),
    ('系统设计/性能优化', '系统设计'),
    ('微服务', '系统设计'),
    ('微服务 ', '系统设计'),
    ('分布式', '系统设计'),
    ('分布式/系统设计', '系统设计'),
    ('微服务/分布式', '系统设计'),
    ('微服务/框架', '系统设计'),
    ('微服务 & 分布式 & 特色', '系统设计'),
    ('Dubbo/RPC', '系统设计'),
    ('RPC / 微服务', '系统设计'),
    ('分布式系统', '系统设计'),
    ('分布式 / 链路追踪', '系统设计'),
    ('高并发与系统设计', '系统设计'),
    ('场景题/系统设计', '系统设计'),
    # AI / 大模型
    ('AI/Agent', 'AI'),
    ('AI / 大模型', 'AI'),
    ('AI/大模型', 'AI'),
    ('Agent（AI Agent）', 'AI'),
    ('AI/Agent/RAG', 'AI'),
    ('AI Agent', 'AI'),
    ('AI/LLM', 'AI'),
    ('AI/LangChain', 'AI'),
    ('大模型/Agent', 'AI'),
    ('大模型/深度学习', 'AI'),
    ('大模型算法', 'AI'),
    ('LLM/Agent', 'AI'),
    ('机器学习', 'AI'),
    ('深度学习', 'AI'),
    ('推荐算法', 'AI'),
    ('RAG / Agent', 'AI'),
    ('RAG / AI', 'AI'),
    ('RAG（AI/Agent）', 'AI'),
    # 项目
    ('项目', '项目'),
    ('项目 ', '项目'),
    ('项目/系统设计', '项目'),
    ('项目 / 系统设计', '项目'),
    ('项目/实习', '项目'),
    ('项目 / 实习', '项目'),
    ('项目/场景题', '项目'),
    ('项目/场景', '项目'),
    ('项目/场景设计', '项目'),
    ('项目/综合', '项目'),
    ('项目/其他', '项目'),
    ('项目/工程实践', '项目'),
    ('项目 / AI相关', '项目'),
    ('项目（AI/RAG）', '项目'),
    ('项目/微服务', '项目'),
    ('项目/综合素质', '项目'),
    ('项目 / 综合素质', '项目'),
    ('项目/岗位认知', '项目'),
    ('项目与业务', '项目'),
    ('项目 / 岗位认知', '项目'),
    ('综合素质', '项目'),
    ('项目/高并发优化', '项目'),
    # 软技能
    ('职业规划', '软技能'),
    ('职业发展', '软技能'),
    ('职业规划/软问题', '软技能'),
    ('职业规划/反问', '软技能'),
    ('自我介绍', '软技能'),
    ('自我介绍 & 过往工作/项目架构介绍', '软技能'),
    ('软技能/HR', '软技能'),
    ('HR / 软技能', '软技能'),
    ('软技能', '软技能'),
    ('软技能/项目', '软技能'),
    ('综合素质', '软技能'),
    ('综合素质', '软技能'),
    ('业务/个人情况', '软技能'),
    ('综合', '软技能'),
    # 编程语言
    ('C++', '编程语言'),
    ('Golang', '编程语言'),
    ('Go', '编程语言'),
    ('Go语言', '编程语言'),
    ('Go 语言', '编程语言'),
    # 补充漏掉的规则
    ('终极深挖（二面占分最重）', '项目'),
    ('进阶（必深问）', 'Java'),
    ('深度', 'Java'),
    ('高并发', '系统设计'),
    ('高并发场景', '系统设计'),
    ('综合性问题', '其他'),
    ('业务', '项目'),
    ('LBS/业务相关', '项目'),
    ('中间件', '系统设计'),
    ('云原生/微服务', '系统设计'),
    ('微服务/线上问题', '系统设计'),
    ('容器/云原生', '系统设计'),
    ('云原生', '系统设计'),
    ('其他', '其他'),
    ('综合性问题', '其他'),
    ('数据治理', '大数据'),
    ('ES/搜索', '系统设计'),
    ('Elasticsearch / 搜索', '系统设计'),
    ('Elasticsearch', '系统设计'),
    ('搜索引擎', '系统设计'),
    ('Python', '编程语言'),
    ('JavaScript', '编程语言'),
    ('PHP', '编程语言'),
    ('编程语言/基础', '编程语言'),
    ('编程语言', '编程语言'),
    # 大数据
    ('大数据', '大数据'),
    ('大数据开发（项目/场景题）', '大数据'),
    ('数据仓库', '大数据'),
    ('数据仓库 / 数据开发', '大数据'),
    ('大数据 / 数据仓库', '大数据'),
    ('大数据/HBase', '大数据'),
    ('大数据（Hadoop/Hive/HBase）', '大数据'),
    ('Flink/大数据', '大数据'),
    # 网络
    ('网络', '网络'),
    ('计算机网络', '网络'),
    ('网络/操作系统', '网络'),
    ('网络/通信', '网络'),
    ('网络/Netty', '网络'),
    ('网络/IO', '网络'),
    ('网络/HTTP', '网络'),
    ('网络协议', '网络'),
    ('网络/安全', '网络'),
    ('网络编程 / 高并发', '网络'),
    ('网络安全', '网络'),
    # 操作系统
    ('操作系统', '操作系统'),
    ('操作系统/存储', '操作系统'),
    ('Linux', '操作系统'),
    ('Linux/IO', '操作系统'),
    ('Linux/IO多路复用', '操作系统'),
    # 调试/工具
    ('调试/工具', '工具'),
    ('Git', '工具'),
    ('Vim', '工具'),
    ('工程能力 / 编码规范', '工具'),
    ('前端工程化', '工具'),
    ('Webpack', '工具'),
    # 前端
    ('React', '前端'),
    ('Vue', '前端'),
    ('前端 - React', '前端'),
    ('前端基础（JavaScript）', '前端'),
    ('前端 - 工程化', '前端'),
    ('前端 - 项目经验', '前端'),
    ('前端 - 项目/场景', '前端'),
    ('前端业务场景', '前端'),
    ('浏览器/存储', '前端'),
    ('浏览器/网络', '前端'),
    # 其他明确类别
    ('高并发场景', '系统设计'),
    ('高并发', '系统设计'),
    ('分布式锁', '系统设计'),
    ('Redis / 缓存', 'Redis'),
    ('MySQL/数据库', 'MySQL'),
    ('MySQL', 'MySQL'),
    ('数据库', 'MySQL'),
    ('SQL（数据分析）', 'MySQL'),
    ('SQL', 'MySQL'),
    ('SQL/数据库', 'MySQL'),
    ('索引和锁', 'MySQL'),
    ('索引', 'MySQL'),
    ('MySQL索引', 'MySQL'),
    ('Redis', 'Redis'),
    ('Redis缓存', 'Redis'),
    ('Redis持久化', 'Redis'),
    # 小众/不明确
    ('算法', '算法'),
    ('算法与数据结构', '算法'),
    ('数据结构与算法', '算法'),
    ('算法/手撕代码', '算法'),
    ('算法/系统设计', '算法'),
    ('算法/SQL', '算法'),
    ('算法（美团一面）', '算法'),
    ('大数据/实时计算', '大数据'),
    ('大数据/OLAP', '大数据'),
    ('Agent', 'AI'),
    ('iOS开发', '客户端'),
    ('Android客户端', '客户端'),
    ('Web', '前端'),
    ('云原生', '系统设计'),
    ('容器/云原生', '系统设计'),
    ('容器化/云原生', '系统设计'),
    ('DevOps', '工具'),
    ('运维 / DevOps', '工具'),
    ('测试', '工具'),
    ('测试基础', '工具'),
    ('数学题', '算法'),
    ('代码题', '算法'),
    ('算法/编程', '算法'),
    ('逻辑/估算题', '算法'),
    ('数据结构', '算法'),
    ('设计模式', '系统设计'),
    ('认证授权', '系统设计'),
    ('安全', '系统设计'),
    ('计算机基础', '系统设计'),
    ('通用/基础', '其他'),
    ('其它', '其他'),
    ('工程化/构建', '工具'),
    ('比赛/项目', '项目'),
    ('区块链', '其他'),
    ('产品经理', '软技能'),
    ('科研/论文', 'AI'),
    ('AB实验', '大数据'),
    ('因果推断', 'AI'),
    ('业务 / 个人情况', '软技能'),
    ('学习能力', '软技能'),
    ('业务题（数据分析/网约车）', '项目'),
    ('数据分析（业务面）', '项目'),
    ('Dubbo', '系统设计'),
    ('Shiro（安全框架）', '系统设计'),
    ('高频必考题', '其他'),
    ('数据分析（业务面）', '其他'),
    ('数据分析', '其他'),
    ('业务题（数据分析/网约车）', '其他'),
    ('AB实验', '其他'),
    ('数据治理', '其他'),
    ('科研/论文', '其他'),
    ('比赛/项目', '其他'),
    ('机器学习/推荐系统', 'AI'),
    ('八股（深度学习/大模型）', 'AI'),
    ('AI 工具使用', 'AI'),
    ('AI工具', 'AI'),
    ('运维 / DevOps', '其他'),
    ('DevOps', '其他'),
    ('测试', '其他'),
    ('测试基础', '其他'),
    ('安全', '其他'),
    ('设计模式', '其他'),
    ('数学题', '其他'),
    ('逻辑/估算题', '其他'),
    ('Disruptor（高性能队列）', '消息队列'),
    ('多线程&并发', 'Java'),
    ('Java（Python）', 'Java'),
]

# 建立一个快速查找字典
CATEGORY_MAP = {}
for raw, target in CATEGORY_RULES:
    if raw not in CATEGORY_MAP:
        CATEGORY_MAP[raw] = target


def normalize_category(raw: str) -> str | None:
    """归一化分类，返回 None 表示跳过（轮次等）"""
    if not raw:
        return '其他'
    raw = raw.strip()
    if not raw:
        return '其他'
    if raw in CATEGORY_MAP:
        return CATEGORY_MAP[raw]
    # 模糊兜底
    raw_lower = raw.lower()
    if any(k in raw_lower for k in ['java', 'jvm', 'spring', 'mybatis', '并发', '集合']):
        return 'Java'
    if any(k in raw_lower for k in ['mq', 'kafka', 'rocketmq', 'rabbitmq', '消息队列']):
        return '消息队列'
    if any(k in raw_lower for k in ['系统设计', '架构', '微服务', '分布式', '场景']):
        return '系统设计'
    if any(k in raw_lower for k in ['ai', '大模型', 'llm', 'agent', 'rag', '机器学习', '深度学习', '推荐']):
        return 'AI'
    if any(k in raw_lower for k in ['项目', '实习', '场景题']):
        return '项目'
    if any(k in raw_lower for k in ['职业', '素质', '软技能', 'hr', '自我介绍', '反问']):
        return '软技能'
    if any(k in raw_lower for k in ['网络', 'http', 'tcp', 'udp', 'socket']):
        return '网络'
    if any(k in raw_lower for k in ['操作系统', 'linux', '进程', '线程', '进程']):
        return '操作系统'
    if any(k in raw_lower for k in ['大数据', 'hadoop', 'hive', 'hbase', 'spark', 'flink', 'starrocks']):
        return '大数据'
    if any(k in raw_lower for k in ['算法', '手撕', '编程']):
        return '算法'
    if any(k in raw_lower for k in ['c++', 'golang', 'python', 'javascript', 'php', 'ruby', 'go语言']):
        return '编程语言'
    if raw_lower in ['redis', 'redis缓存']:
        return 'Redis'
    if any(k in raw_lower for k in ['mysql', '数据库', 'sql', '索引', '事务', '隔离']):
        return 'MySQL'
    return '其他'


def rebuild(data, headers):
    idx = {h: i for i, h in enumerate(headers)}
    note_id_col = idx['笔记ID']
    title_col = idx['笔记标题']
    company_col = idx['公司']
    position_col = idx['岗位']
    round_col = idx['轮次']
    tech_field_col = idx['技术领域']
    question_col = idx['题目']
    link_col = idx['链接']
    publish_col = idx['发布时间']

    # question_map[(cat, question)] = aggregated entry
    question_map: dict = {}

    skipped = 0
    kept = 0

    for row in data:
        if not row or not row[question_col]:
            skipped += 1
            continue

        question = str(row[question_col] or '').strip()
        if not question:
            skipped += 1
            continue

        raw_cat = str(row[tech_field_col] or '').strip()
        cat = normalize_category(raw_cat)
        if cat is None:
            skipped += 1
            continue

        company = str(row[company_col] or '').strip()
        note_id = str(row[note_id_col] or '').strip()
        note_title = str(row[title_col] or '').strip()
        position = str(row[position_col] or '').strip()
        round_val = str(row[round_col] or '').strip()
        link = str(row[link_col] or '').strip()
        published_at = str(row[publish_col] or '').strip()

        key = (cat, question)
        if key not in question_map:
            question_map[key] = {
                'companies': set(),
                'f': 0,
                'noteId': note_id,
                'noteTitle': note_title,
                'position': position,
                'round': round_val,
                'techField': raw_cat,
                'link': link,
                'publishedAt': published_at,
            }
        entry = question_map[key]
        entry['companies'].add(company)
        entry['f'] += 1
        kept += 1

    print(f"Skipped: {skipped}, Kept: {kept}")

    # 按分类聚合
    by_category: dict = defaultdict(list)
    all_companies: set = set()

    for (cat, question), entry in question_map.items():
        q = {
            'q': question,
            'f': entry['f'],
            'c': sorted(list(entry['companies'])),
            'noteId': entry['noteId'],
            'noteTitle': entry['noteTitle'],
            'position': entry['position'],
            'round': entry['round'],
            'techField': entry['techField'],
            'link': entry['link'],
            'publishedAt': entry['publishedAt'],
        }
        by_category[cat].append(q)
        all_companies.update(entry['companies'])

    # 构建 categories 列表
    categories = []
    for cat_name in sorted(by_category.keys()):
        qs = sorted(by_category[cat_name], key=lambda x: -x['f'])
        by_category[cat_name] = qs
        categories.append({
            'id': cat_name,
            'name': cat_name,
            'count': len(qs),
        })

    result = {
        'companies': sorted(list(all_companies)),
        'categories': categories,
        'questions': dict(by_category),
    }

    return result


def main():
    print("Loading Excel...")
    wb = openpyxl.load_workbook(INPUT_FILE)
    ws = wb['面试题库']
    rows = list(ws.iter_rows(values_only=True))
    headers = rows[0]
    data_rows = rows[1:]
    print(f"Rows: {len(data_rows)}")

    result = rebuild(data_rows, headers)

    total_qs = sum(len(qs) for qs in result['questions'].values())
    print(f"\nCategories: {len(result['categories'])}")
    for cat in result['categories']:
        print(f"  {cat['name']}: {cat['count']}")
    print(f"\nCompanies: {len(result['companies'])}")
    print(f"Total unique questions: {total_qs}")

    high_freq = sum(1 for qs in result['questions'].values() for q in qs if q['f'] > 1)
    print(f"Questions with f>1: {high_freq}")

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nWritten to {OUTPUT_FILE}")


if __name__ == '__main__':
    main()
