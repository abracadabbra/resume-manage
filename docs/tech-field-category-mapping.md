# 大厂面经分类归一化 · TODO & 实施记录

> 创建于 2026-XX，由"分类显示碎成 100+ 桶"问题驱动。短期走前端归一化，长期建议落地到 Supabase。

## 背景

- **数据源**：`tech_interview_questions.tech_field` 在 Supabase 里实际有 **243 个不同字面量**（原值直读，未聚类）。
- **UI 约定**：`src/data/tech-interview-questions.json` 的 `categories` 是 17 个大类（`AI / Java / MySQL / Redis / 其他 / 前端 / 大数据 / 客户端 / 工具 / 操作系统 / 消息队列 / 算法 / 系统设计 / 编程语言 / 网络 / 软技能 / 项目`）。
- **现状 bug**：`src/stores/techInterviewQuestions.ts` 的 `ensureLoaded()` 把 `row.tech_field` 直接当分类 id 用，云端走通时分类碎成 100+。

## 临时方案：前端归一化层（已落地）

文件：`src/services/techFieldCategory.ts`

- `TECH_FIELD_CATEGORIES` — 17 个大类的元组常量（顺序即 UI 顺序）
- `normalizeTechField(field)` — keyword 优先级匹配，未命中归 `其他`
- `src/stores/techInterviewQuestions.ts`：
  - `ensureLoaded` 把 `row.tech_field` 经过 `normalizeTechField()` 后再分桶
  - `categories` 列表按 `TECH_FIELD_CATEGORIES` 顺序排，未在白名单的兜底类排最后

实测 2764 题分布（仅供参考）：

| 大类 | 数量 |
|---|---|
| Java | 632 |
| MySQL | 338 |
| 项目 | 313 |
| 系统设计 | 303 |
| 算法 | 213 |
| Redis | 201 |
| AI | 178 |
| 消息队列 | 110 |
| 其他 | 107 |
| 网络 | 105 |
| 编程语言 | 69 |
| 操作系统 | 61 |
| 大数据 | 39 |
| 软技能 | 33 |
| 前端 | 24 |
| 客户端 | 20 |
| 工具 | 18 |

## 待办（后续可优化项）

### TODO 1 · Supabase 数据迁移（推荐）

把归一化规则作为后端的"权威"分类，前端只负责显示：

```sql
-- 1) 加派生字段
alter table tech_interview_questions
  add column if not exists tech_category varchar(50);

-- 2) 一次性回填（用 SQL 端 CASE 复刻 src/services/techFieldCategory.ts 的规则）
update tech_interview_questions
set tech_category = case
  when lower(coalesce(tech_field, '')) ~ 'java|jvm|spring|mybatis|并发|多线程' then 'Java'
  when lower(coalesce(tech_field, '')) ~ 'mysql|数据库|sql|数据仓库|elasticsearch' then 'MySQL'
  ...
  else '其他'
end;

-- 3) 加 NOT NULL + check + 索引
alter table tech_interview_questions
  alter column tech_category set not null;
create index idx_tech_questions_category
  on tech_interview_questions (tech_category);
```

前端简化为：直接读 `tech_category` 列，省掉 `normalizeTechField()`。

### TODO 2 · seed 脚本修复

`scripts/gen-seed-tech-interview.cjs` 产出的细分 `tech_field` 太多，新增写入前先按规则聚类：

```js
const { normalizeTechField } = require('./src/services/techFieldCategory.ts')
// 写库前
const tech_category = normalizeTechField(extractedField)
```

### TODO 3 · 关键词表 review

`src/services/techFieldCategory.ts` 的 `RULES` 是手写的，覆盖了 243 个字面量约 90%。建议：

- 跑一遍 diff：找出"未命中 → 其他"的有哪些原始值（脚本见下方）
- 决定是补规则、还是接受"归为其他"

```js
// scripts/check-category-coverage.cjs
import { normalizeTechField } from '../src/services/techFieldCategory.ts'
import data from '../src/data/tech-interview-questions.json'
const notMatched = new Set()
for (const arr of Object.values(data.questions)) {
  for (const q of arr) {
    if (normalizeTechField(q.techField) === '其他') notMatched.add(q.techField)
  }
}
console.log([...notMatched].sort().join('\n'))
```

## 关联文件

- `src/services/techFieldCategory.ts` — 归一化实现
- `src/stores/techInterviewQuestions.ts` — 接入点（`ensureLoaded`）
- `src/data/tech-interview-questions.json` — 本地 fallback 用的 17 大类定义
- `supabase/migrations/007_seed_tech_interview_questions.sql` — 上游种子（TODO 2 改这里）

## 回滚

如果前端归一化效果不好，只需把 `ensureLoaded` 改回：

```ts
const cat = row.tech_field ?? '其他'
```

删除 `src/services/techFieldCategory.ts` 与本文件即可。