# Implement - 修复面试题提取质量

## Ordered Checklist

### Step 1 — 备份当前产物（preflight）

```bash
cp scripts/output/interview_questions_extracted.json scripts/output/interview_questions_extracted.bak.json
cp scripts/output/interview_by_tech.json scripts/output/interview_by_tech.bak.json
cp src/data/tech-interview-questions.json src/data/tech-interview-questions.bak.json
```

验证: 三份 .bak 文件存在

### Step 2 — 修改 `scripts/extract_interviews_v2.py`

改动点（仅 `extract_questions_aggressive` 函数）：

- 把单行 for 循环改成"题号触发的多行吸收"逻辑
- 新增 `is_truncated(q)`、`is_code_block(q)`、`is_prose(q)` 三个辅助
- 在题条 dict 里新增 `kind` 和 `truncated` 字段

不变的部分：OCR 函数、公司检测、技术关键词提取、主流程 `main()`

### Step 3 — 修改 `scripts/classify_questions.py`

改动点：

- `main()` 的第四步（写入 `categorized[cat]` 前）插入跨分类去重（用 `seen_q[(norm, cat)]` 集合，重复时合并 companies/sources/count）
- 写入前用正则清洗 emoji 前缀
- 归一化后 < 6 字符的题丢弃

不变的部分：CATEGORIES 字典、classify_question()、normalize_text()、jaccard_similarity()、deduplicate_questions()、MD 输出格式

### Step 4 — 修改 `scripts/build_tech_interview_data.py`

改动点：

- `is_noise()` 新增散文判定块（>300 字 + 对话词 + 无问号 → True）
- `main()` 终报告新增 4 个计数器

不变的部分：CATEGORY_ID_MAP、CATEGORY_ORDER、SHORT_TECH_KEYWORDS、OCR_NOISE_PATTERNS、最终输出 schema

### Step 5 — 新增 `scripts/quality_diff.py`

比对新旧 JSON，输出：

- 总题数变化
- 跨分类重复数变化（目标：3924 → 重复数 0）
- 散文题残留数（目标：0）
- 截断题残留数（目标：0）
- emoji 残留数（目标：0）

### Step 6 — 在 venv 下重跑（顺序执行）

```bash
source scripts/venv/bin/activate
python scripts/extract_interviews_v2.py      # 输出 scripts/output/interview_questions_extracted.json
python scripts/classify_questions.py        # 输出 scripts/output/interview_by_tech.json
python scripts/build_tech_interview_data.py # 输出 src/data/tech-interview-questions.json
```

每步都校验 stdout 无 traceback。

### Step 7 — 跑质量对比

```bash
python scripts/quality_diff.py
```

期望输出：

```
跨分类重复: 971 → 0      ✅
emoji 残留: 19 → 0       ✅
截断题残留: 3+ → 0       ✅
散文题残留: 2 → 0        ✅
总题数: 3924 → ~3800     ✅ (在 ±15% 范围)
```

### Step 8 — 前端类型检查

```bash
npm run type-check
```

期望: 无错误（schema 不变 → 类型不变）

### Step 9 — 提交

```bash
git add scripts/extract_interviews_v2.py scripts/classify_questions.py scripts/build_tech_interview_data.py scripts/quality_diff.py
git add scripts/output/interview_questions_extracted.json scripts/output/interview_by_tech.json
git add src/data/tech-interview-questions.json
git commit -m "fix: 修复面试题提取质量（去重/截断/散文/代码块）"
```

## Validation Commands

```bash
# 1. Python 语法检查
python -m py_compile scripts/extract_interviews_v2.py scripts/classify_questions.py scripts/build_tech_interview_data.py scripts/quality_diff.py

# 2. 跑完整管道
source scripts/venv/bin/activate
python scripts/extract_interviews_v2.py && python scripts/classify_questions.py && python scripts/build_tech_interview_data.py

# 3. 质量对比
python scripts/quality_diff.py

# 4. 前端类型检查
cd /Users/shentao/Library/Mobile\ Documents/com~apple~CloudDocs/其他/resume-builder-main
npm run type-check
```

## Review Gates

- **G1（plan）**: prd.md / design.md / implement.md 用户确认 ✅（已确认）
- **G2（执行）**: 三脚本 + quality_diff.py 写完；本地语法检查通过
- **G3（验收）**: quality_diff 输出 4 项指标全 OK；npm type-check 通过；抽样读 10 道题无明显坏数据
- **G4（提交）**: commit message 符合 `fix:` 规范

## Risky Files / Rollback Points

- `src/data/tech-interview-questions.json` — 前端直接消费 → 出问题立即 `git checkout` 回到 .bak 版
- `scripts/output/interview_questions_extracted.json` — 中间产物 → 出问题回到 .bak
- `scripts/extract_interviews_v2.py` — 主干逻辑改 → 出问题 `git revert HEAD~1`

## Follow-up Checks

- [ ] 抽样 10 道题人工检查（含 SQL 实战、长描述、跨类）
- [ ] 跑前端 dev server，浏览 `TechInterviewPanel` 看分类筛选无异常
- [ ] 截图保留重跑前后对比图（可选）
- [ ] 更新 `.omc/project-memory.json` 记录 `tech-interview-questions.json` 改动