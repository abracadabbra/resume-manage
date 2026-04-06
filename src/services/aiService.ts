import type {
  AwardEntry,
  BasicInfo,
  EducationEntry,
  ProjectEntry,
  WorkEntry,
} from '@/stores/resume'
import { getModuleOutputRules, SYSTEM_PROMPT } from './prompts'

function formatBasicInfo(info: BasicInfo): string {
  const lines: string[] = []
  if (info.name) lines.push(`姓名：${info.name}`)
  if (info.phone) lines.push(`电话：${info.phone}`)
  if (info.email) lines.push(`邮箱：${info.email}`)
  if (info.jobTitle) lines.push(`求职岗位：${info.jobTitle}`)
  if (info.age) lines.push(`年龄：${info.age}`)
  if (info.gender) lines.push(`性别：${info.gender}`)
  if (info.educationLevel) lines.push(`学历：${info.educationLevel}`)
  if (info.workYears) lines.push(`工作年限：${info.workYears}`)
  if (info.currentStatus) lines.push(`当前状态：${info.currentStatus}`)
  if (info.location) lines.push(`所在地：${info.location}`)
  if (info.expectedLocation) lines.push(`期望工作地：${info.expectedLocation}`)
  if (info.expectedSalary) lines.push(`期望薪资：${info.expectedSalary}`)
  if (info.website) lines.push(`个人网站：${info.website}`)
  if (info.github) lines.push(`GitHub：${info.github}`)
  if (info.blog) lines.push(`博客：${info.blog}`)
  return lines.join('\n')
}

function stripHtml(html: string): string {
  return html
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

function formatEducation(list: EducationEntry[]): string {
  return list
    .map((e) => {
      const parts: string[] = []
      if (e.school) parts.push(`学校：${e.school}`)
      if (e.college) parts.push(`学院：${e.college}`)
      if (e.major) parts.push(`专业：${e.major}`)
      if (e.degree) parts.push(`学位：${e.degree}`)
      if (e.startDate || e.endDate) parts.push(`时间：${e.startDate || ''} ~ ${e.endDate || ''}`)
      if (e.gpa) parts.push(`GPA：${e.gpa}`)
      if (e.description) parts.push(`描述：${stripHtml(e.description)}`)
      return parts.join('\n')
    })
    .join('\n---\n')
}

function formatWork(list: WorkEntry[]): string {
  return list
    .map((w) => {
      const parts: string[] = []
      if (w.company) parts.push(`公司：${w.company}`)
      if (w.department) parts.push(`部门：${w.department}`)
      if (w.position) parts.push(`职位：${w.position}`)
      if (w.startDate || w.endDate) parts.push(`时间：${w.startDate || ''} ~ ${w.endDate || ''}`)
      if (w.description) parts.push(`工作描述：${stripHtml(w.description)}`)
      return parts.join('\n')
    })
    .join('\n---\n')
}

function formatProjects(list: ProjectEntry[]): string {
  return list
    .map((p) => {
      const parts: string[] = []
      if (p.name) parts.push(`项目名称：${p.name}`)
      if (p.role) parts.push(`角色：${p.role}`)
      if (p.startDate || p.endDate) parts.push(`时间：${p.startDate || ''} ~ ${p.endDate || ''}`)
      if (p.link) parts.push(`链接：${p.link}`)
      if (p.introduction) parts.push(`项目介绍：${stripHtml(p.introduction)}`)
      if (p.mainWork) parts.push(`主要工作：${stripHtml(p.mainWork)}`)
      return parts.join('\n')
    })
    .join('\n---\n')
}

function formatAwards(list: AwardEntry[]): string {
  return list
    .map((a) => {
      const parts: string[] = []
      if (a.name) parts.push(`奖项名称：${a.name}`)
      if (a.date) parts.push(`获奖时间：${a.date}`)
      if (a.description) parts.push(`描述：${stripHtml(a.description)}`)
      return parts.join('\n')
    })
    .join('\n---\n')
}

const MODULE_LABELS: Record<string, string> = {
  basicInfo: '基本信息',
  education: '教育经历',
  skills: '专业技能',
  workExperience: '工作经历',
  projectExperience: '项目经历',
  awards: '荣誉奖项',
  selfIntro: '个人简介',
}

export interface ModuleData {
  basicInfo: BasicInfo
  educationList: EducationEntry[]
  skills: string
  workList: WorkEntry[]
  projectList: ProjectEntry[]
  awardList: AwardEntry[]
  selfIntro: string
}

export function buildModuleText(moduleKey: string, data: ModuleData): string {
  switch (moduleKey) {
    case 'basicInfo':
      return formatBasicInfo(data.basicInfo)
    case 'education':
      return formatEducation(data.educationList)
    case 'skills':
      return stripHtml(data.skills)
    case 'workExperience':
      return formatWork(data.workList)
    case 'projectExperience':
      return formatProjects(data.projectList)
    case 'awards':
      return formatAwards(data.awardList)
    case 'selfIntro':
      return stripHtml(data.selfIntro)
    default:
      return ''
  }
}

export function getModuleLabel(moduleKey: string): string {
  return MODULE_LABELS[moduleKey] ?? moduleKey
}


export interface AiStreamCallbacks {
  onChunk: (text: string) => void
  onDone: (fullText: string) => void
  onError: (error: string) => void
}

export async function optimizeModule(
  config: { apiUrl: string; apiToken: string; modelName: string },
  moduleKey: string,
  moduleData: ModuleData,
  callbacks: AiStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const moduleText = buildModuleText(moduleKey, moduleData)
  const label = getModuleLabel(moduleKey)

  if (!moduleText.trim()) {
    callbacks.onError(`「${label}」模块内容为空，请先填写内容后再优化。`)
    return
  }

  const outputRules = getModuleOutputRules(moduleKey, {
    projectNames: moduleData.projectList.map((p) => p.name.trim()).filter(Boolean),
    workCompanyNames: moduleData.workList.map((w) => w.company.trim()).filter(Boolean),
  })
  const userMessage = `请优化我简历中的「${label}」模块。

以下是当前内容：
${moduleText}

请严格遵守以下输出要求：
${outputRules}`

  let baseUrl = config.apiUrl.trim().replace(/\/+$/, '')
  if (!baseUrl.includes('/v1/chat/completions')) {
    if (!baseUrl.endsWith('/v1')) {
      baseUrl += '/v1'
    }
    baseUrl += '/chat/completions'
  }

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiToken}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        stream: true,
      }),
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      callbacks.onError(`API 请求失败 (${response.status}): ${errorText || response.statusText}`)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError('无法读取 API 响应流')
      return
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
          if (content) {
            fullText += content
            callbacks.onChunk(fullText)
          }
        } catch {
          // Ignore malformed streaming chunks.
        }
      }
    }

    callbacks.onDone(fullText)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}

export interface ParsedAiResponse {
  suggestions: string
  optimizedContent: string
}

type ParsedSectionKey = 'suggestions' | 'optimizedContent'

function normalizeSectionLabel(rawLabel: string): ParsedSectionKey | null {
  const normalized = rawLabel
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')

  if (normalized === '优化建议' || normalized === 'suggestion' || normalized === 'suggestions') {
    return 'suggestions'
  }
  if (
    normalized === '优化后内容'
    || normalized === '优化后的内容'
    || normalized === 'optimizedcontent'
  ) {
    return 'optimizedContent'
  }
  return null
}

function parseSectionHeadingLine(line: string): { key: ParsedSectionKey; inlineContent: string } | null {
  const match = line.match(
    /^(?:#{1,6}\s*)?(?:\*\*)?\s*(优化建议|Suggestions?|优化后内容|优化后的内容|Optimized Content)\s*(?:\*\*)?\s*(?:[：:]\s*(.*))?$/i,
  )
  if (!match) return null
  const key = normalizeSectionLabel(match[1] ?? '')
  if (!key) return null
  return {
    key,
    inlineContent: (match[2] ?? '').trim(),
  }
}

export function parseAiResponse(text: string): ParsedAiResponse {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return { suggestions: '', optimizedContent: '' }
  }

  const lines = normalized.split('\n')
  const sections: Record<ParsedSectionKey, string[]> = {
    suggestions: [],
    optimizedContent: [],
  }

  let currentSection: ParsedSectionKey | null = null

  for (const line of lines) {
    const heading = parseSectionHeadingLine(line.trim())
    if (heading) {
      currentSection = heading.key
      if (heading.inlineContent) {
        sections[currentSection].push(heading.inlineContent)
      }
      continue
    }

    if (currentSection) {
      sections[currentSection].push(line)
    }
  }

  const suggestions = sections.suggestions.join('\n').trim()
  const optimizedContent = sections.optimizedContent.join('\n').trim()

  if (!suggestions && !optimizedContent) {
    return {
      suggestions: '',
      optimizedContent: normalized,
    }
  }

  return {
    suggestions,
    optimizedContent,
  }
}

