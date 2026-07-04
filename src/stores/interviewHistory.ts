import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadJson, saveJson, type JsonStorage } from '@/services/safeStorage'
import { useDebouncedAutoSave } from '@/stores/useDebouncedAutoSave'
import type { InterviewMode, FinalEvaluation } from '@/services/interviewService'
import type { ChatMessage } from '@/components/ai/interview/types'

// ── 类型定义 ──

export interface InterviewSessionRecord {
  id: string
  mode: InterviewMode
  startedAt: number
  finishedAt: number
  durationMinutes: number
  finalEvaluation: FinalEvaluation | null
  messages: ChatMessage[]
  improvements: string[]
  weakPoints: string[]
}

interface InterviewSessionsPayload {
  schemaVersion: number
  sessions: InterviewSessionRecord[]
}

export interface PreviousSessionDigest {
  improvements: string[]
  lowScoreDimensions: string[]
  weakTopics: string[]
  lastMode: InterviewMode
  lastFinishedAt: number
  lastTotalScore: number
}

// ── 常量 ──

export const INTERVIEW_SESSIONS_SCHEMA_VERSION = 1
const STORAGE_KEY = 'interview-sessions'
const MAX_SESSIONS = 50
const AUTO_SAVE_DELAY_MS = 500

// ── 辅助函数 ──

function now(): number {
  return Date.now()
}

function generateId(): string {
  return `is_${now()}_${Math.random().toString(36).slice(2, 8)}`
}

function extractWeakPoints(evaluation: FinalEvaluation | null, messages: ChatMessage[]): string[] {
  const points: string[] = []
  if (evaluation) {
    const dims = [
      { name: '项目经历', score: evaluation.projectScore },
      { name: '专业技能', score: evaluation.skillScore },
      { name: '工作经历', score: evaluation.workScore },
      { name: '教育经历', score: evaluation.educationScore },
    ]
    for (const dim of dims) {
      if (dim.score < 60) {
        points.push(`${dim.name}得分偏低(${dim.score}分)`)
      }
    }
  }

  // 从 assistant messages 中提取被标记为低分的回答
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.score !== null && msg.score.score < 60) {
      if (msg.score.comment) {
        points.push(msg.score.comment)
      }
    }
  }

  return points
}

// ── Store ──

export const useInterviewHistoryStore = defineStore('interviewHistory', () => {
  // ── 从 localStorage 加载 ──
  const raw = loadJson<InterviewSessionsPayload>(localStorage as JsonStorage, STORAGE_KEY, {
    schemaVersion: INTERVIEW_SESSIONS_SCHEMA_VERSION,
    sessions: [],
  }).value

  const sessions = ref<InterviewSessionRecord[]>(raw.sessions || [])

  // 迁移校验
  if (!raw.schemaVersion || raw.schemaVersion < INTERVIEW_SESSIONS_SCHEMA_VERSION) {
    saveJson(localStorage as JsonStorage, STORAGE_KEY, {
      schemaVersion: INTERVIEW_SESSIONS_SCHEMA_VERSION,
      sessions: sessions.value,
    })
  }

  // ── 派生 ──

  const sortedSessions = computed(() =>
    [...sessions.value].sort((a, b) => b.finishedAt - a.finishedAt),
  )

  const latestSession = computed(() =>
    sortedSessions.value.length > 0 ? sortedSessions.value[0] : null,
  )

  // ── 防抖自动保存 ──

  useDebouncedAutoSave<InterviewSessionRecord[]>({
    delayMs: AUTO_SAVE_DELAY_MS,
    getSnapshot: () => sessions.value,
    onScheduled: () => {},
    onSave: () => {
      saveJson(localStorage as JsonStorage, STORAGE_KEY, {
        schemaVersion: INTERVIEW_SESSIONS_SCHEMA_VERSION,
        sessions: sessions.value,
      })
    },
  })

  // ── 方法 ──

  function saveSession(params: {
    mode: InterviewMode
    startedAt: number
    durationMinutes: number
    finalEvaluation: FinalEvaluation | null
    messages: ChatMessage[]
  }): InterviewSessionRecord {
    const record: InterviewSessionRecord = {
      id: generateId(),
      mode: params.mode,
      startedAt: params.startedAt,
      finishedAt: now(),
      durationMinutes: params.durationMinutes,
      finalEvaluation: params.finalEvaluation,
      messages: params.messages,
      improvements: params.finalEvaluation?.improvements ?? [],
      weakPoints: extractWeakPoints(params.finalEvaluation, params.messages),
    }

    sessions.value.unshift(record)

    // 限制最大条数
    if (sessions.value.length > MAX_SESSIONS) {
      sessions.value = sessions.value.slice(0, MAX_SESSIONS)
    }

    return record
  }

  function deleteSession(id: string): boolean {
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx === -1) return false
    sessions.value.splice(idx, 1)
    return true
  }

  function getSessionById(id: string): InterviewSessionRecord | undefined {
    return sessions.value.find((s) => s.id === id)
  }

  function getPreviousSessionDigest(currentMode: InterviewMode): PreviousSessionDigest | null {
    const prev = latestSession.value
    if (!prev || !prev.finalEvaluation) return null

    const lowScoreDimensions: string[] = []
    const dims: [string, number][] = [
      ['项目经历', prev.finalEvaluation.projectScore],
      ['专业技能', prev.finalEvaluation.skillScore],
      ['工作经历', prev.finalEvaluation.workScore],
      ['教育经历', prev.finalEvaluation.educationScore],
    ]
    for (const [name, score] of dims) {
      if (score < 60) lowScoreDimensions.push(`${name}(${score}分)`)
    }

    return {
      improvements: prev.improvements,
      lowScoreDimensions,
      weakTopics: prev.weakPoints,
      lastMode: prev.mode,
      lastFinishedAt: prev.finishedAt,
      lastTotalScore: prev.finalEvaluation.totalScore,
    }
  }

  function getScoreTimeline(filterMode?: InterviewMode): Array<{
    id: string
    finishedAt: number
    projectScore: number
    skillScore: number
    workScore: number
    educationScore: number
    improvements: string[]
  }> {
    const source = filterMode
      ? sessions.value.filter((s) => s.mode === filterMode)
      : sessions.value
    return source
      .filter((s) => s.finalEvaluation !== null)
      .map((s) => ({
        id: s.id,
        finishedAt: s.finishedAt,
        projectScore: s.finalEvaluation!.projectScore,
        skillScore: s.finalEvaluation!.skillScore,
        workScore: s.finalEvaluation!.workScore,
        educationScore: s.finalEvaluation!.educationScore,
        improvements: s.improvements,
      }))
      .sort((a, b) => a.finishedAt - b.finishedAt)
  }

  function exportSessionMarkdown(session: InterviewSessionRecord): string {
    const modeLabel = session.mode === 'candidate' ? '你扮演候选人' : '你扮演面试官'
    const lines: string[] = [
      `# 面试记录`,
      '',
      `- **模式**：${modeLabel}`,
      `- **开始时间**：${new Date(session.startedAt).toLocaleString('zh-CN')}`,
      `- **结束时间**：${new Date(session.finishedAt).toLocaleString('zh-CN')}`,
      `- **用时**：约 ${session.durationMinutes} 分钟`,
    ]

    if (session.finalEvaluation) {
      const ev = session.finalEvaluation
      lines.push(
        '',
        `## 最终评分`,
        '',
        `| 维度 | 分数 |`,
        `|------|------|`,
        `| 项目经历 | ${ev.projectScore} |`,
        `| 专业技能 | ${ev.skillScore} |`,
        `| 工作经历 | ${ev.workScore} |`,
        `| 教育经历 | ${ev.educationScore} |`,
        `| **综合** | **${ev.totalScore}** |`,
        '',
        `**${ev.passed ? '✅ 通过' : '❌ 未通过'}**`,
        '',
        `> ${ev.summary}`,
        '',
        '## 改进建议',
        '',
      )
      ev.improvements.forEach((item) => lines.push(`- ${item}`))
    }

    lines.push('', '## 问答记录', '')

    session.messages.forEach((msg, idx) => {
      const role = msg.role === 'user' ? '你' : (session.mode === 'candidate' ? 'AI 面试官' : 'AI 候选人')
      lines.push(`### ${idx + 1}. ${role}`)
      lines.push('', msg.content, '')
      if (msg.score) {
        lines.push(`> 本轮评分：${msg.score.score} — ${msg.score.comment}`, '')
      }
    })

    return lines.join('\n')
  }

  return {
    sessions,
    sortedSessions,
    latestSession,
    saveSession,
    deleteSession,
    getSessionById,
    getPreviousSessionDigest,
    getScoreTimeline,
    exportSessionMarkdown,
  }
})
