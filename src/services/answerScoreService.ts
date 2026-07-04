import { extractJsonPayload, streamChatJson } from '@/services/questionParseService'

/**
 * 面试答题评分服务
 *
 * 用户输入题目和自己的回答，AI 按结构化标准打分并给出改进建议。
 * 与面试会话解耦，可独立使用。
 */

export interface AnswerScoreDimension {
  name: string
  score: number
  comment: string
}

export interface AnswerScoreResult {
  overallScore: number
  level: string
  dimensions: AnswerScoreDimension[]
  strengths: string[]
  weaknesses: string[]
  improvedAnswer: string
  summary: string
}

export interface AnswerScoreCallbacks {
  onChunk: (text: string) => void
  onDone: (result: AnswerScoreResult) => void
  onError: (error: string) => void
}

function buildPrompt(input: { question: string; answer: string }): string {
  return `你是一名资深技术面试官。请对候选人的答题进行评分，从结构化维度给出分数和改进建议。

评分维度（5 项，每项 0-20 分，总分 100）：
1. 完整性（0-20）：是否覆盖题目的关键点，是否有遗漏
2. 技术深度（0-20）：技术细节是否准确、深入，是否讲到原理层面
3. 实践经验（0-20）：是否结合项目经历举例，是否有真实落地细节
4. 表达逻辑（0-20）：是否有清晰的逻辑结构（如总-分-总、STAR），是否易于理解
5. 亮点加分（0-20）：是否有量化数据、对比方案、trade-off 思考、扩展思考

要求：
1. 必须严格基于候选人的回答评分，不要脱离回答虚构内容。
2. strengths：1-3 项回答中的亮点。
3. weaknesses：1-3 项需要改进的地方，要具体（不是泛泛而谈）。
4. improvedAnswer：给出一份更优的参考答案（200-400 字），保留候选人原意但补强薄弱环节。
5. level：根据总分给出层级：90+ 优秀，75-89 良好，60-74 合格，40-59 较弱，<40 严重不足。
6. summary：80 字以内的总体评价。

只输出一个 JSON 对象，不要输出任何额外说明：
{
  "overallScore": 78,
  "level": "良好",
  "dimensions": [
    { "name": "完整性", "score": 16, "comment": "覆盖了主要关键点，但缺少..." }
  ],
  "strengths": ["亮点1", "亮点2"],
  "weaknesses": ["待改进1", "待改进2"],
  "improvedAnswer": "更优的参考答案...",
  "summary": "总体评价，80字以内"
}

面试题目：
${input.question.trim()}

候选人回答：
${input.answer.trim()}`
}

function clampScore(value: unknown, max = 100): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  const rounded = Math.round(num)
  if (rounded < 0) return 0
  if (rounded > max) return max
  return rounded
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

function normalizeDimensions(value: unknown): AnswerScoreDimension[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const name = String(record.name ?? '').trim()
      if (!name) return null
      return {
        name,
        score: clampScore(record.score, 20),
        comment: String(record.comment ?? '').trim(),
      }
    })
    .filter((item): item is AnswerScoreDimension => Boolean(item))
}

export function parseAnswerScoreResult(raw: string): AnswerScoreResult | null {
  try {
    const parsed = JSON.parse(extractJsonPayload(raw)) as Record<string, unknown>

    const dimensions = normalizeDimensions(parsed.dimensions)
    if (dimensions.length === 0) return null

    return {
      overallScore: clampScore(parsed.overallScore),
      level: String(parsed.level ?? '').trim() || '未评级',
      dimensions,
      strengths: normalizeStringList(parsed.strengths),
      weaknesses: normalizeStringList(parsed.weaknesses),
      improvedAnswer: String(parsed.improvedAnswer ?? '').trim(),
      summary: String(parsed.summary ?? '').trim() || '已生成评分报告',
    }
  } catch {
    return null
  }
}

export async function scoreInterviewAnswer(
  input: { question: string; answer: string },
  callbacks: AnswerScoreCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const fullText = await streamChatJson(
      '你是一个只输出 JSON 的面试答题评分助手。',
      buildPrompt(input),
      callbacks.onChunk,
      signal,
    )
    const normalized = parseAnswerScoreResult(fullText)
    if (!normalized) {
      callbacks.onError('没有生成可用的评分结果，请重试。')
      return
    }
    callbacks.onDone(normalized)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}

export function getAnswerScoreLevel(score: number): 'excellent' | 'good' | 'fair' | 'weak' | 'poor' {
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'good'
  if (score >= 60) return 'fair'
  if (score >= 40) return 'weak'
  return 'poor'
}
