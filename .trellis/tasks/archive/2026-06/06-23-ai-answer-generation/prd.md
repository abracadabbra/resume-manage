# AI 一键生成参考答案与追问

## Goal

用户在浏览题库时，可以一键让 AI 生成详细参考答案，并能基于生成结果继续追问对话，完善答案。生成的结果（最终答案 + 追问历史）缓存在 localStorage，并通过已有的 Supabase 云同步跨设备持久化。

## Requirements

1. **AI 生成参考答案**
   - 题目详情区显示"AI 生成答案"按钮（仅 AI 已配置时可用）
   - 点击后流式输出 AI 生成的详细结构化答案
   - 支持 Markdown 格式渲染
   - 生成完成后缓存到 localStorage（keyed by questionId）

2. **追问对话**
   - 答案生成后，允许用户输入自定义追问
   - 追问结果追加到同一对话流中展示
   - 支持预设快捷追问按钮（"展开细节""举个具体例子""指出不足"）
   - 每道题最多保留最近 6 轮追问，超出自动丢弃最旧轮次

3. **持久化**
   - localStorage 作为主存储（离线可用、零网络延迟）
   - 每道题存：`{ answer: string, conversations: ChatMessage[], updatedAt: number }`
   - 已有 Supabase `question_bank_states.data` JSONB 字段扩展 `aiAnswers` 字段
   - 同步策略与 practiceRecords 一致：按每道题 `updatedAt` 时间戳合并，取最新的

4. **UI/UX**
   - 生成中：流式逐字展示，可取消
   - 生成后：展示完整答案 + 追问输入框 + 追问历史列表
   - 切题时：保留对话历史（缓存），切回可继续追问
   - 点"重新生成"：清空该题对话历史，重新生成
   - 导出面试准备包时 AI 答案一并包含

## Non-goals

- Claude/Codex 侧不涉及；纯前端功能
- 不修改现有同步冲突策略，复用已有的 conflict resolution 逻辑

## Acceptance Criteria

- [x] PRD 文档完成，明确需求和边界
- [x] `questionAnswerGenerationService.ts` 支持带历史消息的流式生成
- [x] `QuestionAiAnswer.vue` 组件包含三种状态：初始（按钮）/ 生成中（流式）/ 完成（答案+追问）
- [x] `questionBankStore` 新增 `aiAnswers` 缓存 + localStorage 持久化
- [x] `questionBankCloud` 扩展支持 `aiAnswers` 字段的 push/pull/merge
- [x] 导出面试准备包时包含 AI 生成答案
- [x] 切换题目时保留并恢复对话上下文
- [x] 超出 6 轮追问自动截断
- [x] 云同步后重新登录拉取可恢复 AI 答案
- [x] 跑通 lint 和 type-check
