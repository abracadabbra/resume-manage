import { extractJsonPayload, streamChatCompletion } from '@/services/aiClient'
import { useAiConfigStore } from '@/stores/aiConfig'
import type { PracticeMastery, Question } from '@/stores/questionBank'

export interface FollowUpDrillRound {
  question: string
  focus: string
  referenceAnswer: string
}

export interface FollowUpDrillPlan {
  summary: string
  rounds: FollowUpDrillRound[]
}

export interface GenerateFollowUpDrillCallbacks {
  onChunk: (text: string) => void
  onDone: (plan: FollowUpDrillPlan) => void
  onError: (error: string) => void
}

interface GenerateFollowUpDrillInput {
  question: Question
  answerDraft?: string
  notes?: string
  mastery?: PracticeMastery
  currentReviewSummary?: string
}

function normalizeRound(input: unknown): FollowUpDrillRound | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const question = String(record.question ?? '').trim()
  const focus = String(record.focus ?? '').trim()
  const referenceAnswer = String(record.referenceAnswer ?? '').trim()

  if (!question || !referenceAnswer) return null

  return {
    question,
    focus: focus || '继续深挖',
    referenceAnswer,
  }
}

export function normalizeFollowUpDrillPlan(input: unknown): FollowUpDrillPlan | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const rounds = Array.isArray(record.rounds)
    ? record.rounds.map(normalizeRound).filter((item): item is FollowUpDrillRound => Boolean(item)).slice(0, 5)
    : []

  if (rounds.length < 3) return null

  return {
    summary: String(record.summary ?? '').trim() || `已生成 ${rounds.length} 轮追问链`,
    rounds,
  }
}

export function buildFallbackFollowUpDrillPlan(question: Question): FollowUpDrillPlan | null {
  const rounds: FollowUpDrillRound[] = [
    {
      question: question.title.trim(),
      focus: '主问题',
      referenceAnswer: question.answer.content.trim() || '请结合参考答案自行补充。',
    },
    ...question.answer.followUp.map((item, index) => ({
      question: item.question.trim(),
      focus: index === 0 ? '第一层追问' : index === 1 ? '第二层追问' : '继续深挖',
      referenceAnswer: item.answer.trim(),
    })),
  ]
    .filter((item) => item.question && item.referenceAnswer)
    .slice(0, 5)

  if (rounds.length < 3) return null

  return {
    summary: `已基于题库内置追问整理出 ${rounds.length} 轮训练，可直接开始演练。`,
    rounds,
  }
}

function buildPrompt(input: GenerateFollowUpDrillInput): string {
  const builtInFollowUps = input.question.answer.followUp
    .map((item, index) => `${index + 1}. ${item.question}\n参考方向：${item.answer}`)
    .join('\n\n')

  return [
    '你是一名严格的技术面试官，请围绕同一道题设计一组连续 3-5 轮的追问链训练。',
    '目标是模拟真实压力面，不是重复换个说法问同一件事。',
    '要求：',
    '1. 第 1 轮必须从主问题切入，后面逐步深挖到原理、取舍、异常场景、线上问题或项目落地细节。',
    '2. 每一轮都要给出一个“参考回答要点”，方便训练后复盘。',
    '3. 问题要贴合当前题目、参考答案、已有追问和候选人的薄弱点，不要编造无关技术栈。',
    '4. 整体轮次控制在 3-5 轮。',
    '5. 只输出 JSON，不要输出解释文字。',
    '',
    `主问题：${input.question.title}`,
    `当前掌握状态：${input.mastery ?? 'unpracticed'}`,
    '',
    '参考答案：',
    input.question.answer.content || '（无）',
    '',
    '题库已有高频追问：',
    builtInFollowUps || '（无）',
    '',
    '候选人当前回答草稿：',
    input.answerDraft?.trim() || '（暂无）',
    '',
    '练习备注：',
    input.notes?.trim() || '（暂无）',
    '',
    '最近 AI 点评摘要：',
    input.currentReviewSummary?.trim() || '（暂无）',
    '',
    '输出格式：',
    '{',
    '  "summary": "这组追问链主要打击的薄弱点，60字以内",',
    '  "rounds": [',
    '    {',
    '      "question": "第1轮问题",',
    '      "focus": "这一轮主要考什么",',
    '      "referenceAnswer": "这一轮应该答到的关键点"',
    '    }',
    '  ]',
    '}',
  ].join('\n')
}

export async function generateFollowUpDrillPlan(
  input: GenerateFollowUpDrillInput,
  callbacks: GenerateFollowUpDrillCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const config = useAiConfigStore()

  if (!config.apiUrl || !config.apiToken || !config.modelName) {
    callbacks.onError('请先在 AI 设置里配置模型与密钥。')
    return
  }

  try {
    const fullText = await streamChatCompletion({
      config,
      messages: [
        {
          role: 'system',
          content: '你是一个只输出 JSON 的追问链训练助手。',
        },
        {
          role: 'user',
          content: buildPrompt(input),
        },
      ],
      signal,
      onChunk: callbacks.onChunk,
    })

    const normalized = normalizeFollowUpDrillPlan(JSON.parse(extractJsonPayload(fullText)))
    if (!normalized) {
      callbacks.onError('追问链结果解析失败，请重试。')
      return
    }

    callbacks.onDone(normalized)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}
