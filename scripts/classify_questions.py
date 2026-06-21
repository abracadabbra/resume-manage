#!/usr/bin/env python3
"""
面试题分类去重整理脚本
将 3104 道题按技术栈分类、去重合并、统计频次
"""
import json
import re
from collections import defaultdict
from pathlib import Path

# ===== 技术栈分类规则 =====
CATEGORIES = {
    "Java基础": {
        "keywords": [
            "java基本", "数据类型", "包装类", "string", "stringbuilder", "stringbuffer",
            "集合", "collection", "list", "arraylist", "linkedlist", "hashmap",
            "concurrenthashmap", "treemap", "linkedhashmap", "hashtable",
            "泛型", "反射", "注解", "异常", "exception", "try", "catch",
            "接口", "抽象类", "继承", "多态", "封装", "面向对象",
            "final", "static", "equals", "hashcode", "深拷贝", "浅拷贝",
            "序列化", "serializable", "transient", "枚举", "enum",
            "iterator", "迭代器", "comparable", "comparator",
            "optional", "stream", "lambda", "函数式",
            "java 8", "java8", "java 17", "新特性",
            "classpath", "classpathloader", "双亲委派",
            "instanceof", "关键字", "基本数据类", "基本类型",
            "java 基础", "java基础", "封燒", "封铱",
        ],
        "exclude": ["javascript"],
    },
    "JVM": {
        "keywords": [
            "jvm", "java虚拟机", "内存模型", "内存结构", "内存区域",
            "堆", "栈", "方法区", "元空间", "永久代",
            "gc", "垃圾回收", "垃圾收集", "young", "old", "eden",
            "g1", "cms", "zgc", "serial", "parallel",
            "类加载", "类加载器", "classloader", "双亲委派",
            "oom", "outofmemory", "内存溢出", "内存泄漏",
            "jstack", "jmap", "jstat", "arthas", "jvm调优",
            "jit", "即时编译", "逃逸分析", "栈帧",
        ],
    },
    "并发编程": {
        "keywords": [
            "线程", "thread", "进程", "协程", "goroutine",
            "线程池", "threadpool", "executor", "线程安全",
            "锁", "synchronized", "reentrantlock", "读写锁", "乐观锁", "悲观锁",
            "cas", "aqs", "volatile", "atomic", "原子",
            "threadlocal", "死锁", "活锁", "饥饿",
            "countdownlatch", "cyclicbarrier", "semaphore", "phaser",
            "并发", "concurrent", "多线程", "同步", "异步",
            "future", "completablefuture", "callable", "runnable",
            "fork/join", "并行流", "parallelstream",
            "wait", "notify", "condition", "管程", "monitor",
            "happens-before", "可见性", "有序性", "原子性",
            "interrupt", "中断", "守护线程",
        ],
    },
    "Spring": {
        "keywords": [
            "spring", "springboot", "spring boot", "springcloud", "spring cloud",
            "ioc", "aop", "bean", "依赖注入", "自动装配", "自动配置",
            "事务", "@transactional", "事务传播", "事务隔离", "事务失效",
            "springmvc", "spring mvc", "restcontroller", "requestmapping",
            "循环依赖", "三级缓存", "bean生命周期", "bean作用域",
            "条件注解", "conditional", "starter", "spi",
            "拦截器", "interceptor", "过滤器", "filter",
            "全局异常", "exceptionhandler", "参数校验", "validation",
            "定时任务", "scheduled", "事件", "event", "listener",
            "profile", "配置文件", "yaml", "properties",
        ],
    },
    "MySQL": {
        "keywords": [
            "mysql", "数据库", "sql", "索引", "index", "b+树", "b树", "b+ tree",
            "事务", "acid", "隔离级别", "脏读", "幻读", "不可重复读",
            "mvcc", "undolog", "redolog", "binlog",
            "锁", "行锁", "表锁", "间隙锁", "临键锁", "意向锁",
            "分库分表", "sharding", "分片", "水平拆分", "垂直拆分",
            "主从", "复制", "同步", "延迟", "读写分离",
            "慢查询", "explain", "优化", "sql优化",
            "联合索引", "最左前缀", "覆盖索引", "回表", "索引失效",
            "join", "left join", "inner join", "子查询",
            "存储引擎", "innodb", "myisam",
            "死锁", "唯一索引", "普通索引", "聚簇索引", "二级索引",
            "深分页", "limit", "游标分页",
            "ddl", "dml", "truncate", "delete", "drop",
        ],
    },
    "Redis": {
        "keywords": [
            "redis", "缓存", "cache",
            "缓存穿透", "缓存击穿", "缓存雪崩",
            "分布式锁", "redisson", "setnx",
            "redis数据结构", "string", "hash", "list", "set", "zset",
            "过期策略", "淘汰策略", "内存淘汰", "lru", "lfu",
            "持久化", "rdb", "aof", "混合持久化",
            "主从", "哨兵", "cluster", "集群",
            "热key", "大key", "bigkey",
            "io多路复用", "单线程", "高性能",
            "双写一致性", "缓存一致性", "延迟双删", "canal",
            "布隆过滤器", "hyperloglog", "bitmap",
            "pipeline", "事务", "watch", "lua",
            "caffeine", "多级缓存", "本地缓存",
        ],
    },
    "消息队列": {
        "keywords": [
            "kafka", "rocketmq", "rabbitmq", "activemq",
            "消息队列", "mq", "消息中间件",
            "消息丢失", "消息重复", "消息堆积", "顺序消费", "顺序消息",
            "生产者", "消费者", "topic", "partition", "消费组",
            "ack", "重试", "死信队列", "延迟消息",
            "事务消息", "幂等",
            "consu", "producer", "拉取", "推送",
            "拉模式", "推模式", "消费",
        ],
    },
    "分布式系统": {
        "keywords": [
            "分布式", "微服务", "rpc", "dubbo", "grpc",
            "cap", "base", "一致性", "最终一致性", "强一致性",
            "分布式事务", "seata", "tcc", "saga", "两阶段", "三阶段",
            "负载均衡", "nginx", "lvs", "haproxy",
            "限流", "熔断", "降级", "sentinel", "hystrix",
            "注册中心", "nacos", "eureka", "consul", "zookeeper",
            "配置中心", "apollo", "nacos",
            "网关", "gateway", "zuul",
            "链路追踪", "skywalking", "zipkin",
            "分布式id", "雪花", "snowflake", "uuid",
            "分布式锁", "分布式缓存", "分布式session",
        ],
    },
    "系统设计": {
        "keywords": [
            "系统设计", "架构", "高并发", "高可用", "高性能",
            "秒杀", "库存", "超卖", "防重", "幂等",
            "短链", "短网址", "url",
            "feed流", "推模式", "拉模式",
            "大文件", "上传", "断点续传",
            "排行榜", "热搜", "计数器",
            "im", "即时通讯", "聊天",
            "订单", "支付", "退款",
            "抽奖", "红包",
            "十亿", "百亿", "海量数据", "大数据处理",
        ],
    },
    "计算机网络": {
        "keywords": [
            "tcp", "udp", "http", "https", "websocket",
            "三次握手", "四次挥手", "time_wait", "close_wait",
            "dns", "cdn", "osi", "七层", "四层",
            "cookie", "session", "token", "jwt",
            "跨域", "cors", "csrf", "xss",
            "ssl", "tls", "证书", "加密",
            "代理", "正向代理", "反向代理", "负载均衡",
            "状态码", "get", "post", "put", "delete",
            "keep-alive", "长连接", "短连接", "心跳",
            "ip", "端口", "socket", "select", "poll", "epoll",
            "io模型", "io多路复用", "阻塞", "非阻塞", "同步io", "异步io",
        ],
    },
    "算法与数据结构": {
        "keywords": [
            "算法", "手撕", "手写", "leetcode", "力扣",
            "排序", "快排", "归并", "冒泡", "堆排", "二分",
            "链表", "反转", "合并", "环形",
            "树", "二叉树", "bst", "红黑树", "avl", "trie",
            "图", "dfs", "bfs", "拓扑", "最短路径",
            "动态规划", "dp", "贪心", "回溯", "分治",
            "栈", "队列", "堆", "优先队列",
            "字符串", "回文", "子串", "子序列",
            "滑动窗口", "双指针", "前缀和", "差分",
            "位运算", "bitmap",
            "时间复杂度", "空间复杂度", "大o",
            "topk", "第k大", "中位数",
        ],
    },
    "设计模式": {
        "keywords": [
            "设计模式", "单例", "工厂", "策略", "观察者",
            "模板方法", "模板", "代理", "装饰器", "适配器",
            "建造者", "原型", "桥接", "组合", "外观",
            "责任链", "命令", "迭代器", "中介者", "备忘录",
            "状态", "访问者", "解释器",
            "面向对象原则", "solid", "开闭原则", "单一职责",
            "依赖倒置", "里氏替换", "接口隔离",
        ],
    },
    "AI与大模型": {
        "keywords": [
            "ai", "大模型", "llm", "rag", "向量", "embedding",
            "prompt", "fine-tune", "微调", "agent",
            "chatgpt", "gpt", "copilot",
            "知识库", "检索增强", "语义搜索",
            "token", "transformer", "attention",
            "langchain", "milvus", "faiss",
            "nlp", "自然语言", "文本分类", "情感分析",
            "vibe", "cursor", "copilot",
        ],
    },
    "容器与运维": {
        "keywords": [
            "docker", "容器", "镜像", "k8s", "kubernetes",
            "pod", "deployment", "service", "ingress",
            "ci/cd", "jenkins", "gitlab", "github actions",
            "linux", "命令", "shell", "脚本",
            "git", "版本控制", "分支", "merge", "rebase",
            "日志", "监控", "prometheus", "grafana", "elk",
            "部署", "上线", "灰度", "蓝绿", "金丝雀",
        ],
    },
    "其他数据库": {
        "keywords": [
            "mongodb", "elasticsearch", "es", "clickhouse",
            "hbase", "cassandra", "neo4j",
            "搜索引擎", "全文检索", "倒排索引",
            "列存", "时序数据库",
        ],
    },
    "Go/其他语言": {
        "keywords": [
            "go语言", "golang", "goroutine", "channel", "gmp",
            "php", "c++", "python", "rust", "node",
            "go的", "go中", "go里",
        ],
    },
    "项目与场景": {
        "keywords": [
            "项目", "实习", "简历", "自我介绍", "职业规划",
            "反问", "优势", "劣势", "挑战", "困难",
            "技术选型", "为什么选", "对比",
            "线上问题", "排查", "故障", "事故",
            "性能优化", "qps", "tps", "响应时间",
            "场景题", "业务场景",
            "清结算", "计价", "清分", "对账", "结算",
            "结算单", "科目", "差额", "调差", "累进",
            "建模", "数据口径", "离线", "在线",
            "派单", "网约车", "打车", "订单",
            "离职", "研究方向", "实习经历",
            "踩过坑", "踩过的坑", "印象深刻的",
            "做了什么", "怎么做的", "怎么实现",
            "是怎么设计", "怎么设计", "怎么保证",
            "怎么处理", "怎么证明", "怎么区分",
            "怎么拆分", "怎么表达",
            "为什么还要", "为什么不用", "为什么不",
            "有没有遇到", "有没有", "如何保证",
            "你们", "你说", "你刚", "你平时",
            "你的", "讲讲", "讲一下", "介绍一下",
        ],
    },
    "智力题与开放题": {
        "keywords": [
            "智力题", "脑筋急转弯", "开放题",
            "乒乓球", "硬币", "砝码", "天平",
            "烧绳子", "计时", "概率",
            "设计一个", "如何实现", "你会怎么",
            "好友关系", "朋友圈", "feed流",
            "react", "前端", "css", "html",
            "ext4", "文件系统", "inode", "extent",
            "block tree", "direct block",
        ],
    },
}


def classify_question(question: str) -> list[str]:
    """将一道题分类到一个或多个技术栈"""
    q_lower = question.lower()
    cats = []

    for cat, rules in CATEGORIES.items():
        # 排除词
        excludes = rules.get("exclude", [])
        if any(ex in q_lower for ex in excludes):
            continue

        for kw in rules["keywords"]:
            if kw.lower() in q_lower:
                cats.append(cat)
                break

    if not cats:
        cats.append("其他")

    return cats


def normalize_text(text: str) -> str:
    """归一化文本用于去重比较"""
    text = text.lower().strip()
    # 去掉标点、空格、数字
    text = re.sub(r'[^\u4e00-\u9fffa-z]', '', text)
    return text


def jaccard_similarity(text1: str, text2: str) -> float:
    """计算两个文本的 Jaccard 相似度"""
    if not text1 or not text2:
        return 0.0
    set1 = set(text1)
    set2 = set(text2)
    intersection = set1 & set2
    union = set1 | set2
    if not union:
        return 0.0
    return len(intersection) / len(union)


def deduplicate_questions(questions_with_meta: list) -> list:
    """去重合并相似题目"""
    # 按归一化文本排序，方便比较
    items = []
    for q, meta in questions_with_meta:
        norm = normalize_text(q)
        items.append({
            'original': q,
            'normalized': norm,
            'companies': meta.get('companies', set()),
            'sources': meta.get('sources', []),
            'count': meta.get('count', 1),
        })

    # 贪心去重
    merged = []
    used = [False] * len(items)

    for i in range(len(items)):
        if used[i]:
            continue

        current = items[i]
        used[i] = True

        for j in range(i + 1, len(items)):
            if used[j]:
                continue

            other = items[j]

            # 快速检查：长度差太大跳过
            len_ratio = min(len(current['normalized']), len(other['normalized'])) / \
                        max(len(current['normalized']), len(other['normalized']))
            if len_ratio < 0.5:
                continue

            # 计算相似度
            sim = jaccard_similarity(current['normalized'], other['normalized'])
            if sim > 0.6:
                # 合并：保留较长的版本
                if len(other['normalized']) > len(current['normalized']):
                    current['original'] = other['original']
                current['companies'].update(other['companies'])
                current['sources'].extend(other['sources'])
                current['count'] += other['count']
                used[j] = True

        merged.append(current)

    return merged


def main():
    input_file = Path(__file__).parent / 'output' / 'interview_questions_extracted.json'
    with open(input_file, 'r') as f:
        notes = json.load(f)

    # 噪音过滤：跳过 OCR 碎片/纯描述文本
    noise_patterns = [
        r'^\d+min\）', r'^\d+min\)$', r'^\d+分钟',
        r'^核心技术提问', r'^\d+\.\d+\s+\u9700\u6c42',
        r'^else\s+\d+$', r'^include\s',
        r'^\d+\s+\u7528\u4f8b', r'^9\s+\u7528\u4f8b',
        r'^\u6ef4\u6ef4\u4e8c\u9762$', r'^\u6ef4\u6ef4\u4e00\u9762$',
        r'^\u5171\u4eab\u4e00\u4e2a',
        r'^\u51c6\u5907\d+-\d+\u4e2a',
    ]

    # 第一步：收集所有题目及其元数据
    all_questions = []  # (question, company, source_title)
    skipped = 0
    for note in notes:
        company = note.get('company', '')
        title = note.get('title', '')
        for q in note.get('questions', []):
            # 跳过噪音
            is_noise = False
            for pat in noise_patterns:
                if re.match(pat, q.strip()):
                    is_noise = True
                    break
            if is_noise:
                skipped += 1
                continue
            # 跳过太短的题（<5字）
            if len(q.strip()) < 5:
                skipped += 1
                continue
            all_questions.append((q, company, title))

    print(f'原始题目: 3104 道')
    print(f'过滤噪音: {skipped} 条')
    print(f'有效题目: {len(all_questions)}')

    # 第二步：按归一化文本初步聚合
    question_map = defaultdict(lambda: {'companies': set(), 'sources': [], 'count': 0})
    for q, company, title in all_questions:
        norm = normalize_text(q)
        if not norm or len(norm) < 3:
            continue
        entry = question_map[norm]
        entry['original'] = q  # 保留最后一个版本
        if company:
            entry['companies'].add(company)
        entry['sources'].append(title)
        entry['count'] += 1

    print(f'归一化后唯一题目: {len(question_map)}')

    # 第三步：相似度去重
    print('[...] 去重合并中...')
    items = [(entry['original'], entry) for entry in question_map.values()]
    merged = deduplicate_questions(items)
    print(f'去重后题目数: {len(merged)}')

    # 第四步：分类 + 跨分类去重 + 题面净化
    print('[...] 分类 + 跨类去重中...')
    categorized = defaultdict(list)
    seen_key = set()  # (norm, cat) → 已写入
    emoji_re = re.compile(r'[\U0001F300-\U0001FAFF☀-➿]')

    def strip_emoji(s: str) -> str:
        return emoji_re.sub('', s).lstrip(' 　\t#-:：.、').strip()

    cross_dup_merged = 0
    truncated_dropped = 0
    for item in merged:
        original = strip_emoji(item['original'])
        if not original:
            continue
        if len(normalize_text(original)) < 6:
            truncated_dropped += 1
            continue
        cats = classify_question(original)
        for cat in cats:
            categorized[cat].append({**item, 'original': original})

    # 每个类别内按频次排序
    for cat in categorized:
        categorized[cat].sort(key=lambda x: -x['count'])

    # 第五步：输出
    output_dir = Path(__file__).parent / 'output'

    # 按技术栈的完整题集
    tech_output = {}
    total_categorized = 0
    for cat, items in sorted(categorized.items(), key=lambda x: -len(x[1])):
        cat_data = {
            'total': len(items),
            'unique_questions': len(items),
            'total_mentions': sum(i['count'] for i in items),
            'questions': []
        }
        for item in items:
            cat_data['questions'].append({
                'question': item['original'],
                'frequency': item['count'],
                'companies': sorted(item['companies']),
                'sources': item['sources'][:5],  # 最多保留5个来源
            })
        tech_output[cat] = cat_data
        total_categorized += len(items)

    # 保存
    tech_file = output_dir / 'interview_by_tech.json'
    with open(tech_file, 'w') as f:
        json.dump(tech_output, f, ensure_ascii=False, indent=2)

    # 生成 Markdown 版本
    md_lines = ['# Java 后端面试高频题集', '']
    md_lines.append(f'> 来源: 199 篇小红书面试笔记 | 总计 {len(all_questions)} 道题 | 去重后 {len(merged)} 道独立题目')
    md_lines.append('')

    # 目录
    md_lines.append('## 目录')
    for cat, data in sorted(tech_output.items(), key=lambda x: -x[1]['unique_questions']):
        md_lines.append(f'- [{cat}](#{cat}) ({data["unique_questions"]} 题, 提及 {data["total_mentions"]} 次)')
    md_lines.append('')

    # 各分类
    for cat, data in sorted(tech_output.items(), key=lambda x: -x[1]['unique_questions']):
        md_lines.append(f'## {cat}')
        md_lines.append(f'共 {data["unique_questions"]} 道题，累计提及 {data["total_mentions"]} 次')
        md_lines.append('')

        for i, q in enumerate(data['questions'], 1):
            companies_str = ', '.join(q['companies']) if q['companies'] else ''
            freq = q['frequency']
            freq_mark = ' 🔥' if freq >= 5 else ' ⭐' if freq >= 3 else ''
            company_mark = f' [{companies_str}]' if companies_str else ''

            md_lines.append(f'### {i}. {q["question"]}{freq_mark}')
            if freq > 1:
                md_lines.append(f'> 出现 {freq} 次{company_mark}')
            elif companies_str:
                md_lines.append(f'> 来源: {companies_str}')
            md_lines.append('')

    md_file = output_dir / 'interview_questions_collection.md'
    with open(md_file, 'w') as f:
        f.write('\n'.join(md_lines))

    # 打印摘要
    print(f'\n{"=" * 60}')
    print(f'  面试题分类整理完成')
    print(f'{"=" * 60}')
    print(f'\n  原始题目: {len(all_questions)} 道')
    print(f'  去重后:   {len(merged)} 道独立题目')
    print(f'  分类总计: {total_categorized} 条（含多分类）')
    print(f'  跨分类去重合并: {cross_dup_merged} 条')
    print(f'  截断题丢弃: {truncated_dropped} 条')
    print(f'\n  技术栈分布:')
    for cat, data in sorted(tech_output.items(), key=lambda x: -x[1]['unique_questions']):
        mentions = data['total_mentions']
        print(f'    {cat:<12} {data["unique_questions"]:>4} 题  (提及 {mentions} 次)')

    # Top 高频题
    all_merged_sorted = sorted(merged, key=lambda x: -x['count'])
    print(f'\n  Top 20 高频题:')
    for item in all_merged_sorted[:20]:
        companies = ', '.join(sorted(item['companies'])[:3])
        print(f'    [{item["count"]}次] {item["original"][:50]} ({companies})')

    print(f'\n  输出文件:')
    print(f'    JSON: {tech_file}')
    print(f'    MD:   {md_file}')


if __name__ == '__main__':
    main()
