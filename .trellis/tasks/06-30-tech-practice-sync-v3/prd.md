# 大厂面经 v3 云同步（共享AI+私有追问笔记）

## Goal

把"大厂面经"模块（2764 道题 + AI 答案 + 用户练习记录 + 追问对话）从纯 localStorage 迁到 Supabase，跨设备可用、跨账号隔离。

## 背景（已确认事实）

- Supabase 实例当前只有 `profiles`（1 行）和 `resumes`（9 行）；
- **`tech_interview_questions` / `tech_interview_ai_answers` / `tech_practice_records` / `tech_ai_answers` 都不存在**——v2 文档"已有 2764 道题"假设失效；
- 题库实际数据来源是仓库内 `src/data/...` 的 JSON 文件（待确认具体路径）；
- 现有 `src/services/techInterviewSupabaseApi.ts` 引用了 `tech_interview_ai_answers` 表但调用永远 404，等于"死代码"。

## 核心决策（已定）

| 决策点 | 选 |
|---|---|
| AI 答案共享 vs 私有 | **A1：共享 + 私有追问**（AI 答案跨用户只读共享；追问对话 + 个人笔记 + 练习状态私有） |
| question_id 类型 | **`text`（PK）**——题库 JSON 原始 `id` 字段（如 `my-ql-001`）全局唯一且稳定，作为主键；bigint 没有性能收益（2764 行小表），且会丢失业务可读性 |
| 同步粒度 | 行级（v2 决策保留） |
| 离线 / 断网支持 | 支持（沿用 v2 决策：localStorage 是 source of truth，pendingQueue 缓冲） |
| 公共表写入权限 | **仅 service_role**（无 insert/update/delete 策略，anon/authenticated 不可写） |

## 数据模型

### 公共表（所有用户共享只读）

```sql
-- 题目主表
create table tech_interview_questions (
  id            bigserial primary key,
  question_text text not null,
  mention_count int not null default 1,
  companies     jsonb not null default '[]',
  tech_field    varchar(100),
  position      varchar(100),
  round         varchar(50),
  note_id       varchar(100),
  note_title    varchar(255),
  link          text,
  published_at  varchar(50),
  source        varchar(20) not null default 'bundled',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- AI 答案（每题一份，跨用户共享；**不放 conversations**）
create table tech_interview_ai_answers (
  id          bigserial primary key,
  question_id bigint not null references tech_interview_questions(id) on delete cascade,
  answer      text not null,
  updated_at  timestamptz not null default now(),
  unique (question_id)
);
```

### 私有表（每用户独立，RLS 隔离）

```sql
-- 个人练习状态
create table tech_practice_records (
  user_id     uuid not null references auth.users(id) on delete cascade,
  question_id bigint not null references tech_interview_questions(id) on delete cascade,
  mastery     text not null default 'unpracticed'
                 check (mastery in ('unpracticed','practicing','mastered','weak')),
  answer      text not null default '',
  notes       text not null default '',
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- 个人追问对话
create table tech_user_ai_conversations (
  user_id      uuid not null references auth.users(id) on delete cascade,
  question_id  bigint not null references tech_interview_questions(id) on delete cascade,
  conversations jsonb not null default '[]' check (jsonb_typeof(conversations) = 'array'),
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  primary key (user_id, question_id)
);
```

### RLS 策略

- `tech_interview_questions` / `tech_interview_ai_answers`：
  - **所有 authenticated + anon 可读**（`for select using (true)`；为了让免登录用户也能浏览题库）
  - **写权限仅 service_role**（无 `for insert/update/delete` 策略 → anon/authenticated 无写权）
  - 公共表写入由 SQL migration 一次性灌入，题库更新走后续 migration 脚本
- `tech_practice_records` / `tech_user_ai_conversations`：仅本人 `(user_id = auth.uid())`

## 已澄清决策

- RLS-1：✅ **公共 AI 答案写入仅 service_role**（由 SQL migration 一次性预填 + 后续脚本维护；前端用户只读）
- AUTH-1：✅ **继续 anon 直连**（不引入 Edge Function / 独立后端；所有同步逻辑在浏览器内）
- SEED-1：✅ **SQL migration 嵌入全量 2764 道题**（按文件名前缀分版本号，Supabase Studio 可贴入执行；结构 + 数据都随 git 审计）
- SEED-2：题库更新走后续 migration（不引入运行时拉取 JSON）；用户贡献走管理员后台流程
- MIGRATE-1：localStorage 中 2764 条 `practiceRecords` 首次启用云同步时进入 pull-then-push 行级合并
- MIGRATE-2：localStorage 中 2764 条 `aiAnswers`（含 conversations）首次启用云同步时进入 pull-then-push 行级合并
- AI-1：✅ **已定 (b)** —— 公共表 `tech_interview_ai_answers` 只读（service_role 写一次预填）；用户在前端点"生成 AI 答案"时写到 `tech_user_ai_conversations`（仅 conversations，无 answer_text 字段）
- AI-2：✅ **共享 AI + 私有追问独立表** —— `tech_user_ai_conversations` 只存追问对话，**不存 answer 字段**（与公共 `tech_interview_ai_answers.answer` 语义不再重叠）
- AI-3：UI 行为已定 **b2** —— 公共 AI 答案永远显示在上方；用户追问对话在下方折叠卡片"我的追问笔记"
- AI-4：用户追问的 conversations 私有，删除/清空都不影响公共表

## 验收标准（草案）

- [ ] 在 Supabase 上跑完 migration 后，四张表都建出来，RLS 配置正确
- [ ] 2764 道题 seed 完成后，匿名/认证用户都能从 Supabase 读到
- [ ] 注册用户首次进入应用看到「启用云同步」对话框，三选项（立即启用 / 暂不 / 帮助）
- [ ] 启用后，localStorage 的练习记录和追问对话能合并到云端（不丢任何一端）
- [ ] 用户 A 看不到用户 B 的 `tech_practice_records` / `tech_user_ai_conversations`
- [ ] 用户 A 第一次为某道题生成 AI 答案，B 打开同题时**直接看到 A 生成的答案**（不再重复生成）
- [ ] 用户 A 的追问对话对 B 不可见
- [ ] 两台设备同时改同一道题的 mastery，能看到行级冲突横幅
- [ ] 断网下编辑 N 道题，恢复网络后自动 flush
- [ ] 注销账号 → cascade 删 `tech_practice_records` / `tech_user_ai_conversations` 行
- [ ] `npm run build` 通过；`npm run lint` 通过

## 范围外（明确不做）

- 多人协作（同一账号多端实时同步）：last-write-wins + 冲突抽屉，不做 CRDT/OT
- 历史版本回滚
- 题目本身云端编辑走"管理员后台"流程，不属于本任务