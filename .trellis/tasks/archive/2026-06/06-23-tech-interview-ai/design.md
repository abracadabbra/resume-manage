# 大厂面经 AI 答案与笔记增强 — 技术设计

## 架构概览

```
用户操作
  │
  ▼
TechQuestionDetail.vue
  │
  ├── 原有元数据显示（题目/频率/公司）
  │
  └── TechInterviewAiAnswer.vue  [NEW]
        │ 显示 AI 生成按钮 / 流式输出 / 追问界面
        │
        ├── techInterviewAnswerGenerationService.ts  [NEW]  ← AI 流式生成
        │
        └── useTechInterviewQuestionsStore.aiAnswers  [扩展]
              └── localStorage（tech-interview-ai-answers）
```

## 新增文件

### 1. `src/services/techInterviewAnswerGenerationService.ts`

签名与 `questionAnswerGenerationService.ts` 完全一致：

```typescript
interface TechInterviewQuestionInput {
  q: string       // 题目
  company?: string
  position?: string
  round?: string
  techField?: string
}

interface GenerateAnswerInput {
  question: TechInterviewQuestionInput
  conversation: ChatMessage[]
}

interface GenerateAnswerCallbacks {
  onChunk: (fullText: string) => void
  onDone: (answer: string) => void
  onError: (error: string) => void
}

function generateTechInterviewAnswer(
  input: GenerateAnswerInput,
  callbacks: GenerateAnswerCallbacks,
  signal?: AbortSignal,
): Promise<void>
```

**Prompt 策略**：与题库相同，system(面试官) + user(题目+公司+岗位+轮次)，追问时追加 conversation 历史（最多 6 轮）。

### 2. `src/components/tech-interview/TechInterviewAiAnswer.vue`

与 `QuestionAiAnswer.vue` 三状态模式完全一致：

| State | UI 元素 |
|-------|---------|
| `idle` | "🤖 AI 生成答案" 按钮 |
| `generating` | 流式文字 + 取消按钮 |
| `done` | 完整答案 + 追问区 + "重新生成" |

**Props**
```typescript
defineProps<{
  questionId: string
  question: TechInterviewQuestion
  aiAnswerData: AiAnswerData | null
  isAiConfigured: boolean
  streamingText?: string
}>()

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'follow-up', text: string): void
  (e: 'regenerate'): void
  (e: 'cancel'): void
}>()
```

### 3. Store 扩展 — `useTechInterviewQuestionsStore`

```typescript
// AiAnswerData 同题库
export interface AiAnswerData {
  answer: string
  conversations: ChatMessage[]
  updatedAt: number
}

// 新增状态
const aiAnswers = ref<Record<string, AiAnswerData>>(loadTechInterviewAiAnswers())

const TECH_INTERVIEW_AI_ANSWERS_KEY = 'tech-interview-ai-answers'

function getAiAnswerData(questionId: string): AiAnswerData | null
function saveAiAnswerData(questionId: string, data: AiAnswerData): void
function clearAiAnswerData(questionId: string): void
```

### 4. TechQuestionDetail.vue 扩展

新增字段显示区域（放在 `detail-meta` 区块内）：
```html
<div v-if="store.selectedQuestion?.link" class="meta-section">
  <a :href="store.selectedQuestion.link" target="_blank" class="note-link">
    📎 查看原始笔记
  </a>
</div>
<div v-if="store.selectedQuestion?.position || store.selectedQuestion?.round" class="meta-section">
  <span class="meta-label">岗位 / 轮次</span>
  <span>{{ store.selectedQuestion.position }} / {{ store.selectedQuestion.round }}</span>
</div>
<div v-if="store.selectedQuestion?.techField" class="meta-section">
  <span class="meta-label">技术领域</span>
  <span>{{ store.selectedQuestion.techField }}</span>
</div>
<div v-if="store.selectedQuestion?.publishedAt" class="meta-section">
  <span class="meta-label">发布时间</span>
  <span>{{ store.selectedQuestion.publishedAt }}</span>
</div>
```

## 数据重建

`scripts/rebuild_tech_interview_json.py` — 读取 Excel sheet2，输出 JSON：

```python
# 输入: 笔记ID, 笔记标题, 公司, 岗位, 轮次, 技术领域, 题目, 链接, 发布时间
# 输出: tech-interview-questions.json

# 按技术领域分组为 categories
# 同技术领域下按公司聚合题目
# f = 同技术领域同公司下该题目出现次数
# 保留所有字段
```

执行命令：
```bash
python scripts/rebuild_tech_interview_json.py
```

## 关键约束

| 约束 | 实现 |
|------|------|
| 追问最多 6 轮 | `buildMessages()` 截断逻辑与题库相同 |
| 生成中切题 | `TechQuestionDetail` watch `selectedQuestionId`，调用 `abort()` |
| 未配置 AI | 按钮灰显 + tooltip |
| 离线可用 | localStorage 持久化，零网络依赖 |
