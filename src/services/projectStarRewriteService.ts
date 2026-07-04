import { extractJsonPayload, streamChatJson } from '@/services/questionParseService'
import { stripHtml } from '@/services/htmlUtils'
import type { ProjectEntry } from '@/stores/resume'

export interface ProjectStarRewriteInput {
  project: ProjectEntry
}

export interface ProjectStarRewriteResult {
  introduction: string
  mainWork: string
  summary: string
}

export interface ProjectStarRewriteCallbacks {
  onChunk: (text: string) => void
  onDone: (result: ProjectStarRewriteResult) => void
  onError: (error: string) => void
}

function buildStarRewritePrompt(project: ProjectEntry): string {
  const projectName = project.name.trim() || '（未命名项目）'
  const projectRole = project.role.trim() || '（未指定角色）'
  const introPlain = stripHtml(project.introduction).trim()
  const mainWorkPlain = stripHtml(project.mainWork).trim()

  return `你是一名资深技术简历顾问。请把候选人的"项目经历"按 STAR 结构重写，强化量化数据和成果表达。

STAR 含义：
- Situation（情境）：项目背景、业务场景、技术栈
- Task（任务）：候选人负责的核心任务和目标
- Action（行动）：具体做了什么、用了什么技术/方案、怎么解决问题
- Result（结果）：可量化的成果（性能指标、业务数据、稳定性提升等）

要求：
1. 必须严格基于候选人已有内容重写，不要虚构没有的经历、技术栈或数据。
2. 如果原内容中已经有量化数据，必须保留并强化；如果没有量化数据，不要凭空捏造数字，可以用"提升了 X"、"降低了 Y"等占位提示候选人补充。
3. 重写后的"主要工作"应该是 3-5 条列表项，每条按"动作 + 技术细节 + 量化结果"的结构，适合简历直接使用。
4. 重写后的"项目介绍"应该是 1-2 句话，说明项目背景和技术栈。
5. 输出格式必须是 HTML 片段（适合直接渲染到富文本编辑器）：
   - 列表用 <ul><li>...</li></ul>
   - 关键技术词、量化数据用 <strong>...</strong> 加粗
   - 不要输出 <html>/<body>/<div> 等容器标签
6. summary 字段给出 50 字以内的重写说明，说明主要改进了什么。

只输出一个 JSON 对象，不要输出任何额外说明：
{
  "introduction": "<p>项目介绍 HTML 片段</p>",
  "mainWork": "<ul><li><strong>动作</strong>：技术细节，<strong>量化结果</strong></li></ul>",
  "summary": "重写说明，50字以内"
}

项目名称：${projectName}
担任角色：${projectRole}
项目时间：${project.startDate || '未填写'} ~ ${project.endDate || '至今'}
项目链接：${project.link || '无'}

原始项目介绍：
${introPlain || '（空）'}

原始主要工作：
${mainWorkPlain || '（空）'}`
}

function sanitizeHtmlFragment(html: string): string {
  // 移除可能包裹的代码块标记
  let cleaned = html.trim()
  cleaned = cleaned.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '')
  // 移除容器标签，只保留片段内容
  cleaned = cleaned.replace(/^<html[^>]*>|<\/html>$/gi, '')
  cleaned = cleaned.replace(/^<body[^>]*>|<\/body>$/gi, '')
  return cleaned.trim()
}

export function parseProjectStarRewriteResult(raw: string): ProjectStarRewriteResult | null {
  try {
    const parsed = JSON.parse(extractJsonPayload(raw)) as Record<string, unknown>
    const introduction = String(parsed.introduction ?? '').trim()
    const mainWork = String(parsed.mainWork ?? '').trim()
    const summary = String(parsed.summary ?? '').trim()

    if (!introduction && !mainWork) return null

    return {
      introduction: sanitizeHtmlFragment(introduction),
      mainWork: sanitizeHtmlFragment(mainWork),
      summary: summary || '已按 STAR 结构重写',
    }
  } catch {
    return null
  }
}

export async function rewriteProjectByStar(
  input: ProjectStarRewriteInput,
  callbacks: ProjectStarRewriteCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const fullText = await streamChatJson(
      '你是一个只输出 JSON 的项目经历 STAR 化重写助手。',
      buildStarRewritePrompt(input.project),
      callbacks.onChunk,
      signal,
    )
    const normalized = parseProjectStarRewriteResult(fullText)
    if (!normalized) {
      callbacks.onError('没有生成可用的重写结果，请重试。')
      return
    }
    callbacks.onDone(normalized)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}
