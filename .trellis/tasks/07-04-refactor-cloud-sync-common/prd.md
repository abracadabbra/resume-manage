# 云同步抽公共层 — PRD

## 1. 背景

v3 design.md §14 已沉淀了三套云同步实现（techInterviewCloud / questionBankCloud / resumeCloud）的完整差异分析。核心发现是：三套的状态机、pendingPush 队列、online/offline 事件、BroadcastChannel 协调逻辑高度重复，但各守一套实现。这导致：

- 维护成本 N×（改一个 bug 要改三处）
- 状态不一致的风险（三套状态类型不统一）
- 新增云同步模块时需要复制粘贴大量模板代码

**本任务不引入新功能，只消除重复代码。**

## 2. 目标

把三套云同步实现中可通用的部分抽为共享层 `src/stores/sync/`，使后续维护和新增云同步模块时只需实现 store-specific adapter，不再重复状态机、队列、事件监听等通用逻辑。

## 3. 范围

### 3.1 归入通用层（SyncManager）的职责

- `CloudSyncStatus` discriminated union 状态机（7 种状态）
- `SyncState` 持久化（lastSyncedAt / pendingPush / failedAttempts / enabled）
- pull → 对比 → 冲突检测 → 写入 adapter 的通用骨架
- push → 批量 upsert → 失败重试队列
- online / offline 事件挂载与 cleanup
- BroadcastChannel 多 tab 协调（channel name 参数化）
- `resolveConflict(qid, choice)` 统一调用协议

### 3.2 留在 store-specific adapter 层的职责

- 数据类型（PracticeSnapshot / QuestionBankCloudData / ResumeRecord）
- API 调用（fetchMeta / upsertBatch / getState / setState）
- 合并策略（行级 LWW vs 整体快照替换）
- 懒加载详情逻辑
- auth 登录/登出流程（resumeCloud 独有）
- conflict resolve 后的 merge 语义差异（techInterviewCloud merge 仅 practice 可用）

### 3.3 不在本任务范围

- src/ 下任何代码的改动（Phase A-D 均属后续 start 后实施）
- 新增第四套云同步模块
- 改变任何用户可感知的行为
- 修改 v3 主任务的任何文档

## 4. 用户可感知行为

**无变化。** 这是纯技术重构，用户在简历编辑器、面经题库、AI 面试模块中的云同步行为完全不变——Banner 状态、冲突解决弹窗、同步按钮均保持原样。

## 5. 验收标准

| # | 验收标准 | 对应 Phase |
|---|---|---|
| 1 | `npm run type-check` + `npm run lint` 通过 | Phase A–D 累积 |
| 2 | techInterviewCloud / questionBankCloud / resumeCloud 仍可正常 import，所有 UI Banner 行为不变 | Phase B–D 累积 |
| 3 | Phase A：`src/stores/sync/syncState.ts` + `cloudStatus.ts` + `syncConflict.ts` 存在，techInterviewSyncState.ts 保留兼容 export | Phase A |
| 4 | Phase B：techInterviewCloud 重构后，CloudSyncBanner 状态 kind 字段一致，冲突抽屉选项不变 | Phase B |
| 5 | Phase C：questionBankCloud 重构后，题库云同步 pull/push 行为不变 | Phase C |
| 6 | Phase D：resumeCloud 重构后，简历云同步 + auth 登录/登出行为不变 | Phase D |
| 7 | 任意 Phase type-check 失败则该 Phase 未完成，不进入下一 Phase | 全程 |