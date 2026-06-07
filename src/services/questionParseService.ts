import questionBankData from '@/data/interview-questions.json'
import { buildResumeDigest, type ResumeSnapshot } from '@/services/interviewService'
import type { ProjectEntry } from '@/stores/resume'
import { useAiConfigStore } from '@/stores/aiConfig'
import type { QuestionDraft } from '@/stores/questionBank'

export interface ParsedQuestion extends QuestionDraft {
  chapterName: string
}

export interface ParseQuestionCallbacks {
  onChunk: (text: string) => void
  onDone: (question: ParsedQuestion) => void
  onError: (error: string) => void
}

export interface GeneratedResumeQuestion extends QuestionDraft {
  chapterName: string
}

export interface GeneratedResumeQuestionBatch {
  summary: string
  questions: GeneratedResumeQuestion[]
}

export interface GenerateResumeQuestionsCallbacks {
  onChunk: (text: string) => void
  onDone: (result: GeneratedResumeQuestionBatch) => void
  onError: (error: string) => void
}

export interface GeneratedProjectQuestionBatch {
  summary: string
  projectName: string
  questions: GeneratedResumeQuestion[]
}

export interface GenerateProjectQuestionsCallbacks {
  onChunk: (text: string) => void
  onDone: (result: GeneratedProjectQuestionBatch) => void
  onError: (error: string) => void
}

type Difficulty = 'basic' | 'intermediate' | 'advanced'

type ChapterMeta = {
  id: string
  name: string
  shortName: string
  order: number
}

type QuestionBankDataset = {
  chapters: ChapterMeta[]
}

const dataset = questionBankData as QuestionBankDataset
const chapterList = [...dataset.chapters].sort((a, b) => a.order - b.order)
const chapterMap = new Map(chapterList.map((chapter) => [chapter.id, chapter]))
const DEFAULT_CHAPTER_ID = chapterList[chapterList.length - 1]?.id ?? 'ch14'
const DEFAULT_LABELS = ['简历定制']
const ALLOWED_LABELS = new Set([
  '简历定制',
  '必须掌握',
  '高频追问',
  '深入理解',
  '设计能力',
  '项目深挖',
])

export const CHAPTERS_CONTEXT = chapterList
  .map((chapter) => `${chapter.id}: ${chapter.name}`)
  .join('\n')

function normalizeApiUrl(raw: string): string {
  let baseUrl = raw.trim().replace(/\/+$/, '')
  if (!baseUrl.includes('/v1/chat/completions')) {
    if (!baseUrl.endsWith('/v1')) {
      baseUrl += '/v1'
    }
    baseUrl += '/chat/completions'
  }
  return baseUrl
}

export function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first >= 0 && last > first) return raw.slice(first, last + 1).trim()
  return raw.trim()
}

function normalizeDifficulty(value: unknown): Difficulty {
  if (typeof value !== 'string') return 'intermediate'
  if (value === 'basic' || value === 'intermediate' || value === 'advanced') return value
  const lowered = value.trim().toLowerCase()
  if (lowered.includes('basic') || lowered.includes('基础')) return 'basic'
  if (lowered.includes('advanced') || lowered.includes('高级')) return 'advanced'
  return 'intermediate'
}

function normalizeLabels(value: unknown): string[] {
  const labels = Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : []
  const merged = [...DEFAULT_LABELS, ...labels]
  return [...new Set(merged.filter((label) => ALLOWED_LABELS.has(label) || label.length <= 12))]
}

function normalizeChapterId(value: unknown, chapterName?: unknown): string {
  const raw = String(value ?? '').trim()
  if (chapterMap.has(raw)) return raw

  const numeric = raw.match(/\d+/)?.[0]
  if (numeric) {
    const normalized = `ch${Number(numeric)}`
    if (chapterMap.has(normalized)) return normalized
  }

  const name = String(chapterName ?? '').trim()
  if (name) {
    const matchedByName = chapterList.find(
      (chapter) =>
        chapter.name === name ||
        chapter.shortName === name ||
        chapter.name.includes(name) ||
        name.includes(chapter.shortName),
    )
    if (matchedByName) return matchedByName.id
  }

  return DEFAULT_CHAPTER_ID
}

function normalizeFollowUps(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const question = String(record.question ?? '').trim()
      const answer = String(record.answer ?? '').trim()
      if (!question || !answer) return null
      return { question, answer }
    })
    .filter((item): item is { question: string; answer: string } => Boolean(item))
    .slice(0, 3)
}

export function normalizeQuestionRecord(input: unknown): GeneratedResumeQuestion | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const title = String(record.title ?? '').trim()
  const answerRecord =
    record.answer && typeof record.answer === 'object'
      ? (record.answer as Record<string, unknown>)
      : null
  const answerContent = String(answerRecord?.content ?? '').trim()

  if (!title || !answerContent) return null

  const chapterId = normalizeChapterId(record.chapterId, record.chapterName)
  const chapter = chapterMap.get(chapterId)

  return {
    chapterId,
    chapterName: chapter?.name ?? (String(record.chapterName ?? '').trim() || chapterId),
    title,
    difficulty: normalizeDifficulty(record.difficulty),
    labels: normalizeLabels(record.labels),
    answer: {
      content: answerContent,
      followUp: normalizeFollowUps(answerRecord?.followUp),
    },
  }
}

export async function streamChatJson(
  systemPrompt: string,
  userMessage: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const config = useAiConfigStore()

  if (!config.apiUrl || !config.apiToken) {
    throw new Error('请先在设置中配置 AI API')
  }

  const response = await fetch(normalizeApiUrl(config.apiUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiToken}`,
    },
    body: JSON.stringify({
      model: config.modelName || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`API 请求失败 (${response.status}): ${errorText || response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('无法读取 API 响应流')
  }

  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue

      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content
        if (!content) continue
        fullText += content
        onChunk(fullText)
      } catch {
        // Ignore malformed streaming chunks.
      }
    }
  }

  return fullText
}

function buildParseQuestionPrompt() {
  return `你是一个面试题库管理助手。用户会输入一段题目描述（可能包含题目、答案、追问方向等），你需要从中提取信息并生成结构化的题目数据。

题目库章节如下：
${CHAPTERS_CONTEXT}

标签建议优先从以下集合中选择：["简历定制", "必须掌握", "高频追问", "深入理解", "设计能力", "项目深挖"]

难度级别只能是：basic、intermediate、advanced

直接输出 JSON，不要输出解释文字：
{
  "chapterId": "ch1",
  "chapterName": "Java 基础 & 并发",
  "title": "题目",
  "difficulty": "intermediate",
  "labels": ["必须掌握"],
  "answer": {
    "content": "标准答案内容",
    "followUp": [
      { "question": "追问1", "answer": "针对追问1的标准答案" }
    ]
  }
}`
}

function buildGenerateResumeQuestionsPrompt(resumeSnapshot: ResumeSnapshot) {
  const digest = buildResumeDigest(resumeSnapshot, 'full')

  return `你是一名非常资深的技术面试官和面试教练。请严格基于这份简历，生成“这位候选人大概率会被问到的全部面试问题清单”。

要求：
1. 必须严格围绕简历已有信息，不要脱离简历虚构技术栈。
2. 覆盖面要尽量完整，包括：自我介绍追问、技术栈基础、项目深挖、工作经历追问、方案取舍、性能优化、故障排查、架构设计、开放问题。
3. 题目尽量去重，不要只换个说法重复问。
4. 每道题都要给出“高质量参考答案”，答案要具体、可面试作答，不要空话。
5. 每道题补充 1-3 个高频追问。
6. 题目数量控制在 18-28 道，优先覆盖最可能出现的高价值问题。
7. 章节只能从以下列表中选择：
${CHAPTERS_CONTEXT}
8. labels 优先使用：["简历定制", "必须掌握", "高频追问", "深入理解", "设计能力", "项目深挖"]
9. difficulty 只能是：basic、intermediate、advanced

只输出一个 JSON 对象，不要输出任何额外说明：
{
  "summary": "对这份简历的面试覆盖总结，80字以内",
  "questions": [
    {
      "chapterId": "ch9",
      "chapterName": "项目深挖 — 算法工程平台",
      "title": "题目",
      "difficulty": "advanced",
      "labels": ["简历定制", "项目深挖"],
      "answer": {
        "content": "参考答案",
        "followUp": [
          { "question": "追问1", "answer": "追问答案1" }
        ]
      }
    }
  ]
}

以下是简历内容：
${digest}`
}

function buildGenerateProjectQuestionsPrompt(
  resumeSnapshot: ResumeSnapshot,
  project: ProjectEntry,
) {
  const digest = buildResumeDigest({
    ...resumeSnapshot,
    projectList: [project],
    workList: resumeSnapshot.workList.slice(0, 2),
    educationList: resumeSnapshot.educationList.slice(0, 1),
  }, 'full')

  return `你是一名非常资深的技术面试官和面试教练。请严格围绕“这一个项目经历”，生成候选人在面试中最可能被连续深挖的问题。

要求：
1. 只围绕当前这个项目，不要发散成整份简历的全量题库。
2. 优先覆盖：项目背景、业务目标、技术选型、核心方案、数据链路、性能优化、稳定性、故障排查、难点取舍、个人贡献。
3. 如果项目描述里出现技术名词，要追问到“为什么、怎么做、效果如何、踩过什么坑”。
4. 每道题都要给出高质量参考答案，答案要具体、可直接面试作答，不要空话。
5. 每道题补充 1-3 个高频追问。
6. 题目数量控制在 8-12 道，宁可少而准，不要重复换说法。
7. 章节只能从以下列表中选择：
${CHAPTERS_CONTEXT}
8. labels 必须包含“简历定制”和“项目深挖”，可补充“高频追问 / 深入理解 / 设计能力 / 必须掌握”
9. difficulty 只能是：basic、intermediate、advanced

只输出一个 JSON 对象，不要输出任何额外说明：
{
  "summary": "这个项目最容易被深挖的重点，80字以内",
  "questions": [
    {
      "chapterId": "ch9",
      "chapterName": "项目深挖 — 算法工程平台",
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

当前聚焦项目：
- 项目名称：${project.name || '未填写'}
- 担任角色：${project.role || '未填写'}
- 时间：${project.startDate || ''} ~ ${project.endDate || ''}

以下是项目与必要简历上下文：
${digest}`
}

export async function parseQuestionText(
  rawText: string,
  callbacks: ParseQuestionCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const fullText = await streamChatJson(
      buildParseQuestionPrompt(),
      `请解析以下题目内容：\n\n${rawText}`,
      callbacks.onChunk,
      signal,
    )
    const parsed = JSON.parse(extractJsonPayload(fullText)) as unknown
    const normalized = normalizeQuestionRecord(parsed)
    if (!normalized) {
      callbacks.onError('无法解析 AI 返回的数据，请重试')
      return
    }
    callbacks.onDone(normalized)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}

export async function generateResumeQuestions(
  resumeSnapshot: ResumeSnapshot,
  callbacks: GenerateResumeQuestionsCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const fullText = await streamChatJson(
      buildGenerateResumeQuestionsPrompt(resumeSnapshot),
      '请开始生成。',
      callbacks.onChunk,
      signal,
    )
    const parsed = JSON.parse(extractJsonPayload(fullText)) as Record<string, unknown>
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

    if (normalizedQuestions.length === 0) {
      callbacks.onError('没有生成可导入的题目，请重试')
      return
    }

    callbacks.onDone({
      summary: String(parsed.summary ?? '').trim() || `已基于当前简历生成 ${normalizedQuestions.length} 道题目`,
      questions: normalizedQuestions,
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}

export function parseProjectQuestionBatch(
  raw: string,
  projectName: string,
): GeneratedProjectQuestionBatch | null {
  const parsed = JSON.parse(extractJsonPayload(raw)) as Record<string, unknown>
  const questionList = Array.isArray(parsed.questions) ? parsed.questions : []
  const deduped = new Set<string>()
  const normalizedQuestions = questionList
    .map(normalizeQuestionRecord)
    .filter((item): item is GeneratedResumeQuestion => Boolean(item))
    .map((item) => ({
      ...item,
      labels: [...new Set(['简历定制', '项目深挖', ...item.labels])],
    }))
    .filter((item) => {
      const key = `${item.chapterId}::${item.title.trim().toLowerCase()}`
      if (deduped.has(key)) return false
      deduped.add(key)
      return true
    })

  if (normalizedQuestions.length === 0) return null

  return {
    summary: String(parsed.summary ?? '').trim() || `已围绕当前项目生成 ${normalizedQuestions.length} 道题目`,
    projectName: projectName.trim() || '当前项目',
    questions: normalizedQuestions,
  }
}

export async function generateProjectQuestions(
  resumeSnapshot: ResumeSnapshot,
  project: ProjectEntry,
  callbacks: GenerateProjectQuestionsCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const fullText = await streamChatJson(
      buildGenerateProjectQuestionsPrompt(resumeSnapshot, project),
      '请开始生成。',
      callbacks.onChunk,
      signal,
    )
    const normalized = parseProjectQuestionBatch(fullText, project.name)
    if (!normalized) {
      callbacks.onError('没有生成可导入的项目题目，请重试')
      return
    }
    callbacks.onDone(normalized)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}
