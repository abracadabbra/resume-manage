# AI 一键生成参考答案与追问 — 技术设计

## 架构概览

```
用户操作
  │
  ▼
QuestionDetail.vue
  │
  ├── QuestionReferenceAnswer.vue  ← 题目自带的参考方向（如有）
  │
  └── QuestionAiAnswer.vue  [NEW]
        │ 显示 AI 生成按钮 / 流式输出 / 追问界面
        │
        ├── questionAnswerGenerationService.ts  [NEW]  ← AI 流式生成
        │     └── aiClient.ts.streamChatCompletion()
        │
        └── questionBankStore.aiAnswers  [扩展]
              ├── localStorage（主存储）
              └── Supabase question_bank_states（备份/同步）

questionBankCloud.ts  [扩展]  ← push/pull/merge aiAnswers 字段
```

## 新增文件

### 1. `src/services/questionAnswerGenerationService.ts`

**签名**

```typescript
interface GenerateAnswerInput {
  question: Question
  conversation: ChatMessage[]  // 已有对话历史（含 system 消息）
}

interface GenerateAnswerCallbacks {
  onChunk: (fullText: string) => void
  onDone: (answer: string) => void
  onError: (error: string) => void
}

function generateQuestionAnswer(
  input: GenerateAnswerInput,
  callbacks: GenerateAnswerCallbacks,
  signal?: AbortSignal,
): Promise<void>
```

**Prompt 策略**

- 首次生成：`system(面试官角色) + user(题目+难度+标签+参考方向)`，输出结构化 Markdown 答案
- 追问：追加 `user(追问内容)` 到 conversation，保持同一 context
- 限制：system + 最近 6 轮 user/assistant 消息组合，超出截断最旧的 user/assistant 对

**流式输出**

复用 `aiClient.ts` 的 `streamChatCompletion()`，与 `questionAnswerReviewService.ts` 相同模式。

### 2. `src/components/question-bank/QuestionAiAnswer.vue`

**三种状态**

| State | UI 元素 | 说明 |
|-------|---------|------|
| `idle` | "🤖 AI 生成答案" 按钮 | 无缓存时显示 |
| `generating` | 流式文字 + 取消按钮 | 调用 AI 中 |
| `done` | 完整答案 + 追问区 + "重新生成" | 有缓存或生成完成 |

**追问区**

- 快捷按钮：展开细节、举个具体例子、指出不足、简化版
- 自由输入框 + 发送按钮
- 追问历史列表（Q/A 交替），自动滚动到底部

**Props**

```typescript
defineProps<{
  questionId: string
  question: Question
  aiAnswerData: AiAnswerData | null   // 来自 store
  isAiConfigured: boolean
}>()

const emit = defineEmits<{
  (e: 'generate', conversation: ChatMessage[]): void
  (e: 'follow-up', conversation: ChatMessage[], question: string): void
  (e: 'regenerate'): void
  (e: 'cancel'): void
}>()
```

### 3. Store 扩展 — `questionBank.ts`

```typescript
// 新增类型
export interface AiAnswerData {
  answer: string
  conversations: ChatMessage[]
  updatedAt: number
}

// Store 新增状态
const aiAnswers = ref<Record<string, AiAnswerData>>(loadAiAnswers())

// localStorage key
const AI_ANSWERS_STORAGE_KEY = 'question-bank-ai-answers'

// 方法
function getAiAnswerData(questionId: string): AiAnswerData | null
function saveAiAnswerData(questionId: string, data: AiAnswerData): void
function clearAiAnswerData(questionId: string): void
```

### 4. Cloud 扩展 — `questionBankCloud.ts`

```typescript
interface QuestionBankCloudData {
  schemaVersion: 1 | 2
  addedQuestions: Question[]
  practiceRecords: Record<string, PracticeRecord>
  aiAnswers: Record<string, AiAnswerData>  // NEW
  updatedAt: number
}
```

在 cloud merge 函数中增加 `aiAnswers` 的合并（与 `practiceRecords` 相同的逐 key 时间戳策略）。

## 数据流

### 生成流程

```
点击 "AI 生成答案"
  → emit('generate', [])
  → QuestionDetail 调用 generateQuestionAnswer({ question, conversation: [] }, callbacks)
  → onChunk → QuestionAiAnswer 更新流式文本
  → onDone → store.saveAiAnswerData(questionId, { answer, conversations, updatedAt })
  → QuestionAiAnswer 进入 done 态，展示答案
```

### 追问流程

```
用户输入追问 / 点击快捷按钮
  → emit('follow-up', conversations, text)
  → QuestionDetail 构造新 conversation = [...conversations, userMsg]
  → 再次调用 generateQuestionAnswer({ question, conversation: newConv }, callbacks)
  → onDone → store.saveAiAnswerData(questionId, { answer, conversations: updatedConv, updatedAt })
  → 页面刷新追问历史列表
```

### 切题流程

```
watch(selectedQuestionId)
  → 如果有进行中的生成 → abortController.abort()
  → 从 store 读取新题的 aiAnswerData（如缓存存在）
  → 传入 QuestionAiAnswer 展示
```

### 重新生成流程

```
点击 "重新生成"
  → store.clearAiAnswerData(questionId)
  → emit('regenerate')
  → 走首次生成流程
```

## 关键约束

| 约束 | 实现 |
|------|------|
| 追问最多 6 轮 | conversation 构建时截断，保留 system + 最近 6 对 user/assistant |
| 单次生成超时 | `streamChatCompletion` 已有 `timeoutMs` 参数 |
| 生成中切题 | `QuestionDetail` watch `selectedQuestionId`，调用 `abort()` |
| 未配置 AI | 按钮灰显 + tooltip "请先在 AI 设置中配置模型与密钥" |
| 云同步冲突 | 复用 `decideSyncDecision`，逐 questionId 比 `updatedAt` |

## 与云同步的关系

```
pushToCloud:
  getData() 现在返回 { ...getData(), aiAnswers: aiAnswers.value }

pullFromCloud / loadData:
  合并 aiAnswers: 遍历云端记录，每道题本地 updatedAt < 云端 → 用云端

resolveConflictWithCloud:  直接用云端覆盖全部
resolveConflictWithLocal:  用本地覆盖云端
```

同步冲突策略不变，`aiAnswers` 和 `practiceRecords` 在同一个 JSONB 字段里一起上传/拉取。
