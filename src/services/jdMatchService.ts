import type { ResumeSnapshot } from '@/services/interviewService'
import { buildResumeDigest } from '@/services/interviewService'
import { extractJsonPayload, streamChatJson } from '@/services/questionParseService'

export interface JdMatchInput {
  jdName: string
  jdText: string
  resumeSnapshot: ResumeSnapshot
}

export interface JdMatchKeyword {
  keyword: string
  evidence: string
}

export interface JdMatchMissingKeyword {
  keyword: string
  suggestion: string
}

export interface JdMatchArea {
  area: string
  reason: string
  advice: string
}

export interface JdMatchStrongArea {
  area: string
  evidence: string
}

export interface JdMatchResult {
  overallScore: number
  summary: string
  matchedKeywords: JdMatchKeyword[]
  missingKeywords: JdMatchMissingKeyword[]
  strongAreas: JdMatchStrongArea[]
  weakAreas: JdMatchArea[]
}

export interface JdMatchCallbacks {
  onChunk: (text: string) => void
  onDone: (result: JdMatchResult) => void
  onError: (error: string) => void
}

function buildJdMatchPrompt(input: JdMatchInput): string {
  const resumeDigest = buildResumeDigest(input.resumeSnapshot, 'full')
  const jdContext = [input.jdName.trim(), input.jdText.trim()].filter(Boolean).join('\n\n')

  return `你是一名资深技术招聘官和求职辅导教练。请基于“候选人当前简历 + 目标岗位 JD”，客观评估简历与该 JD 的匹配度，并给出可执行的改进建议。

要求：
1. 必须严格基于简历已有信息和 JD 内容，不要脱离简历虚构经历，也不要凭空假设 JD 没写的要求。
2. overallScore 是 0-100 的整数，反映整体匹配度。评分要客观：90+ 几乎完美匹配，75-89 较好匹配，60-74 基本匹配但有缺口，40-59 匹配较弱，<40 严重不匹配。
3. matchedKeywords：JD 中明确要求且简历里有体现的关键技能/经验，每项给出简历中的具体证据。
4. missingKeywords：JD 中明确要求但简历里完全没体现或非常弱的关键技能/经验，每项给出“如何在简历中补充”的建议（不是让候选人编造经历）。
5. strongAreas：候选人相对 JD 的明显优势项，每项给出简历中的具体证据。
6. weakAreas：匹配缺口最严重的 2-4 个领域，每项给出原因和“面试时如何补救 / 简历如何调整”的建议。
7. summary：80 字以内的总体评价，包含匹配度层级和最关键的一两条改进方向。
8. matchedKeywords 和 missingKeywords 各控制在 4-10 项，按重要性排序。
9. strongAreas 控制在 2-5 项，weakAreas 控制在 2-4 项。

只输出一个 JSON 对象，不要输出任何额外说明：
{
  "overallScore": 78,
  "summary": "总体评价，80字以内",
  "matchedKeywords": [
    { "keyword": "Spring Boot", "evidence": "项目A中使用 Spring Boot 构建微服务" }
  ],
  "missingKeywords": [
    { "keyword": "K8s", "suggestion": "若有容器化部署经验，可在项目A中补充 K8s 部署细节" }
  ],
  "strongAreas": [
    { "area": "高并发处理", "evidence": "项目A中通过 Redis 缓存将 QPS 从 500 提升到 3000" }
  ],
  "weakAreas": [
    { "area": "分布式系统设计", "reason": "JD 要求分布式架构经验，但简历中主要是单机服务", "advice": "面试时重点讲项目B中的分库分表设计，简历补充相关数据规模" }
  ]
}

目标 JD：
${jdContext || '（仅提供了 JD 名称，请结合岗位名称合理推断核心要求）'}

候选人简历：
${resumeDigest}`
}

function clampScore(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  const rounded = Math.round(num)
  if (rounded < 0) return 0
  if (rounded > 100) return 100
  return rounded
}

function normalizeStringList(
  value: unknown,
  fields: string[],
): Array<Record<string, string>> {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const result: Record<string, string> = {}
      for (const field of fields) {
        result[field] = String(record[field] ?? '').trim()
      }
      return result
    })
    .filter((item): item is Record<string, string> => Boolean(item))
    .filter((item) => Object.values(item).some((v) => v.length > 0))
}

export function parseJdMatchResult(raw: string): JdMatchResult | null {
  const parsed = JSON.parse(extractJsonPayload(raw)) as Record<string, unknown>

  const matchedKeywords = normalizeStringList(parsed.matchedKeywords, [
    'keyword',
    'evidence',
  ]).map((item) => ({
    keyword: item.keyword ?? '',
    evidence: item.evidence ?? '',
  })) as JdMatchKeyword[]

  const missingKeywords = normalizeStringList(parsed.missingKeywords, [
    'keyword',
    'suggestion',
  ]).map((item) => ({
    keyword: item.keyword ?? '',
    suggestion: item.suggestion ?? '',
  })) as JdMatchMissingKeyword[]

  const strongAreas = normalizeStringList(parsed.strongAreas, [
    'area',
    'evidence',
  ]).map((item) => ({
    area: item.area ?? '',
    evidence: item.evidence ?? '',
  })) as JdMatchStrongArea[]

  const weakAreas = normalizeStringList(parsed.weakAreas, [
    'area',
    'reason',
    'advice',
  ]).map((item) => ({
    area: item.area ?? '',
    reason: item.reason ?? '',
    advice: item.advice ?? '',
  })) as JdMatchArea[]

  if (
    matchedKeywords.length === 0 &&
    missingKeywords.length === 0 &&
    strongAreas.length === 0 &&
    weakAreas.length === 0
  ) {
    return null
  }

  return {
    overallScore: clampScore(parsed.overallScore),
    summary: String(parsed.summary ?? '').trim() || '已生成匹配度评估',
    matchedKeywords,
    missingKeywords,
    strongAreas,
    weakAreas,
  }
}

export async function analyzeJdMatch(
  input: JdMatchInput,
  callbacks: JdMatchCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const fullText = await streamChatJson(
      '你是一个只输出 JSON 的简历-JD 匹配度评估助手。',
      buildJdMatchPrompt(input),
      callbacks.onChunk,
      signal,
    )
    const normalized = parseJdMatchResult(fullText)
    if (!normalized) {
      callbacks.onError('没有生成可用的匹配度评估，请重试。')
      return
    }
    callbacks.onDone(normalized)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}
