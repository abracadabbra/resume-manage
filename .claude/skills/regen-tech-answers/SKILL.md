---
name: regen-tech-answers
description: 批量为"大厂面经"题库（src/data/tech-interview-questions.json）生成 AI 参考答案并写入 src/data/ai-answers.json。支持按分类筛选、并发、跳过已存在、断点续跑。当用户说"生成/重生成/补全 AI 答案"、"跑一下面经答案"、指定分类（如 mysql、redis、java）批量跑答案时触发。
---

# 大厂面经 AI 答案批量生成

调用现成的 `scripts/generate_ai_answers.py` 脚本，并发调用流式 AI API，逐道题生成结构化参考答案，写入 `src/data/ai-answers.json`（key 为题目稳定 id）。

## 前置检查（每次执行前必跑）

```bash
# 1. AI 配置（脚本会从 ai-config.json 或环境变量读取）
cat ai-config.json 2>/dev/null || echo "WARN: ai-config.json 不存在，需要 AI_API_URL / AI_API_TOKEN / AI_MODEL_NAME 环境变量"

# 2. 题库文件必须存在
test -f src/data/tech-interview-questions.json && echo "题库 OK"

# 3. 当前 ai-answers.json 已有多少条
python3 -c "import json; print('已有答案:', len(json.load(open('src/data/ai-answers.json'))))"
```

若配置缺失：停下来告诉用户怎么补，不要瞎跑。

## 核心命令

```bash
# 全量（默认跳过已有，等同 --resume）
python3 scripts/generate_ai_answers.py --workers 3

# 指定分类
python3 scripts/generate_ai_answers.py --categories MySQL Redis --workers 3

# 限制每个分类数量（调试/小批量用）
python3 scripts/generate_ai_answers.py --categories MySQL --limit 10 --workers 2

# 强制重新生成（删掉 ai-answers.json 里对应 key 后再跑）
python3 scripts/generate_ai_answers.py --categories MySQL --workers 3
```

**默认行为**：脚本默认开启 `--resume`，**自动跳过 ai-answers.json 里 key 已存在的题目**（key 为题目稳定 id）。要重跑某分类，用下面命令先清掉对应 key：

```bash
python3 - <<'PY'
import json
from pathlib import Path
ans = json.load(open('src/data/ai-answers.json'))
cats_to_clear = {'MySQL'}
# 从 tech-interview-questions.json 读题 id（按分类名匹配 questions 的 key）
data = json.load(open('src/data/tech-interview-questions.json'))
to_remove = {q['id'] for qs in data['questions'].values() for q in qs if q.get('techField') in cats_to_clear}
for k in to_remove:
    ans.pop(k, None)
json.dump(ans, open('src/data/ai-answers.json', 'w'), ensure_ascii=False, indent=2)
print(f"已清空 {len(to_remove)} 条")
PY
```

**强制重跑所有指定分类**（即便已有答案也覆盖）：`--no-resume`

## 工作流

### Step 1：澄清范围

问用户（或按 $ARGUMENTS 解析）：
- **跑哪些分类？** 候选（按 `tech-interview-questions.json` 的分类 id 匹配）：`Java`、`MySQL`、`Redis`、`AI`、`消息队列`、`操作系统`、`算法`、`系统设计`、`编程语言`、`网络`、`软技能`、`项目`、`大数据`、`工具`、`前端`、`客户端`、`其他`
- **并发数？** 默认 3。429 限速时降到 2，单次失败的任务可单独降为 1。
- **断点续跑还是清空重跑？** 默认断点续跑（`--resume` 默认开，按 id 跳过已有）。要重跑某分类用上面"清空脚本"。

如果用户说"全部跑完"或没指定分类，**必须**先告诉用户总题数 / 已有数 / 待跑数，并征得同意再跑（API 调用会烧钱）。

### Step 2：跑脚本（run_in_background）

```bash
python3 scripts/generate_ai_answers.py --categories <...> --workers 3 2>&1 | tee /tmp/regen-answers.log
```

**必须**用 `run_in_background: true`，因为跑全量可能 30 分钟起步。完成后用 `TaskOutput` 拉取日志。

### Step 3：验证

```bash
# 跑完后统计
python3 -c "
import json
ans = json.load(open('src/data/ai-answers.json'))
print('总答案数:', len(ans))
# 各分类覆盖度
data = json.load(open('src/data/tech-interview-questions.json'))
for cat, qs in data['questions'].items():
    total = len(qs)
    covered = sum(1 for q in qs if q['id'] in ans)
    print(f'  {cat}: {covered}/{total} ({covered*100//total if total else 0}%)')
"
```

### Step 4：提交（用户确认后）

```bash
git add src/data/ai-answers.json
git commit -m "feat: 批量生成 <分类> AI 答案"
```

不要自动 push。问用户要不要推。

## 失败处理

- **`API 请求失败 (429)`**：并发降到 2 重跑
- **`API 请求失败 (401/403)`**：token 失效，停下来问用户
- **`JSONDecodeError` / 网络超时**：脚本会跳过该题继续，记录在日志里。跑完后扫一遍日志统计失败题数，问用户要不要补跑
- **空答案警告**：检查 prompt 是否被截断（极少见），可单独重跑该 id

## 关键约束

1. **不要修改脚本的核心逻辑**。如果需要改 prompt、加字段，先跟用户确认。
2. **跑之前必须先 dry-run 报数字**（多少分类、多少题、估算耗时），让用户拍板。
3. **ai-answers.json 是大文件**（1MB+），commit 时单独 add 这个文件。
4. **不要改 key 格式**。key 必须是题目稳定 id（`{slug}-{序号}`，如 `my-ql-001`、`java-001`），由 `q.id` 字段直接使用；`make_question_id()` 已切到读 `q['id']`，不要再回退到"题文前 40 字"实现（那是历史脏数据来源）。历史脏数据用 `scripts/migrate_ai_answers_keys.py` 迁移，迁移后未匹配的 key（如 `other-xxx`）直接丢弃。

## 相关文件

- `scripts/generate_ai_answers.py` — 批量生成主脚本
- `scripts/migrate_ai_answers_keys.py` — 题目文本 key → 稳定 id key 的迁移脚本
- `scripts/add_question_ids.py` — 给 tech-interview-questions.json 题目补 id 字段
- `src/data/tech-interview-questions.json` — 题库（含 id 字段）
- `src/data/ai-answers.json` — 答案库（key = id）
- `ai-config.json` — AI 配置（可选；环境变量优先）
- `src/services/techInterviewAnswerGenerationService.ts` — 在线单题生成的实现（脚本的 prompt/streaming 复刻了这里的逻辑）
