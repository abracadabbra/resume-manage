import type { AiConfig } from '@/stores/aiConfig'
import type { BasicInfo, EducationEntry, ProjectEntry, WorkEntry } from '@/stores/resume'
import { candidateModeSystemPrompt } from '@/services/prompts/interviewCandidatePrompt'
import { interviewerModeSystemPrompt } from '@/services/prompts/interviewInterviewerPrompt'

export type InterviewMode = 'candidate' | 'interviewer'

export type InterviewCommand = 'start' | 'continue' | 'finish'

export type InterviewPhase =
  | 'opening'
  | 'skills'
  | 'work'
  | 'projects'
  | 'scenario'
  | 'written'
  | 'summary'

export interface ResumeSnapshot {
  basicInfo: BasicInfo
  skillsText: string
  workList: WorkEntry[]
  projectList: ProjectEntry[]
  educationList: EducationEntry[]
  selfIntro?: string
}

export interface InterviewHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface FinalEvaluation {
  projectScore: number
  skillScore: number
  workScore: number
  educationScore: number
  totalScore: number
  passed: boolean
  summary: string
  improvements: string[]
}

export interface InterviewTurnScore {
  score: number
  comment: string
}

export interface InterviewTurnResponse {
  assistantReply: string
  phase: InterviewPhase
  nextAction: 'continue' | 'finish'
  turnScore: InterviewTurnScore | null
  finalEvaluation: FinalEvaluation | null
  memorySummary: string
}

export interface InterviewTurnRequest {
  config: AiConfig
  mode: InterviewMode
  command: InterviewCommand
  userInput?: string
  history: InterviewHistoryItem[]
  resumeSnapshot: ResumeSnapshot
  durationMinutes: number
  elapsedSeconds: number
  memorySummary?: string
}

export interface InterviewTurnStreamCallbacks {
  onAssistantReplyChunk?: (text: string) => void
}

function normalizeApiUrl(raw: string): string {
  let baseUrl = raw.trim().replace(/\/+$/, '')
  if (!baseUrl.includes('/v1/chat/completions')) {
    if (!baseUrl.endsWith('/v1')) baseUrl += '/v1'
    baseUrl += '/chat/completions'
  }
  return baseUrl
}

function toPlainText(htmlOrText: string): string {
  return htmlOrText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function compactList(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean)
}

function truncateText(content: string, maxLen: number): string {
  if (!content) return ''
  if (content.length <= maxLen) return content
  return `${content.slice(0, Math.max(0, maxLen - 1))}…`
}

function normalizeMemorySummaryText(content: string): string {
  return truncateText(content.replace(/\s+/g, ' ').trim(), 600)
}

function buildResumeDigest(snapshot: ResumeSnapshot, mode: 'full' | 'compact' = 'full'): string {
  const isCompact = mode === 'compact'
  const basicInfo = snapshot.basicInfo
  const basic: string[] = []
  if (basicInfo.name) basic.push(`姓名: ${basicInfo.name}`)
  if (basicInfo.jobTitle) basic.push(`目标岗位: ${basicInfo.jobTitle}`)
  if (basicInfo.workYears) basic.push(`工作年限: ${basicInfo.workYears}`)
  if (basicInfo.educationLevel) basic.push(`最高学历: ${basicInfo.educationLevel}`)
  if (basicInfo.currentCity) basic.push(`当前城市: ${basicInfo.currentCity}`)
  if (basicInfo.currentStatus) basic.push(`求职状态: ${basicInfo.currentStatus}`)

  const skills = compactList(
    toPlainText(snapshot.skillsText)
      .split(/\n|,|，|;|；/)
      .slice(0, isCompact ? 12 : 24)
  )

  const projectList = isCompact ? snapshot.projectList.slice(0, 2) : snapshot.projectList
  const workList = isCompact ? snapshot.workList.slice(0, 2) : snapshot.workList
  const educationList = isCompact ? snapshot.educationList.slice(0, 1) : snapshot.educationList

  const projects = projectList
    .map((project, idx) => {
      const lines: string[] = [`项目${idx + 1}: ${project.name || '未命名项目'}`]
      if (project.role) lines.push(`角色: ${project.role}`)
      if (project.startDate || project.endDate) {
        lines.push(`时间: ${project.startDate || ''} ~ ${project.endDate || ''}`)
      }
      if (project.introduction) lines.push(`项目目的: ${truncateText(toPlainText(project.introduction), isCompact ? 120 : 260)}`)
      if (project.mainWork) lines.push(`主要工作: ${truncateText(toPlainText(project.mainWork), isCompact ? 120 : 260)}`)
      return lines.join('\n')
    })
    .join('\n---\n')

  const works = workList
    .map((work, idx) => {
      const lines: string[] = [`工作${idx + 1}: ${work.company || '未填写公司'} / ${work.position || '未填写岗位'}`]
      if (work.department) lines.push(`部门: ${work.department}`)
      if (work.startDate || work.endDate) {
        lines.push(`时间: ${work.startDate || ''} ~ ${work.endDate || ''}`)
      }
      if (work.description) lines.push(`工作描述: ${truncateText(toPlainText(work.description), isCompact ? 120 : 240)}`)
      return lines.join('\n')
    })
    .join('\n---\n')

  const education = educationList
    .map((item, idx) => {
      const lines: string[] = [`教育${idx + 1}: ${item.school || '未填写学校'} / ${item.degree || '未填写学历'}`]
      if (item.major) lines.push(`专业: ${item.major}`)
      if (item.startDate || item.endDate) lines.push(`时间: ${item.startDate || ''} ~ ${item.endDate || ''}`)
      return lines.join('\n')
    })
    .join('\n---\n')

  return [
    '【基本信息】',
    basic.join('\n') || '未填写',
    '',
    '【技能点】',
    skills.length > 0 ? skills.join(' / ') : '未填写',
    '',
    '【项目经历】',
    projects || '未填写',
    '',
    '【工作经历】',
    works || '未填写',
    '',
    '【教育经历】',
    education || '未填写',
    snapshot.selfIntro ? `\n【自我介绍】\n${truncateText(toPlainText(snapshot.selfIntro), isCompact ? 120 : 240)}` : '',
  ]
    .join('\n')
    .trim()
}

function buildUserCommandPrompt(request: InterviewTurnRequest): string {
  const elapsedMin = Math.floor(request.elapsedSeconds / 60)
  const remainMin = Math.max(request.durationMinutes - elapsedMin, 0)
  const roleLabel =
    request.mode === 'candidate' ? '你是面试官，用户是候选人' : '你是候选人，用户是面试官'
  const digest = buildResumeDigest(request.resumeSnapshot, request.command === 'start' ? 'full' : 'compact')
  const memorySummary = normalizeMemorySummaryText(request.memorySummary || '')

  const commandLine =
    request.command === 'start'
      ? request.mode === 'candidate'
        ? '请开始本轮面试：先做简短开场，并明确邀请候选人先做1-2分钟自我介绍。本轮不要问任何技术问题。'
        : '请开始本轮模拟面试，先做简短开场并等待面试官提问。'
      : request.command === 'finish'
        ? '请结束面试，输出最终结论与综合评分。'
        : request.mode === 'candidate'
          ? `用户本轮输入：${request.userInput?.trim() || '（空）'}。请基于这次回答只提出1个下一问（或1个追问），不要一次问多个问题；技能阶段总量需控制在5-10题，若当前小点回答已逻辑合理则切换到下一个考点。`
          : `用户本轮输入：${request.userInput?.trim() || '（空）'}`

  return [
    `角色关系：${roleLabel}`,
    `本场目标时长：${request.durationMinutes}分钟，已进行约${elapsedMin}分钟，剩余约${remainMin}分钟。`,
    `当前命令：${request.command}`,
    commandLine,
    '',
    '会话记忆摘要（优先参考）：',
    memorySummary || '（暂无）',
    '',
    '简历快照如下：',
    digest,
    '',
    '注意：优先结合“会话记忆摘要 + 最近历史消息”推进，不要重复已问过的大段问题。',
    '只返回一个JSON对象。若需要继续提问，nextAction设为continue；若应结束，设为finish并填写finalEvaluation。',
  ].join('\n')
}

function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first >= 0 && last > first) return raw.slice(first, last + 1)
  return raw.trim()
}

function clampScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeFinalEvaluation(input: unknown): FinalEvaluation | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const improvements = Array.isArray(record.improvements)
    ? record.improvements.map((item) => String(item).trim()).filter(Boolean)
    : []

  return {
    projectScore: clampScore(record.projectScore),
    skillScore: clampScore(record.skillScore),
    workScore: clampScore(record.workScore),
    educationScore: clampScore(record.educationScore),
    totalScore: clampScore(record.totalScore),
    passed: Boolean(record.passed),
    summary: String(record.summary ?? '').trim(),
    improvements,
  }
}

function normalizeTurnResponse(rawContent: string): InterviewTurnResponse {
  const fallback: InterviewTurnResponse = {
    assistantReply: rawContent.trim() || '本轮回答为空，请重试。',
    phase: 'opening',
    nextAction: 'continue',
    turnScore: null,
    finalEvaluation: null,
    memorySummary: '',
  }

  try {
    const parsed = JSON.parse(extractJsonObject(rawContent)) as Record<string, unknown>
    const turnScoreRaw = parsed.turnScore as Record<string, unknown> | null | undefined
    const normalizedReply = dedupeMirroredContent(String(parsed.assistantReply ?? fallback.assistantReply).trim())
    return {
      assistantReply: normalizedReply,
      phase: (String(parsed.phase ?? 'opening') as InterviewPhase) || 'opening',
      nextAction: parsed.nextAction === 'finish' ? 'finish' : 'continue',
      turnScore:
        turnScoreRaw && typeof turnScoreRaw === 'object'
          ? {
              score: clampScore(turnScoreRaw.score),
              comment: String(turnScoreRaw.comment ?? '').trim(),
            }
          : null,
      finalEvaluation: normalizeFinalEvaluation(parsed.finalEvaluation),
      memorySummary: normalizeMemorySummaryText(String(parsed.memorySummary ?? '')),
    }
  } catch {
    const recoveredReply = dedupeMirroredContent(
      extractAssistantReplyFromPartialJson(rawContent) ??
        extractAssistantReplyFromPartialJson(extractJsonObject(rawContent)) ??
        fallback.assistantReply
    )
    return {
      ...fallback,
      assistantReply: recoveredReply,
    }
  }
}

function decodePartialJsonString(raw: string): string {
  let output = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch !== '\\') {
      output += ch
      continue
    }
    const next = raw[i + 1]
    if (!next) break
    if (next === 'n') {
      output += '\n'
      i += 1
      continue
    }
    if (next === 'r') {
      output += '\r'
      i += 1
      continue
    }
    if (next === 't') {
      output += '\t'
      i += 1
      continue
    }
    if (next === '"' || next === '\\' || next === '/') {
      output += next
      i += 1
      continue
    }
    if (next === 'u') {
      const hex = raw.slice(i + 2, i + 6)
      if (/^[\da-fA-F]{4}$/.test(hex)) {
        output += String.fromCharCode(Number.parseInt(hex, 16))
        i += 5
        continue
      }
      break
    }
    output += next
    i += 1
  }
  return output
}

function extractAssistantReplyFromPartialJson(raw: string): string | null {
  const keyToken = '"assistantReply"'
  const keyIndex = raw.indexOf(keyToken)
  if (keyIndex < 0) return null

  const colonIndex = raw.indexOf(':', keyIndex + keyToken.length)
  if (colonIndex < 0) return null

  let cursor = colonIndex + 1
  while (cursor < raw.length && /\s/.test(raw[cursor] || '')) cursor += 1
  if (raw[cursor] !== '"') return null
  cursor += 1

  let escaped = false
  let rawValue = ''
  for (; cursor < raw.length; cursor++) {
    const ch = raw[cursor]
    if (!escaped && ch === '"') {
      return decodePartialJsonString(rawValue)
    }
    if (!escaped && ch === '\\') {
      escaped = true
      rawValue += ch
      continue
    }
    escaped = false
    rawValue += ch
  }

  return decodePartialJsonString(rawValue)
}

function dedupeMirroredContent(content: string): string {
  const text = content.trim()
  if (!text) return text
  const compact = text.replace(/\s+/g, '')
  if (compact.length < 20) return text

  const midLeft = Math.floor(compact.length / 2)
  const midRight = Math.ceil(compact.length / 2)
  const candidates = [midLeft - 1, midLeft, midRight, midRight + 1]
  for (const mid of candidates) {
    if (mid <= 0 || mid >= compact.length) continue
    const left = compact.slice(0, mid)
    const right = compact.slice(mid)
    if (left && left === right) {
      const approxHalf = Math.floor(text.length / 2)
      const splitIndex = text.indexOf('\n', Math.max(0, approxHalf - 40))
      if (splitIndex > 0) return text.slice(0, splitIndex).trim()
      return text.slice(0, approxHalf).trim()
    }
  }

  const repeatedBlock = text.match(/^([\s\S]{20,})\s+\1$/)
  if (repeatedBlock?.[1]) return repeatedBlock[1].trim()
  return text
}

function mergeMessageSnapshot(
  fullContent: string,
  messageContent: string
): string {
  if (!fullContent) return messageContent
  if (messageContent === fullContent) return fullContent
  if (messageContent.startsWith(fullContent)) return messageContent
  if (messageContent.includes(fullContent)) return messageContent
  if (fullContent.startsWith(messageContent)) return fullContent
  if (fullContent.includes(messageContent)) return fullContent
  return `${fullContent}${messageContent}`
}

export async function requestInterviewTurn(
  request: InterviewTurnRequest,
  signal?: AbortSignal,
  callbacks?: InterviewTurnStreamCallbacks
): Promise<InterviewTurnResponse> {
  const endpoint = normalizeApiUrl(request.config.apiUrl)
  const systemPrompt =
    request.mode === 'candidate'
      ? candidateModeSystemPrompt()
      : interviewerModeSystemPrompt(request.resumeSnapshot.basicInfo.jobTitle?.trim() || '')
  const userCommandPrompt = buildUserCommandPrompt(request)

  const historyWindowSize = request.command === 'start' ? 4 : 8
  const historyMessages = request.history.slice(-historyWindowSize).map((item) => ({
    role: item.role,
    content: truncateText(item.content, 700),
  }))

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${request.config.apiToken}`,
    },
    body: JSON.stringify({
      model: request.config.modelName,
      temperature: 0.5,
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userCommandPrompt },
      ],
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`AI请求失败 (${response.status}): ${errorText || response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload.choices?.[0]?.message?.content?.trim() ?? ''
    const normalized = normalizeTurnResponse(content)
    callbacks?.onAssistantReplyChunk?.(normalized.assistantReply)
    return normalized
  }

  const decoder = new TextDecoder()
  let fullContent = ''
  let sseBuffer = ''
  let lastAssistantReply = ''
  let hasDeltaChunks = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    sseBuffer += decoder.decode(value, { stream: true })
    const lines = sseBuffer.split('\n')
    sseBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
        }
        const deltaContent = parsed.choices?.[0]?.delta?.content
        const messageContent = parsed.choices?.[0]?.message?.content
        let merged = fullContent
        if (typeof deltaContent === 'string' && deltaContent) {
          merged = fullContent + deltaContent
          hasDeltaChunks = true
        } else if (!hasDeltaChunks && typeof messageContent === 'string' && messageContent) {
          merged = mergeMessageSnapshot(fullContent, messageContent)
        }
        if (merged === fullContent) continue
        fullContent = merged
        const partialReply = extractAssistantReplyFromPartialJson(fullContent)
        if (partialReply !== null && partialReply !== lastAssistantReply) {
          lastAssistantReply = partialReply
          callbacks?.onAssistantReplyChunk?.(partialReply)
        }
      } catch {
        // Ignore malformed chunks from providers.
      }
    }
  }

  const tail = sseBuffer.trim()
  if (tail.startsWith('data:')) {
    const data = tail.slice(5).trim()
    if (data && data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
        }
        const deltaContent = parsed.choices?.[0]?.delta?.content
        const messageContent = parsed.choices?.[0]?.message?.content
        if (typeof deltaContent === 'string' && deltaContent) {
          fullContent += deltaContent
        } else if (!hasDeltaChunks && typeof messageContent === 'string' && messageContent) {
          fullContent = mergeMessageSnapshot(fullContent, messageContent)
        }
      } catch {
        // Ignore malformed tail chunk.
      }
    }
  }

  const normalized = normalizeTurnResponse(fullContent)
  callbacks?.onAssistantReplyChunk?.(normalized.assistantReply)
  return normalized
}

