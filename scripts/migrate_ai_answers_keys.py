#!/usr/bin/env python3
"""将 ai-answers.json 的 key 从"题目文本前40字符"转换为稳定 id。

依赖：add_question_ids.py 先运行过，已生成 id-mapping.json
"""

import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
ANSWERS_FILE = os.path.join(PROJECT_ROOT, 'src', 'data', 'ai-answers.json')
MAPPING_FILE = os.path.join(PROJECT_ROOT, 'src', 'data', 'id-mapping.json')
OUTPUT_FILE = ANSWERS_FILE


def main():
    print("=" * 60)
    print("转换 ai-answers.json 的 key 为稳定 id")
    print("=" * 60)

    with open(ANSWERS_FILE, encoding='utf-8') as f:
        answers = json.load(f)

    with open(MAPPING_FILE, encoding='utf-8') as f:
        mapping = json.load(f)

    print(f"原答案数: {len(answers)}")
    print(f"id 映射数: {len(mapping)}")

    converted = {}
    unmapped = []
    duplicates = 0
    for old_key, data in answers.items():
        new_id = mapping.get(old_key)
        if new_id:
            if new_id in converted:
                # 同一 id 已被占用（同一题出现在多分类），保留第一个
                duplicates += 1
                continue
            converted[new_id] = data
        else:
            unmapped.append((old_key, data))

    print(f"\n成功转换: {len(converted)}")
    print(f"未匹配: {len(unmapped)}")
    print(f"被重复占用跳过: {duplicates}")

    if unmapped:
        print(f"\n未匹配的 key 示例（前 10）：")
        for old_key, _ in unmapped[:10]:
            print(f"  - {old_key[:60]}")

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(converted, f, ensure_ascii=False, indent=2)

    print(f"\n已覆盖 {OUTPUT_FILE}")


if __name__ == '__main__':
    main()