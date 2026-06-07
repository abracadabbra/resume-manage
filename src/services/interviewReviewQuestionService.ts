import type { FinalEvaluation, ResumeSnapshot } from '@/services/interviewService'
import { buildResumeDigest } from '@/services/interviewService'
import {
  extractJsonPayload,
  normalizeQuestionRecord,
  streamChatJson,
  type GeneratedResumeQuestion,
} from '@/services/questionParseService'

export interface InterviewReviewMessage {
  role: 'assistant' | 'user'
  content: string
}

export interface InterviewReviewQuestionBatch {
  summary: string
  questions: GeneratedResumeQuestion[]
}

export interface GenerateInterviewReviewQuestionsInput {
  finalEvaluation: FinalEvaluation
  messages: InterviewReviewMessage[]
  memorySummary?: string
  resumeSnapshot: ResumeSnapshot
}

export interface GenerateInterviewReviewQuestionsCallbacks {
  onChunk: (text: string) => void
  onDone: (result: InterviewReviewQuestionBatch) => void
  onError: (error: string) => void
}

function truncateText(content: string, maxLength: number): string {
  const text = content.trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}

function buildConversationDigest(messages: InterviewReviewMessage[]): string {
  return messages
    .filter((item) => item.content.trim() !== '')
    .slice(-10)
    .map((item, index) => `${index + 1}. ${item.role === 'assistant' ? 'AI' : '用户'}：${truncateText(item.content, 220)}`)
    .join('\n')
}

function buildPrompt(input: GenerateInterviewReviewQuestionsInput): string {
  const evaluation = input.finalEvaluation
  const resumeDigest = buildResumeDigest(input.resumeSnapshot, 'compact')
  const memorySummary = truncateText(input.memorySummary?.replace(/\s+/g, ' ').trim() || '（暂无）', 220)
  const conversationDigest = buildConversationDigest(input.messages)
  const improvements =
    evaluation.improvements.length > 0
      ? evaluation.improvements.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : '（暂无明确改进项，请结合对话自行提炼）'

  return `你是一名资深技术面试复盘教练。请基于这场模拟面试的最终评分、暴露的短板、关键对话和候选人简历，产出一组“最值得立刻复习”的题目。

目标：
1. 只生成和这次面试暴露问题直接相关的复习题，不要泛泛铺开。
2. 优先围绕评分较低模块、总结中的改进项、回答明显不完整或不够深入的地方。
3. 如果问题来自项目经历，题目要具体到项目场景，而不是泛化成空泛八股。
4. 每道题都要给出可直接练习的参考答案，并补 1-3 个高频追问。
5. 题量控制在 6-10 道，宁可少而准。
6. 标签必须包含“简历定制”，并尽量补充“高频追问 / 项目深挖 / 深入理解 / 设计能力”中的合适标签。
7. difficulty 只能是 basic / intermediate / advanced。

只输出一个 JSON 对象，不要输出任何额外说明：
{
  "summary": "这次模拟面试最该补的方向，80字以内",
  "questions": [
    {
      "chapterId": "ch9",
      "chapterName": "项目深挖",
      "title": "题目",
      "difficulty": "advanced",
      "labels": ["简历定制", "项目深挖", "高频追问"],
      "answer": {
        "content": "参考答案",
        "followUp": [
          { "question": "追问1", "answer": "追问答案1" }
        ]
      }
    }
  ]
}

最终评分：
- 综合：${evaluation.totalScore}
- 项目：${evaluation.projectScore}
- 技能：${evaluation.skillScore}
- 工作：${evaluation.workScore}
- 教育：${evaluation.educationScore}
- 结论：${evaluation.passed ? '通过' : '未通过'}

总结：
${evaluation.summary || '（暂无）'}

改进项：
${improvements}

记忆摘要：
${memorySummary}

关键对话摘录：
${conversationDigest || '（暂无）'}

简历摘要：
${resumeDigest}`
}

export function parseInterviewReviewQuestionBatch(raw: string): InterviewReviewQuestionBatch | null {
  const parsed = JSON.parse(extractJsonPayload(raw)) as Record<string, unknown>
  const questionList = Array.isArray(parsed.questions) ? parsed.questions : []
  const deduped = new Set<string>()
  const normalizedQuestions = questionList
    .map(normalizeQuestionRecord)
    .filter((item): item is GeneratedResumeQuestion => Boolean(item))
    .filter((item) => {
      const key = `${item.chapterId}::${item.title.trim().toLowerCase()}`
      if (deduped.has(key)) return false
      deduped.add(key)
      return true
    })

  if (normalizedQuestions.length === 0) return null

  return {
    summary: String(parsed.summary ?? '').trim() || `已提炼 ${normalizedQuestions.length} 道待复习题`,
    questions: normalizedQuestions,
  }
}

export async function generateInterviewReviewQuestions(
  input: GenerateInterviewReviewQuestionsInput,
  callbacks: GenerateInterviewReviewQuestionsCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const fullText = await streamChatJson(
      '你是一个只输出 JSON 的模拟面试复盘出题助手。',
      buildPrompt(input),
      callbacks.onChunk,
      signal,
    )
    const normalized = parseInterviewReviewQuestionBatch(fullText)
    if (!normalized) {
      callbacks.onError('没有生成可导入的复习题，请重试。')
      return
    }
    callbacks.onDone(normalized)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}
