# 大厂面经题目 Supabase CRUD

## Goal

为大厂面经模块添加新增/编辑/删除题目功能，基于已有 Supabase 项目，不再自建 MySQL + 后端。

## Requirements

### 数据模型

#### 主表：`tech_interview_questions`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGINT PK | 自增主键 |
| `question_text` | TEXT | 面试题原文（可编辑） |
| `mention_count` | INT DEFAULT 1 | 出现频次 |
| `companies` | JSONB | 公司数组，如 `["字节","阿里"]` |
| `tech_field` | VARCHAR(100) | 技术领域分类 |
| `position` | VARCHAR(100) | 岗位 |
| `round` | VARCHAR(50) | 面试轮次 |
| `note_id` | VARCHAR(100) | 小红书笔记 ID |
| `note_title` | VARCHAR(255) | 笔记标题 |
| `link` | TEXT | 笔记链接 |
| `published_at` | VARCHAR(50) | 发布时间 |
| `source` | ENUM | bundled/manual/imported |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |

#### AI 答案表：`tech_interview_ai_answers`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGINT PK | 自增主键 |
| `question_id` | BIGINT FK | 关联题目 |
| `answer` | TEXT | AI 答案 |
| `conversations` | JSONB | 追问历史 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |

### API 端点（PostgREST 自动生成）

直接使用 Supabase PostgREST，通过已有 `supabase.ts` 客户端调用：

- `GET /tech_interview_questions?tech_field=eq.AI` — 按分类筛选
- `POST /tech_interview_questions` — 新增题目
- `PATCH /tech_interview_questions?id=eq.123` — 编辑题目（只改 question_text）
- `DELETE /tech_interview_questions?id=eq.123` — 删除题目
- `GET /tech_interview_ai_answers?question_id=eq.123` — 取 AI 答案
- `UPSERT /tech_interview_ai_answers` — 存 AI 答案

### 前端改动

#### `src/services/techInterviewSupabaseApi.ts`（新建）
封装 Supabase 调用，参考 `questionBankCloud.ts` 模式。

#### `src/stores/techInterviewQuestionsStore.ts`（改造）
- `ensureLoaded()` 改成调 Supabase API
- `selectedQuestionId` 改为数据库主键 `number`
- 新增 `addQuestion()`、`updateQuestion(id, question_text)`、`deleteQuestion(id)`
- AI 答案改为通过 Supabase 存储，删 `ai-answers.json` 合并逻辑

#### `src/components/tech-interview/TechQuestionDetail.vue`
- 题目文本旁加编辑按钮（inline 输入框）
- 加删除按钮（带确认对话框）

#### `src/components/tech-interview/TechQuestionList.vue`
- 列表上方加"+ 添加题目"按钮

### 数据导入

启动时如果 `tech_interview_questions` 为空，从 `src/data/tech-interview-questions.json` 批量导入一次。

### 迁移计划

1. 先在 Supabase 建表（手动或 SQL）
2. 导入现有 2768 道题
3. 前端 store 改造
4. UI 加编辑/删除/添加按钮
5. AI 答案迁移到 Supabase

## Non-goals

- 不改动题库（Question Bank）模块
- 不做题目分类的增删改（tech_field 分类只读）
- 不改 `src/data/tech-interview-questions.json`（保留打包数据文件）

## Acceptance Criteria

- [ ] Supabase 表创建成功，`tech_interview_questions` 和 `tech_interview_ai_answers`
- [ ] 现有 2768 道题成功导入 Supabase
- [ ] App 启动时从 Supabase 加载题目，而非 JSON 文件
- [ ] 点"+ 添加题目" → 提交后刷新页面仍在
- [ ] 编辑题目文本 → 保存 → 刷新后是新文本
- [ ] 删除题目 → 数据库记录消失
- [ ] AI 答案存到 Supabase 而非 localStorage
- [ ] 跑通 lint 和 type-check
