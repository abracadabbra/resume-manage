# 大厂面经 v3 云同步 — Implementation Plan

## 实施顺序总览

```
Step 1: Schema migration (Supabase)
Step 2: Seed 数据灌入 (Supabase)
Step 3: 前端 API 层重构 (techInterviewSupabaseApi.ts)
Step 4: Cloud manager 新建 (techInterviewCloud.ts)
Step 5: Store 改造 (techInterviewQuestions.ts + techInterviewSyncState.ts)
Step 6: UI 组件 (CloudSyncBanner / CloudSyncConflictDialog)
Step 7: 接入 TechInterviewPanel
Step 8: 验收 (build / lint / 跨账号隔离 / 离线恢复)
```

每个 Step 内完成 → 自检 → 进入下一步。

---

## Step 1: Schema migration

### 1.1 新增文件

```
supabase/migrations/
  001_tech_interview_questions.sql
  002_tech_interview_ai_answers.sql
  003_tech_practice_records.sql
  004_tech_user_ai_conversations.sql
  005_tech_rls_policies.sql
  006_tech_updated_at_triggers.sql
```

### 1.2 文件内容

每个文件按 design §6 / §7 内容落地。关键检查点：

- [ ] 所有表都带 `enable row level security`；
- [ ] `tech_practice_records` / `tech_user_ai_conversations` 的 `user_id` 都是 `uuid references auth.users(id) on delete cascade`；
- [ ] `mastery` 加 enum check；
- [ ] `conversations` 加 `jsonb_typeof = 'array'` check；
- [ ] 公共表**只有** `for select using (true)` 策略，无 `insert/update/delete` 策略（anon/authenticated 写不动）。

### 1.3 执行

```bash
# 本地（如已配 supabase CLI）
supabase db push

# 远端（Supabase Studio）
# SQL Editor 逐文件贴入执行
```

执行后用 `select * from pg_policies where tablename like 'tech_%';` 确认策略生效。

### 1.4 自检命令

```sql
-- 应该返回 0 行（user A 不该看到 user B 的行）
set local role authenticated;
select * from tech_practice_records;

-- 应该返回 2764 行（迁移完成后）
select count(*) from tech_interview_questions;
```

---

## Step 2: Seed 数据

### 2.1 数据源确认

确认仓库内题库 JSON 文件路径（grep `2764` / grep `mention_count` 定位）。

### 2.2 生成 INSERT SQL

写一次性 Node 脚本 `scripts/gen-seed-tech-interview-questions.ts`：

```ts
import { readFileSync, writeFileSync } from 'node:fs'
const json = JSON.parse(readFileSync('./src/data/tech-interview-questions.json', 'utf-8'))
const rows = json.map(q => `(${escape(q.question_text)}, ${q.mention_count}, '${JSON.stringify(q.companies)}', ...)`)
writeFileSync('./supabase/migrations/007_seed_tech_interview_questions.sql',
  `insert into tech_interview_questions (question_text, mention_count, companies, ...) values\n${rows.join(',\n')};\n`)
```

### 2.3 文件落位

- `supabase/migrations/007_seed_tech_interview_questions.sql`
- `supabase/migrations/008_seed_tech_interview_ai_answers.sql`（若 AI 答案 JSON 也存在）

### 2.4 执行

贴入 Supabase Studio SQL Editor 跑一次。`select count(*) from tech_interview_questions;` 应返回 2764。

### 2.5 自检

```sql
-- 应该非 0
select count(*) from tech_interview_questions;
-- 应该等于题数（如果 AI 答案 JSON 完整）
select count(*) from tech_interview_ai_answers;
```

---

## Step 3: 前端 API 层

### 3.1 重写 `src/services/techInterviewSupabaseApi.ts`

按 design §8.1 拆函数：

```ts
// 公共只读
fetchQuestionsMeta(): Promise<QuestionMeta[]>
fetchQuestionDetail(qid: string): Promise<QuestionRow | null>
fetchAiAnswerByQid(qid: string): Promise<string | null>
fetchAiAnswersMeta(): Promise<{ question_id: string, updated_at: string }[]>

// 私有
fetchPracticeMeta(): Promise<PracticeMeta[]>
fetchPracticeDetail(qid: string): Promise<PracticeRecord | null>
upsertPracticeBatch(rows: PracticeRecord[]): Promise<string[]>

fetchConversationsMeta(): Promise<ConversationMeta[]>
fetchConversationsDetail(qid: string): Promise<AiConversationRecord | null>
upsertConversationsBatch(rows: AiConversationRecord[]): Promise<string[]>
```

### 3.2 关键约束

- `question_id` 在前端类型为 `string`（跟随 PG text 主键；
- upsert payload 中**不写** `updated_at`，由 trigger 维护；
- 所有调用走 `src/services/supabase.ts` 已封装的 client；
- 错误处理：抛出 `TechInterviewApiError { code, message, table }`，cloud manager 统一捕获。

### 3.3 删除旧函数

`upsertAiAnswer` / `upsertQuestionBankStates`（如存在且针对 tech_interview）— 这些是 v2 死代码，公共表不该被前端写。

### 3.4 自检

```bash
npm run type-check
npm run lint
```

---

## Step 4: Cloud manager

### 4.1 新增 `src/stores/techInterviewCloud.ts`

按 design §8.2 落地：

```ts
import type { Ref } from 'vue'
import * as api from '@/services/techInterviewSupabaseApi'
import { useTechInterviewSyncState } from './techInterviewSyncState'

export type CloudSyncStatus = ...  // 见 design §2.1
export type ConflictKind = 'practice' | 'conversation'
export type ConflictMap = Record<string, ...>

export function useTechInterviewCloud() {
  const status: Ref<CloudSyncStatus> = ref({ kind: 'idle' })
  const conflicts: Ref<ConflictMap> = ref({})
  const syncError: Ref<string[]> = ref([])
  const state = useTechInterviewSyncState()
  let running = false

  async function pull(): Promise<void> { ... }
  async function push(): Promise<void> { ... }
  async function pullThenPush(): Promise<void> { ... }
  async function resolveConflict(qid: string, choice): Promise<void> { ... }
  function schedulePush(qid: string, kind: ConflictKind): void { ... }

  // 在线事件
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => flushPending())
  }

  // 多 tab 协调
  if (typeof BroadcastChannel !== 'undefined') {
    const ch = new BroadcastChannel('tech-interview-sync')
    ch.onmessage = (e) => { if (e.data === 'pull-then-push') pullThenPush() }
  }

  return { status, conflicts, syncError, pull, push, pullThenPush, resolveConflict, schedulePush }
}
```

### 4.2 新增 `src/stores/techInterviewSyncState.ts`

```ts
export interface TechInterviewSyncState {
  schemaVersion: 1
  lastSyncedAt: number | null
  pendingPush: { practice: string[]; conversations: string[] }
  failedAttempts: Record<string /* qid */, number>
}

const STORAGE_KEY = 'tech-interview-sync-state.json'

export function useTechInterviewSyncState() {
  const state = useLocalStorage<TechInterviewSyncState>(STORAGE_KEY, {
    schemaVersion: 1,
    lastSyncedAt: null,
    pendingPush: { practice: [], conversations: [] },
    failedAttempts: {},
  })
  // ...
  return state
}
```

### 4.3 自检

单元测试（或手测）：
- mock api 让 `fetchPracticeMeta` 返回 3 行 → `pull()` 后 store 应该有 3 行；
- mock api 让 `upsertPracticeBatch` 返回 failed → `pendingPush.practice` 应有对应 qid；
- `resolveConflict('1', 'local')` → 调一次 `upsertPracticeBatch` 并从 `conflicts` 移除。

---

## Step 5: Store 改造

### 5.1 修改 `src/stores/techInterviewQuestions.ts`

注入 `useTechInterviewCloud()` 后：

- `setPracticeMastery(qid, mastery)`：写入内存 + localStorage → `cloud.schedulePush(qid, 'practice')`；
- `setPracticeAnswer(qid, answer)`：同上；
- `setPracticeNotes(qid, notes)`：同上；
- `addConversationMessage(qid, msg)`：写入内存 + localStorage → `cloud.schedulePush(qid, 'conversation')`；
- `loadQuestions()`：先看 local 缓存，再调 `cloud.pull()` 增量合并；
- 新增 `cloudSyncStatus` / `cloudConflicts` / `syncError` computed 转发给 UI。

### 5.2 拆分 AI 答案与 conversations 数据

旧 store `aiAnswers[questionId].conversations` 拆为：
- `aiAnswers[questionId].answer`（公共来源，云端拉）
- `aiConversations[questionId]`（私有，云端拉）

旧 UI 引用处需要同步修改（grep `aiAnswers.*conversations`）。

### 5.3 自检

```bash
npm run type-check
```

UI 端验证：旧路径仍能加载、AI 答案从云端来、追问对话从 `aiConversations` 读取。

---

## Step 6: UI 组件

### 6.1 新增 `src/components/tech-interview/CloudSyncBanner.vue`

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useTechInterviewStore } from '@/stores/techInterviewQuestions'

const store = useTechInterviewStore()
const { cloudSyncStatus, cloudConflicts } = storeToRefs(store)

const conflictCount = computed(() => Object.keys(cloudConflicts.value).length)
const showBanner = computed(() => conflictCount.value > 0 || cloudSyncStatus.value.kind === 'error')
</script>

<template>
  <div v-if="showBanner" class="cloud-sync-banner">
    <span v-if="conflictCount > 0">
      检测到 {{ conflictCount }} 道题在两台设备上都有更新
    </span>
    <span v-else-if="cloudSyncStatus.kind === 'error'">
      同步失败：{{ cloudSyncStatus.message }}
    </span>
    <button @click="$emit('open-conflicts')">查看</button>
    <button @click="store.cloud.pullThenPush()">立即同步</button>
  </div>
</template>
```

### 6.2 新增 `src/components/tech-interview/CloudSyncConflictDialog.vue`

逐题展示三选项（使用本地 / 使用云端 / 合并）。走 Naive UI `n-drawer` 或自实现。emit `resolve(qid, choice)` 给父组件。

### 6.3 自检

手测：构造 conflictMap 三个条目 → 横幅显示 3 → 打开抽屉能看到三选项 → 选「使用本地」后从 map 移除。

---

## Step 7: TechInterviewPanel 接入

### 7.1 修改 `src/components/tech-interview/TechInterviewPanel.vue`

- 顶部插入 `<CloudSyncBanner @open-conflicts="conflictDrawerOpen = true" />`；
- 状态徽章：显示 `cloudSyncStatus.kind` + `lastSyncedAt`（格式化）；
- 手动「立即同步」按钮 → `store.cloud.pullThenPush()`；
- 抽屉 v-model：`conflictDrawerOpen` 绑 `<CloudSyncConflictDialog v-if="conflictDrawerOpen" />`；
- 题目详情打开时触发 `lazyLoadDetail(qid)`（调 `fetchPracticeDetail` + `fetchConversationsDetail`）。

### 7.2 启用云同步对话框（首登）

新增 `<EnableCloudSyncDialog />`：
- 「立即启用」→ 写入 `state.lastSyncedAt = null`（已是默认），触发 `pullThenPush()`；
- 「暂不」→ store 标记 `cloudDisabled = true`，UI 隐藏云同步区域；
- 「帮助」→ 弹说明。

登录成功事件 hook：`auth.onAuthStateChange('SIGNED_IN')` → 弹对话框（如未禁用）。

### 7.3 自检

- 第一次登录 → 看到启用对话框 → 启用 → 元数据被拉取 → store 内存非空；
- 关闭浏览器重开 → 不弹对话框（已启用），状态徽章显示「已同步」。

---

## Step 8: 验收

### 8.1 构建 & lint

```bash
npm run build
npm run lint
npm run type-check
```

### 8.2 跨账号隔离（核心安全）

手测：
1. 注册 A → 写一道题 mastery = `mastered` + 追问一句话；
2. 注册 B → 打开同一题 → 应看不到 A 的 mastery / 追问；
3. A 登出 → cascade 删 A 的私有行；
4. B 登录 → 看不到 A 的痕迹。

### 8.3 行级冲突

手测：
1. A 登录 → 改题 1 mastery → 不关闭浏览器；
2. B 设备（同账号）改题 1 mastery；
3. A 切回 → 应看到 `CloudSyncBanner` 显示 1 条冲突 → 打开抽屉 → 三选项可用。

### 8.4 离线恢复

手测：
1. 打开 DevTools Network → Offline；
2. 改 N 道题 → pendingPush 队列增长；
3. 切回 Online → `online` 事件触发 → flush → 状态徽章转 `ok`。

### 8.5 性能

- 2764 道题首屏元数据拉取 < 5s；
- 详情懒加载：单题 < 300ms；
- 单批 upsert 200 行 < 2s。

### 8.6 RLS 验证

```sql
-- 用 authenticated role 测试
set local role authenticated;
select * from tech_practice_records; -- 应只返回当前用户
select * from tech_practice_records where user_id != auth.uid(); -- 应 0 行
```

---

## 风险与回滚

### 风险点

| 风险 | 缓解 |
|---|---|
| Seed INSERT 文件过大（几万行）git 性能 | 分批拆成 007a/007b/007c；或用 COPY 而非 INSERT |
| 旧 store `aiAnswers.conversations` 兼容问题 | 保留双读：localStorage 优先 → 走 aiConversations 字段 |
| 多 tab 同时 pull 冲突 | BroadcastChannel 协调 + last-write-wins |
| 题库公共表 RLS 写权限若误开 | migration 005 严格审查；只配 `for select` |

### 回滚点

- **Schema 改动未生效**：`drop table tech_* cascade`；
- **前端改动引入 bug**：回滚 commit，store 回到 localStorage only；
- **Seed 灌错**：`truncate tech_interview_questions restart identity` 重灌。

---

## 验收清单（与 PRD 映射）

| PRD | Implement |
|---|---|
| 四张表 + RLS | Step 1 |
| 2764 道题可读 | Step 2 |
| 启用云同步对话框 | Step 7.2 |
| localStorage 合并 | Step 5 |
| RLS 隔离 | Step 8.2 |
| 共享 AI 答案 | Step 3 + Step 5.2 |
| 追问对话私有 | Step 3 + Step 5.2 |
| 行级冲突横幅 | Step 6 + Step 8.3 |
| 离线恢复 | Step 4 + Step 8.4 |
| cascade 删行 | Step 1 + Step 8.2 |
| build/lint 通过 | Step 8.1 |

---

## 不在范围内

- 题库内容更新流程（管理员后台）
- 多端 CRDT
- 历史版本回滚