# 修复面试题提取脚本生成的题目质量

## Goal

让 `src/data/tech-interview-questions.json`（3924 道题）的题目质量可用：去掉散文/口语化整段、合并被截断的题目、识别并保留 SQL/代码块、把跨分类重复的题目收敛到合适分类下唯一一份。

## Background & Data Diagnosis

通过对当前 `src/data/tech-interview-questions.json` 的扫描，已知问题：

| 问题 | 表现 | 体量 |
|---|---|---|
| 散文题 | 一整段面试口述（"然后还剩半个小时就在那边疯狂问golang…"）被当成一道题入库 | ≥2 条（每条跨 5 分类） |
| 截断题 | "HashMap和ConcurrentHashMap的区" 缺"别"字 | 3 分类 × f=6 |
| 裸 SQL/代码 | "SQL实战：SELECT orderid FROM order WHERE userid=1 ORDER BY amount DESC LIMIT 1" 无表结构/场景/预期输出 | 4 分类 × f=6 |
| 跨分类重复 | 同一题文本在多个分类下出现 | 971 条（占总量 24.7%） |
| 含 emoji 前缀 | "🌳 InnoDB索引结构" | 19 条 |
| 频次为 1 | 高达 3565/3924（91%），很多是低质量独题 | 91% |

## Confirmed Facts

- 笔记源：`/Users/shentao/Downloads/笔记_20260621_1782026000/笔记/`（195 篇）
- XLS 索引：`笔记列表.xls`（同目录）
- 上游已抽取数据：`scripts/output/interview_questions_extracted.json`（含 199 篇、source 标记 text/ocr/raw）
- 题库当前状态：`src/data/tech-interview-questions.json`（3924 题，19 分类）
- 环境：`scripts/venv/` 已装齐 `pandas/openpyxl/playwright`，Vision/Quartz（macOS 系统 OCR）可用

## Requirements

### R1 — 提取层（`scripts/extract_interviews_v2.py`）

- **R1.1 多行合并**：当一条题在原文里跨多行（如编号下有 2–4 行说明），把后续行直到下一个题号/空段都拼到同一个题条目里
- **R1.2 截断题检测**：长度 < 25 字且无问号且不含明显结束标点的题，标记为 `truncated: true` 并尝试从上下文（前/后一段）补全；无法补全的进入噪音黑名单
- **R1.3 代码块识别**：含 `SELECT/INSERT/UPDATE/DELETE/FROM/WHERE` 多行、或以 ``` 包裹的整段代码，标记为 `kind: "sql"` 或 `kind: "code"`，原样保留并允许 f 计数
- **R1.4 散文噪音过滤**：超过 300 字且包含对话词（"然后/接下来/面试官说/问我"）且不以问号结尾的整段，丢弃

### R2 — 分类去重层（`scripts/classify_questions.py`）

- **R2.1 跨分类去重**：同一题文本若被分到 ≥2 个分类，保留 f（频次）最大的那个分类，其余删除
- **R2.2 题面净化**：去掉题首 emoji（🌳🔒⚙️ 等 U+1F300–1FAFF 范围）；截断题统一丢弃

### R3 — 构建层（`scripts/build_tech_interview_data.py`）

- **R3.1 散文过滤器加固**：在现有 `is_noise()` 上新增对话词特征检测；超长整段直接剔除
- **R3.2 跨分类去重**：用 90% 字符前缀匹配做软去重；GENERAL_CATS（项目与场景/智力题与开放题/其他）不参与首选分类；TRUNC_BLACKLIST 黑名单兜底
- **R3.3 输出统计增强**：在终报告打印跨分类重复计数、emoji 残留计数、截断题计数

### R4 — 重跑与验证

- **R4.1 在 venv 下顺序执行**：`extract → classify → build`，覆盖 `scripts/output/interview_questions_extracted.json`、`scripts/output/interview_by_tech.json`、`src/data/tech-interview-questions.json`
- **R4.2 终态对比**：重跑前后，统计跨分类重复数、含 emoji 数、截断题数、散文题数；目标三项均降至 0
- **R4.3 字段保留**：保留 `q/f/c/companies/categories/questions` schema 不变，向后兼容前端 `TechInterview` 模块
- **R4.4 题目总数**：重跑后落在 2000–2500 之间（去除 1554 条跨分类重复 + 25 条截断/误归类，预计 −40%）

## Acceptance Criteria

- [x] `extract_interviews_v2.py` 实现 R1.1–R1.4（多行合并/截断检测/代码块识别/散文过滤）
- [x] `classify_questions.py` 实现 R2.1–R2.2（跨分类去重/emoji 清洗/截断丢弃），跨分类重复数从 1554 → 0
- [x] `build_tech_interview_data.py` 实现 R3.1–R3.3（散文过滤/软去重/统计增强）
- [x] 三个脚本在 `scripts/venv` 下顺序运行成功；最终产物 src/data/tech-interview-questions.json 2345 条
- [x] `src/data/tech-interview-questions.json` 字段结构不变（`companies/categories/questions`）
- [x] scripts/quality_diff.py 已新增，输出 before/after 对比
- [ ] 验证现有前端 `TechInterviewPanel.vue` 在 `npm run build` 下通过类型检查（待 Step 8）

## Out of Scope

- 不修改 OCR 抽取逻辑（Vision API 调用本身）
- 不修改笔记文件夹结构
- 不动 `interview-questions.json` / `jd-default-questions.json`
- 不动前端 UI（除非题库字段有变）

## Risks

- **R1 多行合并可能误并**：把"题目+答案"当成一道长题 → 缓解：合并上限设为 4 行，超出丢弃
- **跨分类去重丢失信号**：某些题在不同分类下考察不同角度（"MVCC" 在 MySQL/并发 两处）→ 缓解：去重时以"题干 95% 相同"为阈值，不做严格相等
- **重跑时间**：OCR 195 篇 × 数张图，估算 5–10 分钟 → 接受在 run_in_background 下运行
- **截断题 OCR 后仍不完整**：部分原笔记本身写得不完整 → 接受保留 `truncated: true` 标记作为信号，不强求补全

## Open Questions

- 无。所有路径已通过 brainstorm 对齐。