# Design - 修复面试题提取质量

## Architecture Overview

修改三个 Python 脚本的逻辑层，不引入新的服务或数据库。数据流不变：

```
笔记列表.xls
  └── extract_interviews_v2.py        [改] 提取层
        └── scripts/output/interview_questions_extracted.json
              └── classify_questions.py       [改] 分类层（含跨类去重 + 散文过滤）
                    └── scripts/output/interview_by_tech.json
                          └── build_tech_interview_data.py   [改] 构建层（噪音过滤 + 输出）
                                └── src/data/tech-interview-questions.json  [前端消费]
```

下游（`src/components/tech-interview/` + `useTechInterviewStore`）消费的 schema 是：

```ts
type TechInterviewQuestions = {
  companies: string[]
  categories: { id: string; name: string; count: number }[]
  questions: Record<string, Array<{ q: string; f: number; c: string[] }>>
}
```

## Module Boundaries

| 模块 | 文件 | 责任 | 不负责 |
|---|---|---|---|
| 提取 | `scripts/extract_interviews_v2.py` | XLS+OCR→笔记条目 → 题目列表 | 分类、最终入库 |
| 分类 | `scripts/classify_questions.py` | 题目分类 + 跨类去重 + 散文/截断过滤 | 输出 schema 转换 |
| 构建 | `scripts/build_tech_interview_data.py` | 按 CATEGORY_ORDER 排序 + 噪音过滤 + 输出最终 JSON | 题目识别 |
| 验证 | `scripts/quality_diff.py`（新增）| 对比重跑前后题目库指标 | 任何写入 |

## Data Flow

### 提取层修复（R1）

`extract_questions_aggressive()` 当前实现：单行匹配 → 直接入列。

修复后改为：

1. **多行合并**：匹配到题号后，贪婪吸收接下来的非空非题号行，直到累计 4 行或遇到新的题号/空行
2. **截断题标记**：长度 < 25 字且不含 `?`/`？`/`.`/`,`/`别`/`差异`/`对比` → 标记 `truncated: true`；仅保留能补全的（前后两段有同主题词的），其他丢入 `dropped_truncated` 统计
3. **代码块识别**：含 `SELECT/FROM/WHERE/INSERT/UPDATE/DELETE/```/def /function /class ` 且跨行 → 标记 `kind: "sql"` 或 `kind: "code"`，原样保留整段（含换行）
4. **散文噪音**：超过 300 字且包含对话词 `["然后", "接下来", "面试官说", "问我", "我答", "我回答", "他问", "她说", "他说", "他说", "面试官问", "他说"]` → 整段丢弃

### 分类层修复（R2）

1. **跨分类去重**：`classify_question()` 当前返回所有命中分类的 list；保留这个行为，但在写入 `categorized[cat]` 前先建 `seen_q = set()`，把 (题面归一化, cat) 已有的合并 companies/sources/count，否则丢弃。归一化用 `normalize_text()`（已有），阈值 "≥95% 字符相同"
2. **题面净化**：写入前用正则 `re.sub(r'[\U0001F300-\U0001FAFF☀-➿]', '', q).strip()` 去掉 emoji 前缀
3. **截断题丢弃**：归一化后如果发现题长 < 6 字（剔除标点），丢弃

### 构建层修复（R3）

`is_noise()` 现有规则保留，新增：

```python
# 散文噪音：长段含对话词且不以问号结尾
PROSE_MARKERS = ["然后", "接下来", "面试官说", "问我", "他问", "她说", "我说", "我答"]
if len(q) > 300 and not (q.endswith('?') or q.endswith('？')):
    if any(m in q for m in PROSE_MARKERS):
        return True
```

并在终报告里打印三类计数：
- `cross_dup_removed`: 跨分类重复被合并的题数
- `emoji_stripped`: 题首 emoji 被清洗的题数
- `truncated_dropped`: 截断题被丢弃的题数
- `prose_dropped`: 散文题被丢弃的题数

## Trade-offs

| 决策 | 选 A | 选 B | 我选 | 理由 |
|---|---|---|---|---|
| 跨分类去重粒度 | 严格相等 | 95% 字符相同 | 95% | "HashMap和ConcurrentHashMap的区" 与 "讲一下 HashMap 和 ConcurrentHashMap 的区别" 是同一题 |
| 多行合并上限 | 不限 | 4 行 | 4 行 | 防止把"题+答案"拼一起 |
| 截断题处理 | 全部保留 | 全丢弃 | 标记+丢弃 | 大部分笔记本身不完整 |
| OCR 重跑 | 跳过（用已抽取） | 全量重跑 | 用已抽取 | 用户原意是"修脚本重跑"，但 OCR 不是数据质量瓶颈，速度优先 |
| 散文判定长度 | >200 | >300 | >300 | 低于 300 的题目中包含必要的"场景题"长描述 |

## Compatibility

- 题库 schema（`{companies, categories, questions}` 三个字段）保持不变 → 前端 `useTechInterviewStore.ts` 不动
- 频率字段 `f` 含义不变（被多少篇笔记/多少分类提及）
- `categories[].id` 命名保持一致（`java-basics`/`mysql`/`redis`/...）

## Rollback

如果重跑后前端显示异常：

```bash
git checkout src/data/tech-interview-questions.json  # 退回上一版
```

提取/分类脚本可单独 git revert，JSON 是产物不影响源码。

## Operational Notes

- venv 激活：`source scripts/venv/bin/activate`
- 运行顺序：`extract → classify → build`（各 ~30s–1min；OCR 在 venv 中用 Vision/Quartz 已验证 OK，但本次不跑 OCR）
- 总耗时预计 2–3 分钟（含 Vision import 冷启动）
- 验证命令：`python scripts/quality_diff.py` 输出重跑前后 diff