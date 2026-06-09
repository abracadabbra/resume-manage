import { extractJsonPayload, streamChatCompletion } from '@/services/aiClient'
import { useAiConfigStore } from '@/stores/aiConfig'
import type { PracticeMastery, Question } from '@/stores/questionBank'

export interface QuestionAnswerReviewResult {
  overallScore: number
  completenessScore: number
  accuracyScore: number
  depthScore: number
  deliveryScore: number
  summary: string
  strengths: string[]
  improvements: string[]
  improvedAnswer: string
}

export interface ReviewAnswerCallbacks {
  onChunk: (text: string) => void
  onDone: (result: QuestionAnswerReviewResult) => void
  onError: (error: string) => void
}

interface ReviewAnswerInput {
  question: Question
  answerDraft: string
  notes?: string
  mastery?: PracticeMastery
}

function clampScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeReviewResult(input: unknown): QuestionAnswerReviewResult | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>

  const normalizeList = (value: unknown) =>
    Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 5) : []

  const result: QuestionAnswerReviewResult = {
    overallScore: clampScore(record.overallScore),
    completenessScore: clampScore(record.completenessScore),
    accuracyScore: clampScore(record.accuracyScore),
    depthScore: clampScore(record.depthScore),
    deliveryScore: clampScore(record.deliveryScore),
    summary: String(record.summary ?? '').trim(),
    strengths: normalizeList(record.strengths),
    improvements: normalizeList(record.improvements),
    improvedAnswer: String(record.improvedAnswer ?? '').trim(),
  }

  if (!result.summary || !result.improvedAnswer) return null
  return result
}

function buildPrompt(input: ReviewAnswerInput): string {
  const followUp = input.question.answer.followUp
    .map((item, index) => `${index + 1}. ${item.question}\n参考方向：${item.answer}`)
    .join('\n\n')

  return [
    '你是一名严格但负责的技术面试官和面试教练。',
    '请基于“题目、参考答案、追问、候选人回答草稿、练习备注”来点评候选人的回答。',
    '点评要求：',
    '1. 不要脱离题目本身随意发挥。',
    '2. 评分要真实，不要一味给高分。',
    '3. 如果候选人回答不完整，要明确指出缺口。',
    '4. 输出一个更适合面试表达的改进版回答。',
    '5. 只输出 JSON，不要输出解释文字。',
    '',
    `题目：${input.question.title}`,
    `当前掌握状态：${input.mastery ?? 'unpracticed'}`,
    '',
    '参考答案：',
    input.question.answer.content || '（无）',
    '',
    '高频追问：',
    followUp || '（无）',
    '',
    '候选人回答草稿：',
    input.answerDraft.trim() || '（空）',
    '',
    '练习备注：',
    input.notes?.trim() || '（无）',
    '',
    '请输出如下 JSON：',
    '{',
    '  "overallScore": 72,',
    '  "completenessScore": 70,',
    '  "accuracyScore": 76,',
    '  "depthScore": 68,',
    '  "deliveryScore": 74,',
    '  "summary": "一句话总结当前回答水平",',
    '  "strengths": ["优点1", "优点2"],',
    '  "improvements": ["问题1", "问题2", "问题3"],',
    '  "improvedAnswer": "更适合面试直接回答的版本"',
    '}',
  ].join('\n')
}

export async function reviewQuestionAnswer(
  input: ReviewAnswerInput,
  callbacks: ReviewAnswerCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const config = useAiConfigStore()

  if (!config.apiUrl || !config.apiToken || !config.modelName) {
    callbacks.onError('请先在 AI 设置里配置模型与密钥。')
    return
  }

  if (!input.answerDraft.trim()) {
    callbacks.onError('请先填写“我的回答”，再进行 AI 点评。')
    return
  }

  try {
    const fullText = await streamChatCompletion({
      config,
      messages: [
        {
          role: 'system',
          content: '你是一个只输出 JSON 的面试回答点评助手。',
        },
        {
          role: 'user',
          content: buildPrompt(input),
        },
      ],
      signal,
      onChunk: callbacks.onChunk,
    })

    const normalized = normalizeReviewResult(JSON.parse(extractJsonPayload(fullText)))
    if (!normalized) {
      callbacks.onError('AI 点评结果解析失败，请重试。')
      return
    }

    callbacks.onDone(normalized)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}
