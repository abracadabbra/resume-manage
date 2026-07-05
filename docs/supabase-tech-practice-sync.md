# 大厂面经练习记录 Supabase 同步方案（修订 v3）

> 修订要点 v2→v3：AI 答案拆分设计 → 实际为「公共 AI 答案 + 私有追问对话」两张表，同步架构对应调整。补 RLS、改用 `uuid` 对齐 `auth.uid()`、pull-then-push + 真正的冲突分支、index 元数据 + 详情懒加载、批处理 + pendingQueue、首次同步迁移路径、触发时机与失败可恢复。

## 背景

大厂面经的练习记录（熟练度、用户回答、笔记、AI 参考答案、追问对话）目前只存在 `localStorage`，丢数据风险高，无法跨设备。题库已用 `question_bank_states`（单行 JSONB）接入 Supabase；大厂面经数据量（2764 道题 × 练习 + AI 答案 + 对话）太大，不能复用单行 JSONB 模式，必须按行增量同步。

## 1. 数据模型决策

### 1.1 四张表

```sql
-- ── 公共只读表（所有角色可读，仅 service_role 写入） ──

-- 题库：每行一道题（公共引用数据）
create table tech_interview_questions (
  id            text        primary key,
  question_text text        not null,
  mention_count int         not null default 1,
  companies     jsonb       not null default '[]'::jsonb,
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

-- AI 公共参考答案：每题一份，跨用户共享，只读
create table tech_interview_ai_answers (
  question_id text        primary key
              references tech_interview_questions(id) on delete cascade,
  answer      text        not null,
  updated_at  timestamptz not null default now()
);

-- ── 私有表（RLS 隔离，仅本人读写） ──

-- 练习记录：每行一道题
create table tech_practice_records (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  question_id text        not null references tech_interview_questions(id) on delete cascade,
  mastery     text        not null default 'unpracticed'
                           check (mastery in ('unpracticed','practicing','mastered','weak')),
  answer      text        not null default '',
  notes       text        not null default '',
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index idx_tech_practice_records_user_updated
  on tech_practice_records (user_id, updated_at desc);

-- 个人追问对话：不存 answer 文本（与公共表语义不重叠）
-- conversations 用 JSONB 存 [{role, content, ts}, ...]
create table tech_user_ai_conversations (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  question_id   text        not null references tech_interview_questions(id) on delete cascade,
  conversations jsonb       not null default '[]'::jsonb
                              check (jsonb_typeof(conversations) = 'array'),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index idx_tech_user_ai_conversations_user_updated
  on tech_user_ai_conversations (user_id, updated_at desc);
```

**v3 关键设计**（相对 v2 概念稿）：

| v2 概念 | v3 实际 | 理由 |
|---|---|---|
| 单表 `tech_ai_answers` (answer + conversations per-user) | 拆分：`tech_interview_ai_answers`（公共） + `tech_user_ai_conversations`（私有） | 公共答案 2764 行共享只读，无需每用户复制；私有对话按用户隔离 |
| `tech_interview_questions` 无 RLS | ✅ `ENABLE RLS` + public SELECT policy | 统一 RLS 策略，避免表级豁免 |
| `user_id` 用 `uuid` 引用 `auth.users(id)` | ✅ 私有表全部对齐 | RLS 可直接用 `auth.uid()` 比 UUID cast |
| `mastery` 无 CHECK | ✅ `check (mastery in (...))` | 防止脏值 |
| `conversations` 无约束 | ✅ `check (jsonb_typeof = 'array')` | 防止写入非数组脏数据 |
| `on delete cascade` | ✅ 私有表 + 公共 ref 表全 cascade | 注销自动清理，不产生孤儿行 |

### 1.2 行级安全（RLS）

```sql
-- 公共表：所有角色可读
alter table tech_interview_questions  enable row level security;
alter table tech_interview_ai_answers enable row level security;

create policy "public read questions"    on tech_interview_questions  for select using (true);
create policy "public read ai answers"   on tech_interview_ai_answers for select using (true);
-- 故意不写 INSERT/UPDATE/DELETE 策略 → 仅 service_role 绕过 RLS 写入

-- 私有表：仅本人读写
alter table tech_practice_records      enable row level security;
alter table tech_user_ai_conversations enable row level security;

create policy "own practice rows" on tech_practice_records
  for all to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "own conversation rows" on tech_user_ai_conversations
  for all to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
```

`anon` 角色对私有表无任何权限（与 `question_bank_states` 保持一致）。

### 1.3 自动维护 `updated_at`

```sql
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

create trigger trg_tech_practice_records_updated
  before update on tech_practice_records
  for each row execute function set_updated_at();

create trigger trg_tech_user_ai_conversations_updated
  before update on tech_user_ai_conversations
  for each row execute function set_updated_at();

create trigger trg_tech_interview_ai_answers_updated
  before update on tech_interview_ai_answers
  for each row execute function set_updated_at();
```

前端 upsert 私有表时**不**传 `updated_at`，由 trigger 维护，避免客户端时钟漂移。

## 2. 同步架构

### 2.1 三个关键概念

| 概念 | 含义 |
|---|---|
| `lastSyncedAt` | 本地最后一次成功同步的墙钟时间戳（ms），存 localStorage `tech-interview-sync-state.json` |
| Pull-then-Push | 每次同步先拉云端 delta 合并，再推本地 delta，**单向时序**避免竞态覆盖 |
| Conflict | **行级**：同一 `question_id` 在 pull 时云端 `updated_at > lastSyncedAt` 且本地 `updated_at > lastSyncedAt` |

> v3 冲突只针对私有表（`tech_practice_records` / `tech_user_ai_conversations`）；公共表 `tech_interview_questions` / `tech_interview_ai_answers` 为只读 source of truth，无冲突。

### 2.2 同步状态文件（localStorage）

```ts
interface TechInterviewSyncState {
  schemaVersion: 1
  lastSyncedAt: number | null        // ms epoch
  pendingPush: {                      // 断网/失败的待重试集合
    practice:      string[]           // question_id[] → tech_practice_records
    conversations: string[]           // question_id[] → tech_user_ai_conversations
  }
}
```

key `tech-interview-sync-state.json`；清缓存 = 退化为"首次同步"，不是数据丢失（云端为准）。

### 2.3 Pull 阶段（4 个来源并发）

```
Promise.all([
  fetchQuestionsMeta(),       → tech_interview_questions (id, mention_count, tech_field, position, updated_at)
  fetchAiAnswersMeta(),       → tech_interview_ai_answers (question_id, updated_at)
  fetchPracticeMeta(),        → tech_practice_records    (question_id, mastery, updated_at)
  fetchConversationsMeta(),   → tech_user_ai_conversations (question_id, updated_at)
])
```

- 公共表元数据只用于更新本地 `lastSyncedAt`，不写入本地 practice/conversation 存储
- 私有表元数据做行级 LWW 合并（§3.1 / §3.2）

### 2.4 Push 阶段（2 个路径并发）

```
Promise.all([
  upsertPracticeBatch(rows),      → tech_practice_records
  upsertConversationsBatch(rows), → tech_user_ai_conversations
])
```

- 单表单批 200 行，失败行进入 `pendingPush` 重试队列
- 冲突行跳过自动 push，等待冲突 UI 解决

## 3. 同步流程

### 3.1 首次同步（`lastSyncedAt === null`）

1. 并发拉 4 表元数据（§2.3），取全部行的 `updated_at` 最大值设为 `lastSyncedAt`。
2. 私有表合并（逐行 `updated_at` 比较，新者胜）：
   - **本地无、云端有** → 写入本地（mastery 可见，answer/notes/conversations 留懒加载）
   - **本地有、云端无** → 标记 `pendingPush`
   - **两边都有** → 逐行比较 `updated_at`，新者胜
3. 详情（`answer` / `notes` / `conversations`）**不主动拉**，仅在用户首次打开题目时按 `question_id` 单行 lazy load。
4. 推本地 `pendingPush` 行（走 §3.4 批量 upsert）。

### 3.2 增量同步（`lastSyncedAt !== null`）

**Pull 阶段：**
1. 拉 4 表 `updated_at > lastSyncedAt` 的行（只选元数据列）。
2. 对公共表元数据行 → 只更新 `lastSyncedAt`，不写本地。
3. 对私有表元数据行 → 逐行 LWW：
   - 本地不存在 → 写入；
   - 本地 `updated_at >=` 云端 → 保留本地；
   - 本地 `updated_at <` 云端 → 用云端覆盖；
   - **本地 `updated_at > lastSyncedAt` 且云端 `updated_at > lastSyncedAt`** → 入冲突队列，**不阻塞**非冲突行。

**Push 阶段：**
1. 遍历本地 `practiceRecords` / `aiConversations`，筛 `updated_at > lastSyncedAt` 且不在本次冲突集合的行。
2. 走 §3.4 批量 upsert。
3. 推送成功后 `lastSyncedAt = max(success row's updated_at)`，从 `pendingPush` 移除。

### 3.3 行级冲突 UI

```ts
type ConflictKind = 'practice' | 'conversation'

type ConflictMap = Record<string /* question_id */, {
  local: PracticeSnapshot | ConversationSnapshot
  cloud: PracticeSnapshot | ConversationSnapshot
  kind: ConflictKind
}>
```

UI：进入 `TechInterviewPanel` 时若冲突数 > 0，显示**非阻塞横幅**：

> 检测到 N 道题在两台设备上都有更新：[查看冲突]

点开抽屉逐题展示，提供：
- `使用本地` → 强制 upsert 本地数据到云端
- `使用云端` → 用云端数据覆盖本地
- `同时保留`（仅 practice 适用）→ 云端 answer 追加到本地末尾（带日期分隔符）

解决一道就 upsert 一道 + 从 `conflictMap` 移除；全部解决后清空 `lastSyncedAt` 之上的冲突标记。

### 3.4 批量 upsert + 失败重试

```ts
async function upsertPracticeBatch(rows: PracticeRecordRow[]): Promise<string[]> {
  if (rows.length === 0) return []
  const failed: string[] = []
  const BATCH = 200
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const payload = batch.map(({ question_id, mastery, answer, notes, user_id }) => ({
      question_id, user_id, mastery, answer, notes,
    }))
    const { error } = await supabase
      .from('tech_practice_records')
      .upsert(payload, { onConflict: 'user_id,question_id' })
    if (error) failed.push(...batch.map(r => r.question_id))
  }
  return failed
}
```

- 单批 200 行，失败行入 `pendingPush`，**不抛错**
- 同一行连续失败 ≥ 3 次 → `shouldGiveUp` 跳过，UI 展示 `syncError`
- `conversations` 表同理（`upsertConversationsBatch`）

### 3.5 触发时机

| 事件 | 行为 |
|---|---|
| 登录成功 | 后台 pull（不阻塞 UI） |
| 进入 `TechInterviewPanel` | 后台 pull |
| 离开 `TechInterviewPanel` | flush `pendingPush` |
| 编辑一道题（debounce） | 加入 `pendingPush` 队列 |
| AI 追问完成 | 立即 push（对话增长快） |
| `navigator.onLine` 恢复 | flush `pendingPush` |
| 手动按钮「立即同步」 | 强制 full pull-then-push |

后台同步**不抢焦点**、不阻塞输入；UI 只反映 `cloudSyncStatus`。

## 4. 数据迁移（首次启用）

localStorage 中已有的 2764 道题练习记录 + AI 对话，必须**显式迁移**：

1. 用户首次登录后弹一次「启用云同步」对话框，说明：
   - 启用后：本地练习记录和 AI 对话将**作为新数据**推送到云端
   - 如果云端已有内容（其他设备），进入**逐行合并**流程（同 §3.1）
2. 用户拒绝 → 保持 localStorage only，云同步按钮置灰
3. 迁移完成后写入 `syncState`

> 本地 AI 回答文本（`AiAnswerData.answer`）不走迁移——云端公共表是权威来源，首次拉取后覆盖本地。

## 5. 实现清单

| 文件 | 改动 |
|---|---|
| `supabase/migrations/001..006_*.sql` | 4 表 + 索引 + RLS + trigger |
| `src/services/techInterviewSupabaseApi.ts` | 8 个 API 函数：`fetchQuestionsMeta/fetchQuestionDetail` `fetchAiAnswersMeta/fetchAiAnswerByQid` `fetchPracticeMeta/fetchPracticeDetail/upsertPracticeBatch` `fetchConversationsMeta/fetchConversationsDetail/upsertConversationsBatch/deleteConversations` |
| `src/stores/techInterviewSyncState.ts` | 持久化 `lastSyncedAt` + `pendingPush`（`practice` / `conversations`） |
| `src/stores/techInterviewCloud.ts` | Cloud manager：4 源并发 pull、2 路径并行 push、行级冲突、pendingQueue、懒加载 |
| `src/stores/techInterviewQuestions.ts` | 注入 `CloudStoreAdapter`；3 组数据：`aiAnswers`（含公共答案）、`aiConversations`、`practiceRecords`；setPractice/setConversation 触发 push |
| `src/components/tech-interview/TechInterviewPanel.vue` | 云同步状态徽章、最后同步时间、手动「立即同步」按钮、冲突抽屉入口 |
| `src/components/tech-interview/CloudSyncBanner.vue` | 冲突横幅组件 |
| `src/components/tech-interview/CloudSyncConflictDialog.vue` | 冲突解决抽屉 |
| `src/components/tech-interview/TechQuestionDetail.vue` | 打开题目时懒加载公共 AI answer + 私有 practice 详情 + conversation 详情 |

## 6. 与 `decideSyncDecision` 的关系

`decideSyncDecision`（`src/stores/syncConflict.ts`）是整体时间戳粒度判断，仅适合题库（单行 JSONB）。大厂面经是行级，不复用。

- 整体入口同步：写一个 `decideTechInterviewOverallDecision(latestLocalUpdatedAt, latestCloudUpdatedAt, lastSyncedAt)`，用来决定「是否需要 pull / push」（减少无意义网络请求）
- 行级冲突：每行独立比较 `updated_at`，**不调用** `decideSyncDecision`

命名分开：`TechInterviewRowConflict` vs `QuestionBankOverallConflict`。

## 7. 边界与已知限制

- 2764 行 × `conversations` JSONB 单行可能膨胀（追问 100 轮 × 每轮 2KB ≈ 200KB/行），单行超 1MB 时 Supabase 会拒
  - **缓解**：实施监控；超阈值的题目提示用户清理旧对话
- 网络分区：pull 成功 / push 部分失败时，`lastSyncedAt` 只更新到 push 成功的最后一行，**不**回退到 pull 时间点
- 跨账号：注销 → cascade 删私有表行；切换账号 → 清空 `syncState` + 内存 store（保留 localStorage 直到下次覆盖）
- 离线写入：localStorage 仍是 source of truth，云端只做 replication
- 公共 AI 答案（`tech_interview_ai_answers`）由后台 `service_role` 维护，前端只读取不做 upsert

## 8. 验收清单

- [ ] 4 表全部启用 RLS，私有表用 `auth.uid()` 隔离，公共表 public SELECT
- [ ] 登录后 5s 内完成首屏 4 源元数据并发拉取（不阻塞 UI）
- [ ] 私有表详情按需懒加载，重复打开不重复请求
- [ ] 两台设备同时改同一道题，能看到行级冲突横幅，不丢另一端数据
- [ ] 断网下编辑 N 道题，恢复后自动 flush
- [ ] 批量 upsert 中途部分失败，失败行入重试队列，不丢本地修改
- [ ] 注销账号后私有表对应行被 cascade 删除
- [ ] 清除 localStorage 后重新进入，触发首次同步，不出现"假冲突"

## 9. 与题库同步的差异

| 维度 | 题库 `question_bank_states` | 大厂面经 v3 |
|---|---|---|
| 表数量 | 1（单行 JSONB） | 4（2 公共只读 + 2 私有 CRUD） |
| 同步表 | — | 私有表：`tech_practice_records` + `tech_user_ai_conversations` |
| 公共表 | 无 | `tech_interview_questions` + `tech_interview_ai_answers` 读元数据更新 lastSyncedAt |
| 主键 | `(user_id)` | `(user_id, question_id)` |
| 同步粒度 | 全量 JSONB | 行级增量 |
| 冲突粒度 | 整体时间戳 → 整表冲突 | 行级 → 抽屉式逐题解决 |
| 详情加载 | 随全量一起 | 懒加载（按 question_id） |
| 数据规模 | 数百题 × 3 类 | 2764 题 × 2 私有表 |
| 离线重试 | 单行 upsert | 批量 200 / 批 + pendingQueue |
| RLS | `auth.uid()` | `auth.uid()`（对齐） |
| 触发时机 | 主要手动 | 自动 + 手动 |

## 10. 不在本方案范围

- 多人协作（同一账号多端实时同步）：当前是 last-write-wins + 冲突抽屉，不做 CRDT / OT
- 题目内容云端编辑：题目本身是公共表，不在用户私有同步范围
- 历史版本回滚：不做；如需要后续单独讨论