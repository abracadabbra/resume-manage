# 云同步抽公共层 — Technical Design

> 本文档从 v3 design.md §14 复制，作为子任务初稿。后续 Phase 评审时需细化。

## 1. 代码差异分析

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

## 2. 目标与边界

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

## 3. 抽象接口

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
  upsertBatch(rows: CloudMetaRow[], userId: string): Promise<string[]> /* failed qids */

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

## 4. 迁移计划（Phase A → D）

> **原则**：渐进迁移，每 phase 独立验收，不阻塞 v3 主任务进度。  
> **新架构命名为** `src/stores/sync/` 目录。

### Phase A：抽共享 SyncState（独立文件）

**目标**：把 `techInterviewSyncState.ts` 改名迁移为通用 `src/stores/sync/syncState.ts`，不改变现有接口签名。

**改动：**
- 新建 `src/stores/sync/syncState.ts`：泛化 `pendingPush` 的 key 为 `Record<string, string[]>`, `pushKind` 传参
- 新建 `src/stores/sync/cloudStatus.ts`：`CloudSyncStatus` discriminated union 独立出来
- 新建 `src/stores/sync/syncConflict.ts`：把现有 `syncConflict.ts` 内容移入（已有）；如有小调整一并做
- `techInterviewSyncState.ts` 保留作**兼容 export**：`export const useTechInterviewSyncState = useSyncState`
- 三套 cloud 实现**暂不改**；Phase A 验收后自然兼容

**验收：**
```bash
npm run type-check   # 通过
npm run lint         # 通过
# techInterviewCloud / questionBankCloud / resumeCloud 仍正常 import
```

### Phase B：新建 `createSyncManager` 骨架 + techInterviewCloud 重构

**目标**：用新骨架重写 `techInterviewCloud.ts`（最复杂、测试最多），验证通用层可行。

**改动：**
- 新建 `src/stores/sync/syncManager.ts`：`createSyncManager` 实现 pull/push 骨架、online/offline 事件、BroadcastChannel
- 新建 `src/stores/sync/adapters/techInterview.ts`：实现 `CloudStoreAdapter<any, any>`
- 重写 `src/stores/techInterviewCloud.ts` 为一行：`export const useTechInterviewCloud = (adapter) => createSyncManager({ adapter, channelName: 'tech-interview-sync', ... })`
- 测试：`src/stores/__tests__/techInterviewCloud.test.ts`（如存在）或手测

**验收：**
```bash
npm run type-check
npm run lint
# CloudSyncBanner 行为不变（状态 kind 字段一致）
```

### Phase C：questionBankCloud 重构

**目标**：用新骨架替换 `questionBankCloud.ts`，复用 Phase B 的 syncManager。

**改动：**
- 新建 `src/stores/sync/adapters/questionBank.ts`
- 重写 `questionBankCloud.ts`：调用 `createSyncManager`，保留 `pushToCloud`/`pullFromCloud` 等原有导出（适配器模式）
- 现有 `src/stores/__tests__/questionBankCloud.test.ts` 仍通过

**验收：**
```bash
npm run type-check
npm run lint
# questionBankCloud.test.ts 通过
```

### Phase D：resumeCloud 重构

**目标**：最后一层重构。resumeCloud 独有 auth 管理，独立 adapter 即可。

**改动：**
- 新建 `src/stores/sync/adapters/resume.ts`
- 重写 `resumeCloud.ts`：`createSyncManager` + 保留 login/register/logout 等 auth 方法
- 删除 `questionBankCloud.ts` 和 `resumeCloud.ts` 中的 `syncConflict.ts` 重复调用（统一走 syncManager 内部）

**验收：**
```bash
npm run type-check
npm run lint
# resumeCloud.test.ts 通过
```

## 5. 风险与回滚

| 阶段 | 风险 | 缓解 / 回滚 |
|---|---|---|
| Phase A | 改名导致 import 断链 | 保留兼容 export；先跑 type-check 再改 |
| Phase B | techInterviewCloud 行为变化（BFC 协调 / 懒加载细节） | 现有 Banner/ConflictDialog UI 不变；对比新旧 status 对照 |
| Phase C | questionBankCloud merge 策略差异 | adapter.mergeRow 明确返回 `undefined`（走整体替换） |
| Phase D | resumeCloud auth 流程被影响 | auth 方法不经过 syncManager，独立测试 |
| 任意阶段 | npm run build 失败 | `git stash` 回退；不 commit 破坏性变更 |

**回滚粒度**：每 Phase 独立 commit，可 `git revert`；Phase B/C/D 均通过 type-check + lint 后再合。

## 6. 与 v3 主任务的衔接

| 决策点 | 结论 |
|---|---|
| 是否阻塞 v3 实现 | **不阻塞**。Phase A 可在 v3 Step 3-4 完成后作为独立优化子任务开展 |
| 是否拆独立子任务 | **建议拆**：`refactor-cloud-sync-common` 作为独立 worktree/task，与 v3 并行推进 |
| 与 implement.md 的关系 | implement.md 中 Step 3-4 保持原样；Phase B-D 作为 implement.md 的增量章节（§9+），不影响已有验收 |
| 与 prd.md 的关系 | 无冲突；重构不改功能行为，prd 验收标准不变 |
| BroadcastChannel 行为 | Phase B 开始统一抽；现有 techInterviewCloud 有，questionBankCloud / resumeCloud 无；重构后三套均支持（参数可选） |

## 7. 冲突点与处理建议

| 冲突点 | 现有 design.md 内容 | 建议处理 |
|---|---|---|
| design.md §8.2 描述了 `techInterviewCloud.ts` 接口签名 | 重构后该文件仅剩 adapter 导出 | 在 §8.2 末尾注明「Phase B 后本文件职责变更为 adapter 工厂，见 §14」 |
| implement.md Step 4 包含完整的 `techInterviewCloud.ts` 源码 | Phase B 改写该文件 | implement.md 保持不变；Phase B 重写时在 PR 中标注 diff 范围 |
| design.md §9 失败恢复矩阵依赖 `techInterviewSyncState` | 重构后该文件保留兼容 export | 失败恢复矩阵逻辑不变，矩阵描述中注明「pendingPush 由 `src/stores/sync/syncState.ts` 管理」 |
| syncConflict.ts 已独立但被三套混用 | 重构后统一走 syncManager 内部调用 | syncConflict.ts 移入 `src/stores/sync/conflict.ts`；原文件保留兼容 alias |