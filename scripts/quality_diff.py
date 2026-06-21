#!/usr/bin/env python3
"""
对比新旧 tech-interview-questions.json 的关键质量指标

输入: src/data/tech-interview-questions.json 与 src/data/tech-interview-questions.bak.json
输出: 各指标 before → after 与是否达标
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
NEW = ROOT / 'src' / 'data' / 'tech-interview-questions.json'
OLD = ROOT / 'src' / 'data' / 'tech-interview-questions.bak.json'

if not OLD.exists():
    print(f'WARN: 备份 {OLD} 不存在，跳过 diff')
    sys.exit(0)

EMOJI_RE = re.compile(r'[\U0001F300-\U0001FAFF☀-➿]')
TRUNC_TERMS = ['HashMap和ConcurrentHashMap的区']
PROSE_MARKERS = [
    "然后", "接下来", "面试官说", "面试官问",
    "他问", "她说", "他说", "我说", "我答", "我回答",
    "我忘记", "记不清", "又开始",
]
SQL_BARE_TERMS = ['SELECT orderid FROM order']


def collect(path):
    data = json.load(open(path))
    total = 0
    cross_dup = 0
    cross_dup_q = []
    emoji = 0
    truncated = 0
    truncated_q = []
    prose = 0
    prose_q = []
    sql_bare = 0
    seen = {}
    for cat_id, items in data['questions'].items():
        for it in items:
            q = it['q']
            total += 1
            norm = re.sub(r'[^一-鿿a-z]', '', q.lower())
            if norm in seen:
                cross_dup += 1
                cross_dup_q.append((cat_id, seen[norm], q))
            else:
                seen[norm] = cat_id
            if EMOJI_RE.search(q):
                emoji += 1
            for t in TRUNC_TERMS:
                if t in q:
                    truncated += 1
                    truncated_q.append((cat_id, q))
                    break
            if any(s in q for s in SQL_BARE_TERMS):
                sql_bare += 1
            if len(q) > 300 and '？' not in q and '?' not in q:
                if sum(1 for m in PROSE_MARKERS if m in q) >= 2:
                    prose += 1
                    prose_q.append((cat_id, q[:80]))
    return {
        'total': total,
        'cross_dup': cross_dup,
        'emoji': emoji,
        'truncated': truncated,
        'prose': prose,
        'sql_bare': sql_bare,
    }, {
        'cross_dup': cross_dup_q[:5],
        'truncated': truncated_q[:5],
        'prose': prose_q[:5],
    }


def main():
    old, old_samples = collect(OLD)
    new, new_samples = collect(NEW)
    print(f'{"指标":<20} {"before":>10} → {"after":>10}    状态')
    print('-' * 60)

    metrics = [
        ('总题数', old['total'], new['total'], lambda a, b: abs(a - b) / max(a, 1) <= 0.15),
        ('跨分类重复数', old['cross_dup'], new['cross_dup'], lambda a, b: b == 0),
        ('emoji 残留', old['emoji'], new['emoji'], lambda a, b: b == 0),
        ('截断题残留', old['truncated'], new['truncated'], lambda a, b: b == 0),
        ('散文题残留', old['prose'], new['prose'], lambda a, b: b == 0),
        ('裸 SQL 题', old['sql_bare'], new['sql_bare'], None),
    ]
    fail = False
    for name, ov, nv, ok_fn in metrics:
        if ok_fn is None:
            mark = 'ℹ️'
        elif ok_fn(ov, nv):
            mark = '✅'
        else:
            mark = '❌'
            fail = True
        print(f'{name:<20} {ov:>10} → {nv:>10}    {mark}')

    print('\n剩余坏题样例（最多 5 条/类）:')
    if new_samples['cross_dup']:
        print(' [跨分类重复]')
        for c, prev, q in new_samples['cross_dup']:
            print(f'   {c} (also in {prev}): {q[:60]}')
    if new_samples['truncated']:
        print(' [截断题]')
        for c, q in new_samples['truncated']:
            print(f'   {c}: {q[:60]}')
    if new_samples['prose']:
        print(' [散文题]')
        for c, q in new_samples['prose']:
            print(f'   {c}: {q}')

    if fail:
        print('\n❌ 部分指标未达标，需继续修复')
        sys.exit(1)
    else:
        print('\n✅ 所有核心指标达标')


if __name__ == '__main__':
    main()
