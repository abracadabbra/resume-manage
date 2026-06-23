# 大厂面经 AI 答案与笔记增强

## Goal

大厂面经题库增强：扩展数据结构支持笔记 ID/链接/岗位/轮次，详情页展示来源信息，并添加 AI 生成参考答案与追问功能（与题库功能平行实现）。

## Requirements

### 1. 数据结构扩展

现有 `TechInterviewQuestion`:
```ts
{ q: string, f: number, c: string[] }
```

扩展为:
```ts
interface TechInterviewQuestion {
  q: string           // 题目
  f: number          // 出现频率
  c: string[]        // 公司列表
  noteId?: string    // 笔记ID [NEW]
  noteTitle?: string // 笔记标题 [NEW]
  company?: string   // 公司 [NEW]
  position?: string  // 岗位 [NEW]
  round?: string     // 轮次 [NEW]
  techField?: string // 技术领域 [NEW]
  link?: string      // 笔记链接 [NEW]
  publishedAt?: string // 发布时间 [NEW]
}
```

### 2. 数据重建

从 `笔记列表_含OCR.xlsx` 第二个 sheet（"面试题库"）重新生成 `src/data/tech-interview-questions.json`。

原始字段：
- 笔记ID、笔记标题、公司、岗位、轮次、技术领域、题目、链接、发布时间

处理逻辑：
- 按技术领域（技术领域列）聚合成分类（categories）
- 频率 `f` = 该题目在同技术领域同公司下出现的次数
- 保留所有新增字段

### 3. 详情页增强（TechQuestionDetail.vue）

新增显示：
- 笔记ID（原文链接）
- 笔记链接（点击跳转小红书帖子）
- 岗位 + 轮次
- 技术领域
- 发布时间

### 4. AI 生成答案 + 追问 + 保存

与题库 `questionAnswerGenerationService.ts` **完全相同的模式**，但服务于大厂面经独立的 store 和组件。

新建：
- `src/services/techInterviewAnswerGenerationService.ts` — 流式生成服务
- `src/components/tech-interview/TechInterviewAiAnswer.vue` — 三状态组件（idle/generating/done）

Store 扩展（`useTechInterviewQuestionsStore`）：
- `aiAnswers` ref：`Record<string, AiAnswerData>`
- localStorage 持久化（key: `tech-interview-ai-answers`）
- 方法：`getAiAnswerData`, `saveAiAnswerData`, `clearAiAnswerData`
- AI 答案导出时一并打包

## Non-goals

- 不修改题库（Question Bank）功能 — 两者独立并行
- 不改动数据同步逻辑 — 大厂面经暂无云同步需求
- 不改 `App.vue` 的路由结构

## Acceptance Criteria

- [x] `笔记列表_含OCR.xlsx` sheet2 解析并重新生成 `tech-interview-questions.json`
- [x] `TechInterviewQuestion` 类型扩展，支持所有新字段
- [x] `TechQuestionDetail.vue` 显示笔记ID、链接、岗位、轮次、技术领域、发布时间
- [x] `TechInterviewAnswerGenerationService.ts` 流式生成（含追问上下文）
- [x] `TechInterviewAiAnswer.vue` 三状态组件（idle/generating/done）
- [x] `useTechInterviewQuestionsStore` 新增 `aiAnswers` 缓存 + localStorage 持久化
- [x] 切换题目时保留并恢复对话上下文
- [x] 超出 6 轮追问自动截断
- [x] 跑通 lint 和 type-check
