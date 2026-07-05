# 云同步抽公共层 — Implementation Plan

> 本文档从 v3 design.md §14.4 迁移计划拆解，为初稿。后续 Phase 评审时需补充验证命令和回滚点。

## Phase A：抽共享 SyncState（独立文件）

**目标**：把 `techInterviewSyncState.ts` 迁移为通用 `src/stores/sync/syncState.ts`，不改变现有接口签名。

### A.1 创建目录结构

```bash
mkdir -p src/stores/sync/adapters
```

### A.2 新建文件

- `src/stores/sync/cloudStatus.ts`：从 v3 techInterviewCloud.ts 复制 `CloudSyncStatus` discriminated union（7 种状态 kind）
- `src/stores/sync/syncState.ts`：泛化 `techInterviewSyncState.ts`，`pendingPush` key 改为 `Record<string, string[]>`，增加 `pushKind` 参数
- `src/stores/sync/syncConflict.ts`：如有独立 conflict 文件则移入；无则新建空白占位

### A.3 兼容层

- `src/stores/techInterviewSyncState.ts` 保留，改为 `export const useTechInterviewSyncState = useSyncState`

### 验证命令

```bash
npm run type-check
npm run lint
# 确保 techInterviewCloud / questionBankCloud / resumeCloud import 不报错
```

### 回滚点

- `git stash` 后 type-check / lint 仍通过，则 Phase A 完成
- 回滚：`git stash pop`，删除 `src/stores/sync/` 目录

---

## Phase B：新建 `createSyncManager` 骨架 + techInterviewCloud 重构

**目标**：验证通用层可行，重构最复杂的 techInterviewCloud。

### B.1 新建通用层

- `src/stores/sync/syncManager.ts`：`createSyncManager` factory
  - pull-then-push 骨架
  - online / offline 事件监听
  - BroadcastChannel 协调（channel name 参数化）
  - `resolveConflict` 统一协议

### B.2 新建 Adapter

- `src/stores/sync/adapters/techInterview.ts`：实现 `CloudStoreAdapter<any, any>`
  - `fetchMeta` / `fetchDetail` / `upsertBatch`
  - 行级 LWW merge
  - conflictChoices: `['local', 'cloud', 'merge']`

### B.3 重构

- 重写 `src/stores/techInterviewCloud.ts`：调用 `createSyncManager`，保留现有导出接口

### 验证命令

```bash
npm run type-check
npm run lint
# CloudSyncBanner 状态 kind 不变
# 冲突抽屉选项不变
```

### 回滚点

- 回滚：`git checkout HEAD -- src/stores/techInterviewCloud.ts src/stores/sync/`

---

## Phase C：questionBankCloud 重构

### C.1 新建 Adapter

- `src/stores/sync/adapters/questionBank.ts`：`CloudStoreAdapter<QuestionBankCloudData, any>`
  - `mergeRow` 返回 `undefined`（整体快照替换策略）
  - conflictChoices: `['local', 'cloud']`

### C.2 重构

- 重写 `questionBankCloud.ts`：调用 `createSyncManager`，保留 `pushToCloud`/`pullFromCloud` 导出

### 验证命令

```bash
npm run type-check
npm run lint
# questionBankCloud.test.ts（如存在）通过
```

### 回滚点

- 回滚：`git checkout HEAD -- src/stores/questionBankCloud.ts src/stores/sync/adapters/questionBank.ts`

---

## Phase D：resumeCloud 重构

### D.1 新建 Adapter

- `src/stores/sync/adapters/resume.ts`：`CloudStoreAdapter<ResumeRecord, any>`
  - conflictChoices: `['local', 'cloud']`
  - auth 方法（login/register/logout）**不经过** syncManager

### D.2 重构

- 重写 `resumeCloud.ts`：`createSyncManager` + 保留 auth 方法
- 删除三套 cloud 中 `syncConflict.ts` 重复调用（统一走 syncManager）

### D.3 清理（如有）

- 删除 `src/stores/sync/syncConflict.ts` 兼容 alias（如 Phase B–D 确认无问题）

### 验证命令

```bash
npm run type-check
npm run lint
# resumeCloud.test.ts（如存在）通过
```

### 回滚点

- 回滚：`git checkout HEAD -- src/stores/resumeCloud.ts src/stores/sync/adapters/resume.ts`

---

## 全局约束

1. **type-check 第一**：每个 Phase 完成后必须 `npm run type-check` 通过才能进入下一 Phase
2. **不破坏 UI**：CloudSyncBanner / ConflictDialog / SyncButton 行为不变
3. **原子 commit**：每个 Phase 独立一个 commit，便于 `git revert`
4. **不动 src/ 之外的代码**：migration / 数据库 schema 不在本 implement 范围