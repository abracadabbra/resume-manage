# 大厂面经 v3 云同步 — Technical Design

## 1. 边界与职责

### 1.1 模块边界

| 层 | 模块 | 职责 |
|---|---|---|
| 持久化 | `supabase/migrations/*` | 表结构、索引、RLS、trigger、seed SQL |
| 持久化 | localStorage (`tech-interview-*` namespace) | 离线缓存、sync state、pendingQueue |
| API 层 | `src/services/techInterviewSupabaseApi.ts` | Supabase REST 调用封装（按表拆函数） |
| 状态层 | `src/stores/techInterviewCloud.ts` | 同步状态机、pull-then-push、冲突聚合、pendingQueue flush |
| 状态层 | `src/stores/techInterviewSyncState.ts` | 持久化 `lastSyncedAt` + `pendingPush` |
| Store | `src/stores/techInterviewQuestions.ts` | 题库/AI/练习/追问的内存状态；写入时通知 cloud manager |
| UI | `TechInterviewPanel.vue` + `CloudSyncBanner.vue` + `CloudSyncConflictDialog.vue` | 状态徽章、手动同步、冲突抽屉 |

### 1.2 数据所有权

| 表 | 写入方 | 读取方 | 备注 |
|---|---|---|---|
| `tech_interview_questions` | SQL migration / 后续 migration | anon + authenticated | 公共只读 |
| `tech_interview_ai_answers` | SQL migration / 后续 migration | anon + authenticated | 公共只读；前端不写 |
| `tech_practice_records` | 当前用户（RLS） | 当前用户 | 私有 |
| `tech_user_ai_conversations` | 当前用户（RLS） | 当前用户 | 私有，仅 conversations |
| `tech-interview-sync-state` (localStorage) | 本地 | 本地 | sync 协调态 |

**前端直连 Supabase（anon key）**；service_role 仅在 migration 灌数据时使用（不进前端代码、不进 git secrets）。

## 2. 同步状态机

### 2.1 状态枚举

```ts
type CloudSyncStatus =
  | { kind: 'idle' }
  | { kind: 'pulling' }
  | { kind: 'pushing'; queueSize: number }
  | { kind: 'ok'; lastSyncedAt: number }
  | { kind: 'partial'; lastSyncedAt: number; failed: string[] }
  | { kind: 'offline'; lastSyncedAt: number | null }
  | { kind: 'error'; message: string }
```

### 2.2 状态转换

```
idle ──pull()──> pulling ──┬──ok ── push() ──> pushing ──┬──ok
                            │                              │
                            └──empty──> ok                  └──partial
                                                                      │
offline ◀── navigator.onLine === false ───────────────────────────────┘
error  ◀── 网络/RLS/表不存在 等不可恢复错误
```

`pushing` 与 `pulling` 互斥；先 pull 后 push 串行执行。

## 3. Pull-then-Push 协议

### 3.1 首次同步（`lastSyncedAt === null`）

```
1. 拉两表元数据（question_id, mastery/updated_at，不取 answer/conversations）
2. 三集合分类：
   - cloud-only:    直接写入 localStorage 索引
   - local-only:    标记 pendingPush
   - both:          按 updated_at 行级 LWW，冲突入 conflictMap
3. lastSyncedAt = max(all rows' updated_at from cloud)
4. flush pendingPush 走 batchUpsert (chunk 200)
5. 详情懒加载：用户首次打开题目详情时按 question_id 单行取 answer/notes/conversations
```

### 3.2 增量同步（`lastSyncedAt !== null`）

```
PULL:
  cloudRows = 两表 select where updated_at > lastSyncedAt
  for r of cloudRows:
    local = lookup(r.question_id)
    if !local: 写入
    elif local.updated_at >= r.updated_at: skip
    else: 覆盖本地
    if local?.updated_at > lastSyncedAt && r.updated_at > lastSyncedAt:
      conflictMap[r.question_id] = { local, cloud, kind }

PUSH:
  pushRows = practiceRecords ∪ aiConversations
              where updated_at > lastSyncedAt
              && question_id NOT IN conflictMap.keys()  // 冲突行不自动推
  failed = batchUpsert(pushRows)
  pendingPush.recordFailed(failed)
  lastSyncedAt = max(success rows' updated_at)
```

### 3.3 批量 upsert + 失败重试

```ts
async function batchUpsert(table: string, rows: any[]): Promise<string[]> {
  const batches = chunk(rows, 200)
  const failed: string[] = []
  for (const b of batches) {
    const { error } = await supabase.from(table).upsert(
      b, { onConflict: 'user_id,question_id' }
    )
    if (error) failed.push(...b.map(r => r.question_id))
  }
  return failed
}
```

- 失败行进入 `pendingPush`；下次 sync 重试；
- 同一 `question_id` 连续失败 ≥ 3 次 → 进入 `syncError` 列表，UI 显示但不阻塞其它同步；
- `lastSyncedAt` 只推进到**最后一行成功**的 `updated_at`，不回退。

### 3.4 触发时机

| 事件 | 行为 |
|---|---|
| `auth.signIn()` 成功 | 后台 pull（不阻塞 UI） |
| 进入 `TechInterviewPanel` | 后台 pull |
| 编辑 mastery / answer / notes | debounce 1500ms → 加入 pendingPush |
| 追问对话新增 message | 立即 push（增长快） |
| 离线 → 上线 (`online` 事件) | flush pendingPush |
| 用户点击「立即同步」 | 强制 full pull-then-push |

## 4. 行级冲突 UI

### 4.1 冲突状态

```ts
type ConflictKind = 'practice' | 'conversation'
type ConflictMap = Record<question_id /* string */, {
  kind: ConflictKind
  local: { mastery, answer, notes, updated_at } | { conversations, updated_at }
  cloud: 同上
}>
```

> 用字符串 key 防止 question_id 是 PG text 主键；前端 JSON 序列化无精度问题。

### 4.2 UI 行为

- 进入 `TechInterviewPanel` 时 `Object.keys(conflictMap).length > 0` → 顶部非阻塞横幅 `CloudSyncBanner.vue`；
- 点开抽屉 → 逐题展示三个选项：
  - `使用本地` → 立即 upsert 本地覆盖云端，从 conflictMap 移除
  - `使用云端` → 直接覆盖本地，从 conflictMap 移除
  - `合并`（仅 practice）→ 把云端 answer 追加到本地 answer 末尾（带日期分隔符），再 upsert
- AI 追问 conversations 不提供合并（直接二选一）；
- 解决一道立即 sync，不等待全部解决。

## 5. 数据迁移路径

### 5.1 localStorage → 云端 首次同步

用户首次启用云同步（登录后弹一次「启用云同步」对话框）：

1. **不删 localStorage**，把它当云端的本地副本；
2. 走 §3.1 首次同步协议；
3. `lastSyncedAt` 写入 `tech-interview-sync-state.json`；
4. 用户拒绝 → 保持 localStorage only，云同步按钮置灰。

### 5.2 题目详情懒加载

`TechQuestionDetail.vue` 打开时：
- 本地已有 `practiceRecord.answer` / `aiAnswerData.conversations` → 直接用；
- 本地缺 → 调 `getTechPracticeDetail(qid)` / `getTechAiConversationsDetail(qid)`，写入 localStorage；
- 同一题**不重复请求**（内存缓存 + LRU）。

## 6. Schema（最终）

```sql
-- 公共只读，由 SQL migration 灌入
create table tech_interview_questions (
  id            bigserial primary key,
  question_text text not null,
  mention_count int  not null default 1,
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

create table tech_interview_ai_answers (
  id          bigserial primary key,
  question_id text primary key references tech_interview_questions(id) on delete cascade,
  answer      text not null,
  updated_at  timestamptz not null default now()
);

-- 私有 RLS
create table tech_practice_records (
  user_id     uuid not null references auth.users(id) on delete cascade,
  question_id text not null references tech_interview_questions(id) on delete cascade,
  mastery     text not null default 'unpracticed'
                 check (mastery in ('unpracticed','practicing','mastered','weak')),
  answer      text not null default '',
  notes       text not null default '',
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table tech_user_ai_conversations (
  user_id      uuid not null references auth.users(id) on delete cascade,
  question_id  text not null references tech_interview_questions(id) on delete cascade,
  conversations jsonb not null default '[]' check (jsonb_typeof(conversations) = 'array'),
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- 索引
create index idx_tech_practice_records_user_updated
  on tech_practice_records (user_id, updated_at desc);
create index idx_tech_user_ai_conversations_user_updated
  on tech_user_ai_conversations (user_id, updated_at desc);
create index idx_tech_interview_questions_field
  on tech_interview_questions (tech_field, position);

-- updated_at trigger
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;

create trigger trg_tech_practice_records_updated
  before update on tech_practice_records
  for each row execute function set_updated_at();
create trigger trg_tech_user_ai_conversations_updated
  before update on tech_user_ai_conversations
  for each row execute function set_updated_at();
create trigger trg_tech_interview_ai_answers_updated
  before update on tech_interview_ai_answers
  for each row execute function set_updated_at();

-- RLS
alter table tech_interview_questions    enable row level security;
alter table tech_interview_ai_answers   enable row level security;
alter table tech_practice_records       enable row level security;
alter table tech_user_ai_conversations  enable row level security;

-- 公共表：所有角色可读，无写策略（service_role 绕过 RLS）
create policy "public read"  on tech_interview_questions  for select using (true);
create policy "public read"  on tech_interview_ai_answers for select using (true);

-- 私有表：本人读写
create policy "own rows" on tech_practice_records
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on tech_user_ai_conversations
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
```

## 7. Migration 文件拆分

```
supabase/migrations/
  001_tech_interview_questions.sql         -- 题目表结构 + 索引
  002_tech_interview_ai_answers.sql        -- 公共 AI 答案表
  003_tech_practice_records.sql            -- 私有练习记录
  004_tech_user_ai_conversations.sql       -- 私有追问对话
  005_tech_rls_policies.sql                -- RLS 策略
  006_tech_updated_at_triggers.sql         -- updated_at trigger
  007_seed_tech_interview_questions.sql    -- 2764 道题 seed INSERT
  008_seed_tech_interview_ai_answers.sql   -- AI 答案 seed INSERT
```

执行方式：
- 本地：`supabase db push`
- 远端：贴入 Supabase Studio SQL Editor 逐文件执行（db push 也行）

## 8. 前端模块改造

### 8.1 `techInterviewSupabaseApi.ts`

按表拆函数，职责单一：

```ts
// 题库（公共只读）
fetchQuestionsMeta(): Promise<QuestionMeta[]>
fetchQuestionDetail(qid: string): Promise<QuestionRow | null>

// AI 答案（公共只读）
fetchAiAnswerByQid(qid: string): Promise<string | null>
fetchAiAnswersMeta(): Promise<{ question_id, updated_at }[]>

// 私有 - practice
fetchPracticeMeta(): Promise<PracticeMeta[]>
fetchPracticeDetail(qid: string): Promise<PracticeRecord | null>
upsertPracticeBatch(rows: PracticeRecord[]): Promise<string[]>

// 私有 - conversations
fetchConversationsMeta(): Promise<ConversationMeta[]>
fetchConversationsDetail(qid: string): Promise<AiConversationRecord | null>
upsertConversationsBatch(rows: AiConversationRecord[]): Promise<string[]>
```

所有写入函数**只接收 4 列**：`user_id, question_id, <payload>, updated_at`。trigger 维护 updated_at。

### 8.2 `techInterviewCloud.ts`（新建）

```ts
class TechInterviewCloud {
  status: Ref<CloudSyncStatus>
  conflicts: Ref<ConflictMap>
  syncError: Ref<string[]>

  pull(): Promise<void>
  push(): Promise<void>
  pullThenPush(): Promise<void>
  resolveConflict(qid: string, choice: 'local' | 'cloud' | 'merge'): Promise<void>
  flushPending(): Promise<void>
  schedulePush(qid: string, kind: 'practice' | 'conversation'): void
}
```

**关键约束**：
- 跨设备时（同一 user 多个标签页）通过 `BroadcastChannel('tech-interview-sync')` 协调，避免多 tab 重复 push；
- `pullThenPush` 全程持有 mutex（`running` flag），新触发会被忽略或在运行结束后排队；
- `navigator.onLine === false` 时所有网络调用直接进 `offline` 状态，写入 pendingQueue 等待 `online` 事件。

### 8.3 `techInterviewQuestions.ts` store 改造

注入 cloud manager 后，store 写操作分两类：

- **本地优先**：写入内存 + localStorage，**同步**调用 `cloud.schedulePush(qid, kind)`；
- **云端覆盖**：仅当 pull 阶段确认 `cloud.updated_at > local.updated_at` 时覆盖本地。

UI 不直接读 `techInterviewSupabaseApi.ts`，只读 store；store 暴露 `cloudSyncStatus` / `cloudConflicts` / `syncError` 三个 computed。

## 9. 失败恢复矩阵

| 失败点 | 表现 | 恢复 |
|---|---|---|
| pull 网络失败 | status → `error` | 手动同步重试；不影响本地写入 |
| push 部分失败 | status → `partial`，failed 入 pendingPush | 下次 sync 自动重试 |
| push 全部失败 | status → `error`，pendingPush 保留 | 手动同步或 online 事件触发 |
| RLS 拒（user_id 不匹配） | status → `error`，message 含 RLS 提示 | 用户重新登录 |
| localStorage 损坏 / 满 | store 初始化抛错 | 捕获后仅用内存 + 云端，回写前提示用户清理 |
| `BroadcastChannel` 不可用 | 多 tab 重复 push | 退化：依赖 updated_at LWW + 冲突抽屉 |
| 题库 2764 行 JSONB 超 1MB | Supabase 拒 | trigger 客户端分块；超阈值的题目提示用户清理旧对话 |

## 10. 性能与边界

- 题库 2764 行单次拉元数据（id + 必要字段）< 1MB，符合 Supabase 默认 `request_body_size_limit`；
- 单批 upsert 上限 200 行（来自经验值）；
- `conversations` 单行可能膨胀（100 轮追问 × 2KB ≈ 200KB/行），超 1MB Supabase 拒；
  - 缓解：UI 显示单题 conversations 大小，超阈提示清理；
- `pull` 阶段只取元数据列，**不取** `answer` / `conversations` 大字段，按需懒加载。

## 11. 兼容性 / 迁移路径

- 旧版本 v2 文档中的 `tech_practice_records` 表若已存在 → 在 migration 顶部加 `drop table if exists ... cascade`；
- 旧 store 中 `aiAnswers: Record<qid, { answer, conversations }>` 拆为：
  - `aiAnswers: Record<qid, { answer: string }>` （公共来源）
  - `aiConversations: Record<qid, AiConversation[]>` （私有）
- 旧 `techInterviewSupabaseApi.ts` 中的 `upsertAiAnswer` 函数删除（公共表不该被前端写）。

## 12. 验收对照（design → prd 映射）

| PRD 验收项 | Design 对应 |
|---|---|
| 四张表 + RLS | §6 Schema + §7 Migration |
| 2764 道题可读 | §6 + §7 migration 007 |
| 「启用云同步」对话框 | §5.1 |
| localStorage 合并 | §3.1 首次同步 |
| RLS 隔离 | §6 RLS 策略 |
| 共享 AI 答案 | §8.1 fetchAiAnswerByQid |
| 追问对话私有 | §8.1 upsertConversationsBatch |
| 行级冲突横幅 | §4 |
| 离线恢复 | §3.4 + §9 |
| cascade 删行 | §6 `references ... on delete cascade` |
| npm run build / lint | Phase 2.2 验证 |

## 13. 不在本 design 范围

- 题库内容编辑流程（管理员后台 / 用户贡献）— 走后续 migration
- AI 生成（公共 AI 答案的初始数据来自 migration 灌入；用户追问调用 OpenAI 走现有 `interviewService.ts`）
- 多端实时 CRDT — last-write-wins + 冲突抽屉已经够用

---

## 14. 云同步抽公共层 (Proposed Refactor)

> **背景**：techInterviewCloud.ts / questionBankCloud.ts / resumeCloud.ts 三套实现高度重复，同步状态机、pendingPush 队列、online/offline 事件、BroadcastChannel 协调逻辑散布在各处。本节将既有发现凝固为可执行的 refactor 方案，不动任何 src/ 代码。

### 14.1 代码差异分析

| 差异点 | techInterviewCloud | questionBankCloud | resumeCloud | 判定 |
|---|---|---|---|---|
| 状态类型 | discriminated union 7 variant | `'idle'\|'pulling'\|'pushing'` | 无独立状态 | **可抽象**：统一 `CloudSyncStatus` union |
| pull/push 关系 | pullThenPush 串行 | pull / push 分离 | push 即保存，无独立 pull | **部分可抽象**：统一 pull-then-push 骨架，hook 可选 |
| 冲突策略 | 行级 LWW + conflictMap | 整体 updatedAt 三值 | 整体 updatedAt 三值 | **可抽象**：`decideSyncDecision` 已通用；conflictMap 结构泛型化 |
| pendingPush 队列 | `techInterviewSyncState` 管理 | 无 | 无 | **已可复用**：techInterviewSyncState 的队列逻辑可泛化 |
| 失败重试 (failedAttempts) | techInterviewSyncState | 无 | 无 | **可抽象**：泛化为 `SyncState` 层 |
| online/offline 监听 | 有 | 无 | 无 | **可抽象**：通用挂载/销毁 |
| BroadcastChannel | 有 | 无 | 无 | **可抽象**：channel name 参数化 |
| 懒加载详情 | 有 | 无 | 无 | **保留**：store-specific |
| 冲突解决选项 | local/cloud/merge(3选) | local/cloud(2选) | local/cloud(2选) | **可抽象**：adapter 提供选项列表 |
| 认证管理 | 无 | 无 | 有 (login/logout/register) | **保留**：auth 逻辑不归云同步管 |
| API 调用 | 按表拆 batch API | 全量快照 get/set | 行 upsert | **保留**：adapter 封装 |
| 数据模型 | PracticeSnapshot / ConversationSnapshot | QuestionBankCloudData (整体快照) | ResumeRecord (行) | **保留**：adapter 封装 |
| 合并策略 | 行级 LWW（首次不报冲突） | 整体快照替换 | 整体快照替换 | **保留**：adapter 策略回调 |

### 14.2 目标与边界

**归入通用层（SyncManager）的职责：**

- `CloudSyncStatus` discriminated union 状态机
- `SyncState`（lastSyncedAt / pendingPush / failedAttempts / enabled）持久化与访问
- pull → 对比 → 冲突检测 → 写入 adapter 的通用骨架
- push → 批量 upsert → 失败重试队列
- online / offline 事件挂载与 cleanup
- BroadcastChannel 多 tab 协调（channel name 参数化）
- `resolveConflict(qid, choice)` 统一调用协议

**留在 store-specific adapter 层的职责：**

- 数据类型（PracticeSnapshot / QuestionBankCloudData / ResumeRecord）
- API 调用（fetchMeta / upsertBatch / getState / setState）
- 合并策略（行级 LWW vs 整体快照替换）
- 懒加载详情逻辑
- auth 登录/登出流程（resumeCloud 独有）
- conflict resolve 后的 merge 语义差异（techInterviewCloud merge 仅 practice 可用）

### 14.3 抽象接口

```ts
// ---------- 通用状态（归 SyncState）----------

interface SyncState {
  schemaVersion: 1
  lastSyncedAt: number | null
  pendingPush: Record<string, string[]>  // kind → qid[]
  failedAttempts: Record<string, number>  // qid → count
  enabled: boolean
}

// ---------- Store-specific adapter ----------

interface CloudStoreAdapter<TData, TConflict> {
  /** 同步前的全量数据快照 */
  getData(): TData
  /** 冲突解决后写入本地 */
  loadData(data: TData): void

  /** 元数据拉取（用于差异对比） */
  fetchMeta(userId: string): Promise<CloudMetaRow[]>
  /** 详情懒加载（可选） */
  fetchDetail?(qid: string, userId: string): Promise<unknown | null>

  /** 批量写入云端 */
  upsertBatch(rows: CloudMetaRow[], userId: string): Promise<string[] /* failed qids */>

  /** LWW 行级合并（可选；不提供则走整体快照替换） */
  mergeRow?(qid: string, local: unknown, cloud: CloudMetaRow): void

  /** 冲突解决选项列表 */
  conflictChoices: ('local' | 'cloud' | 'merge')[]

  /** 用户 ID 获取 */
  userId(): string | null
}

// ---------- CloudStoreAdapter 的行元数据约定 ----------

interface CloudMetaRow {
  qid: string
  updated_at: number  // epoch ms
  data: unknown       // 序列化 payload（adapter 负责解释）
}

// ---------- 通用 SyncStatus（统一三套的 discriminated union）----------

type CloudSyncStatus =
  | { kind: 'idle' }
  | { kind: 'pulling' }
  | { kind: 'pushing'; queueSize: number }
  | { kind: 'ok'; lastSyncedAt: number }
  | { kind: 'partial'; lastSyncedAt: number; failedCount: number }
  | { kind: 'offline'; lastSyncedAt: number | null }
  | { kind: 'conflict'; count: number }
  | { kind: 'error'; message: string }

// ---------- 通用 SyncManager factory ----------

interface SyncManagerOptions<TData, TConflict> {
  adapter: CloudStoreAdapter<TData, TConflict>
  /** 每种 kind 对应 pendingPush 的 key，缺省 ['default'] */
  pushKinds?: string[]
  /** BroadcastChannel name；缺省 null 表示禁用 */
  channelName?: string
  /** 最大重试次数；缺省 3 */
  maxRetries?: number
  /** 冲突兜底策略：首次同步不报冲突；缺省 true */
  skipFirstSyncConflict?: boolean
}

function createSyncManager<TData, TConflict>(
  options: SyncManagerOptions<TData, TConflict>
): SyncManager
```

```ts
// ---------- SyncManager 返回接口 ----------

interface SyncManager {
  status: Ref<CloudSyncStatus>
  conflicts: Ref<Record<string, TConflict>>
  /** 强制完整 pull-then-push */
  sync(): Promise<void>
  /** 仅 push pendingQueue */
  flush(): Promise<void>
  /** 单条入队（本地变更触发） */
  schedulePush(qid: string, kind: string): void
  /** 冲突解决 */
  resolveConflict(qid: string, choice: 'local' | 'cloud' | 'merge'): Promise<void>
  /** 启用/停用云同步 */
  enable(): void
  disable(): void
  /** 销毁（清理事件监听） */
  destroy(): void
}
```

### 14.4 迁移计划（Phase A → D）

> **原则**：渐进迁移，每 phase 独立验收，不阻塞 v3 主任务进度。  
> **新架构命名为** `src/stores/sync/` 目录。

#### Phase A：抽共享 SyncState（独立文件）

**目标**：把 `techInterviewSyncState.ts` 改名迁移为通用 `src/stores/sync/syncState.ts`，不改变现有接口签名。

**改动**：
- 新建 `src/stores/sync/syncState.ts`：泛化 `pendingPush` 的 key 为 `Record<string, string[]>`，`pushKind` 传参
- 新建 `src/stores/sync/syncConflict.ts`：把现有 `syncConflict.ts` 内容移入（已有）；如有小调整一并做
- 新建 `src/stores/sync/cloudStatus.ts`：`CloudSyncStatus` discriminated union 独立出来
- `techInterviewSyncState.ts` 保留作**兼容 export**：`export const useTechInterviewSyncState = useSyncState`
- 三套 cloud 实现**暂不改**；Phase A 验收后自然兼容

**验收**：
```bash
npm run type-check   # 通过
npm run lint         # 通过
# techInterviewCloud / questionBankCloud / resumeCloud 仍正常 import
```

#### Phase B：新建 `createSyncManager` 骨架 + techInterviewCloud 重构

**目标**：用新骨架重写 `techInterviewCloud.ts`（最复杂、测试最多），验证通用层可行。

**改动**：
- 新建 `src/stores/sync/syncManager.ts`：`createSyncManager` 实现 pull/push 骨架、online/offline 事件、BroadcastChannel
- 新建 `src/stores/sync/adapters/techInterview.ts`：实现 `CloudStoreAdapter<any, any>`
- 重写 `src/stores/techInterviewCloud.ts` 为一行：`export const useTechInterviewCloud = (adapter) => createSyncManager({ adapter, channelName: 'tech-interview-sync', ... })`
- 测试：`src/stores/__tests__/techInterviewCloud.test.ts`（如存在）或手测

**验收**：
```bash
npm run type-check
npm run lint
# CloudSyncBanner 行为不变（状态 kind 字段一致）
```

#### Phase C：questionBankCloud 重构

**目标**：用新骨架替换 `questionBankCloud.ts`，复用 Phase B 的 syncManager。

**改动**：
- 新建 `src/stores/sync/adapters/questionBank.ts`
- 重写 `questionBankCloud.ts`：调用 `createSyncManager`，保留 `pushToCloud`/`pullFromCloud` 等原有导出（适配器模式）
- 现有 `src/stores/__tests__/questionBankCloud.test.ts` 仍通过

**验收**：
```bash
npm run type-check
npm run lint
# questionBankCloud.test.ts 通过
```

#### Phase D：resumeCloud 重构

**目标**：最后一层重构。resumeCloud 独有 auth 管理，独立 adapter 即可。

**改动**：
- 新建 `src/stores/sync/adapters/resume.ts`
- 重写 `resumeCloud.ts`：`createSyncManager` + 保留 login/register/logout 等 auth 方法
- 删除 `questionBankCloud.ts` 和 `resumeCloud.ts` 中的 `syncConflict.ts` 重复调用（统一走 syncManager 内部）

**验收**：
```bash
npm run type-check
npm run lint
# resumeCloud.test.ts 通过
```

### 14.5 风险与回滚

| 阶段 | 风险 | 缓解 / 回滚 |
|---|---|---|
| Phase A | 改名导致 import 断链 | 保留兼容 export；先跑 type-check 再改 |
| Phase B | techInterviewCloud 行为变化（BFC 协调 / 懒加载细节） | 现有 Banner/ConflictDialog UI 不变；对比新旧 status 对照 |
| Phase C | questionBankCloud merge 策略差异 | adapter.mergeRow 明确返回 `undefined`（走整体替换） |
| Phase D | resumeCloud auth 流程被影响 | auth 方法不经过 syncManager，独立测试 |
| 任意阶段 | npm run build 失败 | `git stash` 回退；不 commit 破坏性变更 |

**回滚粒度**：每 Phase 独立 commit，可 `git revert`；Phase B/C/D 均通过 type-check + lint 后再合。

### 14.6 与 v3 主任务的衔接

| 决策点 | 结论 |
|---|---|
| 是否阻塞 v3 实现 | **不阻塞**。Phase A 可在 v3 Step 3-4 完成后作为独立优化子任务开展 |
| 是否拆独立子任务 | **建议拆**：`refactor-cloud-sync-common` 作为独立 worktree/task，与 v3 并行推进 |
| 与 implement.md 的关系 | implement.md 中 Step 3-4 保持原样；Phase B-D 作为 implement.md 的增量章节（§9+），不影响已有验收 |
| 与 prd.md 的关系 | 无冲突；重构不改功能行为，prd 验收标准不变 |
| BroadcastChannel 行为 | Phase B 开始统一抽；现有 techInterviewCloud 有，questionBankCloud / resumeCloud 无；重构后三套均支持（参数可选） |

### 14.7 冲突点与处理建议

| 冲突点 | 现有 design.md 内容 | 建议处理 |
|---|---|---|
| design.md §8.2 描述了 `techInterviewCloud.ts` 接口签名 | 重构后该文件仅剩 adapter 导出 | 在 §8.2 末尾注明「Phase B 后本文件职责变更为 adapter 工厂，见 §14」 |
| implement.md Step 4 包含完整的 `techInterviewCloud.ts` 源码 | Phase B 改写该文件 | implement.md 保持不变；Phase B 重写时在 PR 中标注 diff 范围 |
| design.md §9 失败恢复矩阵依赖 `techInterviewSyncState` | 重构后该文件保留兼容 export | 失败恢复矩阵逻辑不变，矩阵描述中注明「pendingPush 由 `src/stores/sync/syncState.ts` 管理」 |
| syncConflict.ts 已独立但被三套混用 | 重构后统一走 syncManager 内部调用 | syncConflict.ts 移入 `src/stores/sync/conflict.ts`；原文件保留兼容 alias |

---

> **下一步行动**（不包含在本次设计文档中）：
> 1. 创建新 task `refactor-cloud-sync-common` 独立推进
> 2. Phase A 可立即开始（不涉及业务逻辑改动，仅文件搬迁+泛化）
> 3. 与 v3 主任务并行，不互相等待