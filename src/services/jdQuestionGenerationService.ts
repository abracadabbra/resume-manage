import type { ResumeSnapshot } from '@/services/interviewService'
import { buildResumeDigest } from '@/services/interviewService'
import {
  CHAPTERS_CONTEXT,
  extractJsonPayload,
  normalizeQuestionRecord,
  streamChatJson,
  type GeneratedResumeQuestion,
} from '@/services/questionParseService'

export interface GenerateJdQuestionsInput {
  jdName: string
  jdText: string
  resumeSnapshot: ResumeSnapshot
}

export interface GeneratedJdQuestionBatch {
  summary: string
  questions: GeneratedResumeQuestion[]
}

export interface GenerateJdQuestionsCallbacks {
  onChunk: (text: string) => void
  onDone: (result: GeneratedJdQuestionBatch) => void
  onError: (error: string) => void
}

function buildPrompt(input: GenerateJdQuestionsInput): string {
  const resumeDigest = buildResumeDigest(input.resumeSnapshot, 'full')
  const jdContext = [input.jdName.trim(), input.jdText.trim()].filter(Boolean).join('\n\n')

  return `你是一名资深技术面试官和求职辅导教练。请基于“候选人当前简历 + 目标岗位 JD”，生成一组最贴近该岗位真实面试的问题。

要求：
1. 必须同时参考简历和 JD，不要脱离已有经历虚构候选人不会的技术栈。
2. 优先生成这份 JD 最可能会问、且候选人最需要准备的问题。
3. 既要覆盖基础技术，也要覆盖项目深挖、岗位匹配、业务场景、方案取舍和稳定性问题。
4. 如果 JD 强调某个方向，而简历里相关内容较弱，要把这类“匹配缺口”转成重点问题。
5. 每道题都要给出具体、可直接练习的参考答案，并补 1-3 个高频追问。
6. 题量控制在 10-16 道，避免重复改写同一题。
7. 章节只能从以下列表中选择：
${CHAPTERS_CONTEXT}
8. labels 优先使用：["简历定制", "必须掌握", "高频追问", "深入理解", "设计能力", "项目深挖"]
9. difficulty 只能是：basic、intermediate、advanced

只输出一个 JSON 对象，不要输出任何额外说明：
{
  "summary": "这份简历针对该 JD 的准备重点，80字以内",
  "questions": [
    {
      "chapterId": "ch10",
      "chapterName": "系统设计",
      "title": "题目",
      "difficulty": "advanced",
      "labels": ["简历定制", "高频追问"],
      "answer": {
        "content": "参考答案",
        "followUp": [
          { "question": "追问1", "answer": "追问答案1" }
        ]
      }
    }
  ]
}

目标 JD：
${jdContext || '（仅提供了 JD 名称，请结合岗位名称合理推断核心面试方向）'}

候选人简历：
${resumeDigest}`
}

export function parseJdQuestionBatch(raw: string): GeneratedJdQuestionBatch | null {
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
    summary: String(parsed.summary ?? '').trim() || `已生成 ${normalizedQuestions.length} 道 JD 专项题`,
    questions: normalizedQuestions,
  }
}

export async function generateJdQuestions(
  input: GenerateJdQuestionsInput,
  callbacks: GenerateJdQuestionsCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const fullText = await streamChatJson(
      '你是一个只输出 JSON 的 JD 专项出题助手。',
      buildPrompt(input),
      callbacks.onChunk,
      signal,
    )
    const normalized = parseJdQuestionBatch(fullText)
    if (!normalized) {
      callbacks.onError('没有生成可导入的 JD 题目，请重试。')
      return
    }
    callbacks.onDone(normalized)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}
