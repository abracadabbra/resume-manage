# 大厂面经练习记录 Supabase 同步方案

## 背景

大厂面经的练习记录（熟练度标记、用户回答、笔记）和 AI 参考答案目前只存在 `localStorage` 中，丢失风险高，且无法跨设备同步。题库已经接入了 Supabase 同步，大厂面经需要复用同一套基础设施。

## 表结构

### tech_practice_records

用户对每道大厂面经题的练习标记。

```sql
create table tech_practice_records (
  user_id     text not null,        -- 用户 ID
  question_id text not null,        -- 题目 ID，如 "my-ql-001"、"java-010"
  mastery     text not null,        -- 熟练度：unpracticed / practicing / mastered / weak
  answer      text not null default '',   -- 用户自己的回答
  notes       text not null default '',   -- 用户笔记
  updated_at  bigint not null,      -- 最后更新时间戳（毫秒）
  created_at  timestamp with time zone not null default now(),  -- 创建时间
  primary key (user_id, question_id)
);

create index idx_tech_practice_records_updated_at
  on tech_practice_records (user_id, updated_at);
```

### tech_ai_answers

AI 为每道大厂面经题生成的参考答案。

```sql
create table tech_ai_answers (
  user_id      text not null,       -- 用户 ID
  question_id  text not null,       -- 题目 ID，如 "my-ql-001"、"java-010"
  answer       text not null,       -- AI 生成的答案内容
  conversations jsonb not null default '[]',  -- 追问对话记录
  updated_at   bigint not null,     -- 最后更新时间戳（毫秒）
  created_at   timestamp with time zone not null default now(),  -- 创建时间
  primary key (user_id, question_id)
);

create index idx_tech_ai_answers_updated_at
  on tech_ai_answers (user_id, updated_at);
```

## 数据类型对应

| TypeScript 类型 | 存储位置 | SQL 字段 |
|---|---|---|
| `PracticeRecord.mastery` | `tech_practice_records` | `mastery` |
| `PracticeRecord.answer` | `tech_practice_records` | `answer` |
| `PracticeRecord.notes` | `tech_practice_records` | `notes` |
| `PracticeRecord.updatedAt` | `tech_practice_records` | `updated_at` |
| `AiAnswerData.answer` | `tech_ai_answers` | `answer` |
| `AiAnswerData.conversations` | `tech_ai_answers` | `conversations` |
| `AiAnswerData.updatedAt` | `tech_ai_answers` | `updated_at` |

## 同步策略

### 全量拉取（首次 / 手动）

1. 查询 `tech_practice_records WHERE user_id = ?`，按行加载到内存
2. 查询 `tech_ai_answers WHERE user_id = ?`，按行加载到内存
3. 与本地记录合并：云端较新的覆盖本地，本地较新的保留
4. 记录 `lastSyncedAt`

### 增量推送

1. 遍历本地 `practiceRecords`，筛选 `updatedAt > lastSyncedAt` 的行
2. 批量 upsert 到 `tech_practice_records`
3. 同样处理 `aiAnswers`
4. 更新 `lastSyncedAt`

### 冲突处理

与题库的 `decideSyncDecision` 逻辑保持一致：

- 本地更新、云端未更新 → 推送本地
- 云端更新、本地未更新 → 拉取云端
- 两边都有更新 → 标记冲突，让用户选择保留本地还是使用云端

## 实现改动清单

| 文件 | 改动 |
|---|---|
| `src/services/supabase.ts` | 新增 `getTechPracticeRecords` / `upsertTechPracticeRecords` / `getTechAiAnswers` / `upsertTechAiAnswers` |
| `src/stores/techInterviewCloud.ts` | **新建** cloud manager（参考 `questionBankCloud.ts`），处理 push/pull/conflict |
| `src/stores/techInterviewQuestions.ts` | 注入 cloud manager，暴露 `pushToCloud` / `pullFromCloud`，新增 `cloudSyncStatus` 等 state |
| `src/components/tech-interview/TechInterviewPanel.vue` | 添加同步 UI 卡片（参考 `QuestionBankPanel.vue` 的云同步区域），登录后显示拉取/上传按钮 |

## 与题库同步的区别

| 维度 | 题库 | 大厂面经 |
|---|---|---|
| 数据量 | 数百道题 + 少量自定义题 | 2764 道题的练习记录 + AI 答案 |
| 存储方式 | 单行 JSONB（全量一次 push/pull） | 每道题独立行（按 updated_at 增量同步） |
| 同步粒度 | 全量 | 增量 |
| 自定义数据 | 可新增题目 | 不可新增，只有标记和笔记 |
