#!/usr/bin/env python3
"""为 tech-interview-questions.json 的每道题添加稳定 id 字段。

id 格式：{category_slug}-{序号}
例：ai-001, mysql-023, redis-007
"""

import json
import os
import re
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
INPUT_FILE = os.path.join(PROJECT_ROOT, 'src', 'data', 'tech-interview-questions.json')
ANSWERS_FILE = os.path.join(PROJECT_ROOT, 'src', 'data', 'ai-answers.json')
OUTPUT_FILE = INPUT_FILE  # 原地覆盖


def slugify(name: str) -> str:
    """分类名转 slug：小写 + 替换非字母数字为 '-'"""
    s = re.sub(r'[/\\s]+', '-', name.lower())
    s = re.sub(r'[^a-z0-9-]', '', s)
    s = re.sub(r'-+', '-', s).strip('-')
    return s or 'other'


def main():
    print("=" * 60)
    print("为大厂面经题目添加稳定 id")
    print("=" * 60)

    with open(INPUT_FILE, encoding='utf-8') as f:
        data = json.load(f)

    questions = data.get('questions', {})
    counters = defaultdict(int)
    id_collisions = []

    for cat_name, items in questions.items():
        slug = slugify(cat_name)
        for q in items:
            counters[slug] += 1
            new_id = f"{slug}-{counters[slug]:03d}"
            old_id = q.get('id')
            if old_id:
                print(f"  [{cat_name}] 已有 id={old_id}，保留")
            else:
                q['id'] = new_id

    # 校验 id 全局唯一
    all_ids = [q['id'] for items in questions.values() for q in items]
    seen = {}
    dupes = []
    for qid in all_ids:
        seen[qid] = seen.get(qid, 0) + 1
    for qid, cnt in seen.items():
        if cnt > 1:
            dupes.append((qid, cnt))

    if dupes:
        print(f"\n[错误] 发现 {len(dupes)} 个重复 id：")
        for qid, cnt in dupes[:5]:
            print(f"  {qid}: {cnt} 次")
        return

    # 写出
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n总题目数: {len(all_ids)}")
    print(f"分类数: {len(questions)}")
    print(f"\n各分类统计：")
    for cat, items in questions.items():
        print(f"  {cat}: {len(items)} 题")

    # 输出 id 映射（用于转换 ai-answers.json）
    mapping = {}
    for cat_name, items in questions.items():
        for q in items:
            old_key = q['q'][:40].strip()
            mapping[old_key] = q['id']

    mapping_file = os.path.join(PROJECT_ROOT, 'src', 'data', 'id-mapping.json')
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)
    print(f"\nid 映射已写入: {mapping_file}")
    print(f"映射条目: {len(mapping)}")


if __name__ == '__main__':
    main()