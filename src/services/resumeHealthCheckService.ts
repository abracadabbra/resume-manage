import type { ResumeSnapshot } from '@/services/interviewService'
import { buildResumeDigest } from '@/services/interviewService'
import { extractJsonPayload, streamChatJson } from '@/services/questionParseService'

export interface ResumeHealthModuleScore {
  module: string
  score: number
  advice: string
}

export interface ResumeHealthIssue {
  severity: 'high' | 'medium' | 'low'
  module: string
  problem: string
  suggestion: string
}

export interface ResumeHealthHighlight {
  content: string
  reason: string
}

export interface ResumeHealthCheckResult {
  overallScore: number
  summary: string
  moduleScores: ResumeHealthModuleScore[]
  issues: ResumeHealthIssue[]
  highlights: ResumeHealthHighlight[]
}

export interface ResumeHealthCheckCallbacks {
  onChunk: (text: string) => void
  onDone: (result: ResumeHealthCheckResult) => void
  onError: (error: string) => void
}

const ALLOWED_MODULES = [
  'basicInfo',
  'education',
  'skills',
  'workExperience',
  'projectExperience',
  'awards',
  'selfIntro',
] as const

const MODULE_NAMES: Record<string, string> = {
  basicInfo: '基本信息',
  education: '教育经历',
  skills: '专业技能',
  workExperience: '工作经历',
  projectExperience: '项目经历',
  awards: '荣誉奖项',
  selfIntro: '自我介绍',
}

function buildHealthCheckPrompt(snapshot: ResumeSnapshot): string {
  const digest = buildResumeDigest(snapshot, 'full')

  return `你是一名资深 HR 和简历顾问。请对这份简历做一次"体检"，从 HR 视角找出影响通过率的问题，并给出可执行的改进建议。

要求：
1. 必须严格基于简历已有内容，不要脱离简历虚构问题或建议。
2. overallScore 是 0-100 的整数：90+ 优秀，75-89 良好，60-74 合格，40-59 较弱，<40 严重不足。
3. moduleScores：按模块逐项打分（0-100），并给出该模块的一句话改进建议。模块只能从以下列表中选择：
${ALLOWED_MODULES.map((m) => `${m}（${MODULE_NAMES[m]}）`).join('\n')}
   - 如果简历中该模块完全为空，score 给 0，advice 说明"建议补充"。
   - 如果该模块不在简历启用范围内，可以省略。
4. issues：3-8 项影响通过率的具体问题，按严重程度从高到低排序。每项必须包含：
   - severity：high（致命问题，如联系方式缺失、错别字、时间断层）/ medium（明显短板，如表述模糊、量化不足）/ low（可优化项，如格式、措辞）
   - module：问题所属模块（从上面列表选）
   - problem：具体问题描述（不要泛泛而谈）
   - suggestion：可执行的修改建议（不是让候选人编造经历）
5. highlights：1-4 项简历亮点（写得好的地方），每项说明内容和为什么写得好。如果简历整体很弱，可以返回空数组。
6. summary：80 字以内的总体评价，包含评分层级和最关键的一两条改进方向。

只输出一个 JSON 对象，不要输出任何额外说明：
{
  "overallScore": 78,
  "summary": "总体评价，80字以内",
  "moduleScores": [
    { "module": "basicInfo", "score": 90, "advice": "建议补充求职状态字段" }
  ],
  "issues": [
    {
      "severity": "high",
      "module": "workExperience",
      "problem": "工作经历只有公司名和职位，缺少具体职责和成果描述",
      "suggestion": "每段工作经历补充 2-4 条职责描述，重点写做了什么、用了什么技术、取得什么结果"
    }
  ],
  "highlights": [
    { "content": "项目A的描述中量化了 QPS 从 500 提升到 3000", "reason": "量化数据让成果更可信，是简历的加分项" }
  ]
}

候选人简历：
${digest}`
}

function clampScore(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  const rounded = Math.round(num)
  if (rounded < 0) return 0
  if (rounded > 100) return 100
  return rounded
}

function normalizeModule(value: unknown): string {
  const raw = String(value ?? '').trim()
  return ALLOWED_MODULES.includes(raw as (typeof ALLOWED_MODULES)[number]) ? raw : 'basicInfo'
}

function normalizeStringRecordList(
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

function normalizeSeverity(value: unknown): 'high' | 'medium' | 'low' {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw
  if (raw.includes('高') || raw.includes('严重') || raw.includes('致命')) return 'high'
  if (raw.includes('低') || raw.includes('可优') || raw.includes('建议')) return 'low'
  return 'medium'
}

export function parseResumeHealthCheckResult(raw: string): ResumeHealthCheckResult | null {
  const parsed = JSON.parse(extractJsonPayload(raw)) as Record<string, unknown>

  const moduleScores = normalizeStringRecordList(parsed.moduleScores, [
    'module',
    'score',
    'advice',
  ]).map((item) => ({
    module: normalizeModule(item.module),
    score: clampScore(item.score),
    advice: item.advice ?? '',
  })) as ResumeHealthModuleScore[]

  const issues = normalizeStringRecordList(parsed.issues, [
    'severity',
    'module',
    'problem',
    'suggestion',
  ]).map((item) => ({
    severity: normalizeSeverity(item.severity),
    module: normalizeModule(item.module),
    problem: item.problem ?? '',
    suggestion: item.suggestion ?? '',
  })) as ResumeHealthIssue[]

  const highlights = normalizeStringRecordList(parsed.highlights, [
    'content',
    'reason',
  ]).map((item) => ({
    content: item.content ?? '',
    reason: item.reason ?? '',
  })) as ResumeHealthHighlight[]

  if (moduleScores.length === 0 && issues.length === 0 && highlights.length === 0) {
    return null
  }

  return {
    overallScore: clampScore(parsed.overallScore),
    summary: String(parsed.summary ?? '').trim() || '已生成简历体检报告',
    moduleScores,
    issues,
    highlights,
  }
}

export async function runResumeHealthCheck(
  snapshot: ResumeSnapshot,
  callbacks: ResumeHealthCheckCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const fullText = await streamChatJson(
      '你是一个只输出 JSON 的简历体检评估助手。',
      buildHealthCheckPrompt(snapshot),
      callbacks.onChunk,
      signal,
    )
    const normalized = parseResumeHealthCheckResult(fullText)
    if (!normalized) {
      callbacks.onError('没有生成可用的体检报告，请重试。')
      return
    }
    callbacks.onDone(normalized)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}

export function getHealthModuleLabel(moduleKey: string): string {
  return MODULE_NAMES[moduleKey] ?? moduleKey
}

export function getHealthScoreLevel(score: number): 'excellent' | 'good' | 'fair' | 'weak' | 'poor' {
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'good'
  if (score >= 60) return 'fair'
  if (score >= 40) return 'weak'
  return 'poor'
}

export function getHealthScoreLabel(score: number): string {
  const level = getHealthScoreLevel(score)
  switch (level) {
    case 'excellent':
      return '优秀'
    case 'good':
      return '良好'
    case 'fair':
      return '合格'
    case 'weak':
      return '较弱'
    case 'poor':
      return '严重不足'
    default:
      return ''
  }
}
