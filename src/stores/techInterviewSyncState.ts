/**
 * 大厂面经云同步状态：lastSyncedAt + pendingPush 队列 + 失败计数
 * 持久化在 localStorage，schemaVersion 1
 */
import { ref, watch, type Ref } from 'vue'
import { loadJson, saveJson } from '@/services/safeStorage'

export type ConflictKind = 'practice' | 'conversation'

export interface PracticeConflictPayload {
  mastery: 'unpracticed' | 'practicing' | 'mastered' | 'weak'
  answer: string
  notes: string
  updated_at: number
}

export interface ConversationConflictPayload {
  conversations: unknown[]
  updated_at: number
}

export interface ConflictEntry {
  kind: ConflictKind
  local: PracticeConflictPayload | ConversationConflictPayload
  cloud: PracticeConflictPayload | ConversationConflictPayload
}

export type ConflictMap = Record<string /* question_id */, ConflictEntry>

export interface TechInterviewSyncState {
  schemaVersion: 1
  /** 最后一次成功同步的墙钟时间戳（ms） */
  lastSyncedAt: number | null
  /** pendingPush 队列（断网/失败重试） */
  pendingPush: {
    practice: string[]
    conversations: string[]
  }
  /** 同一 question_id 连续失败次数 */
  failedAttempts: Record<string, number>
  /** 启用云同步开关（用户拒绝时置 false） */
  enabled: boolean
}

const STORAGE_KEY = 'tech-interview-sync-state.json'
const SCHEMA_VERSION = 1
const MAX_FAILED_ATTEMPTS = 3

const DEFAULT_STATE: TechInterviewSyncState = {
  schemaVersion: SCHEMA_VERSION,
  lastSyncedAt: null,
  pendingPush: { practice: [], conversations: [] },
  failedAttempts: {},
  enabled: false,
}

function normalizeState(input: unknown): TechInterviewSyncState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...DEFAULT_STATE }
  }
  const r = input as Partial<TechInterviewSyncState>
  return {
    schemaVersion: SCHEMA_VERSION,
    lastSyncedAt: typeof r.lastSyncedAt === 'number' ? r.lastSyncedAt : null,
    pendingPush: {
      practice: Array.isArray(r.pendingPush?.practice) ? r.pendingPush!.practice.filter((x): x is string => typeof x === 'string') : [],
      conversations: Array.isArray(r.pendingPush?.conversations) ? r.pendingPush!.conversations.filter((x): x is string => typeof x === 'string') : [],
    },
    failedAttempts: r.failedAttempts && typeof r.failedAttempts === 'object' && !Array.isArray(r.failedAttempts)
      ? Object.fromEntries(Object.entries(r.failedAttempts).filter(([, v]) => typeof v === 'number')) as Record<string, number>
      : {},
    enabled: r.enabled === true,
  }
}

let singleton: ReturnType<typeof create> | null = null

function create() {
  const state = ref<TechInterviewSyncState>(
    normalizeState(loadJson<unknown>(localStorage, STORAGE_KEY, DEFAULT_STATE).value),
  )

  watch(
    state,
    (v) => saveJson(localStorage, STORAGE_KEY, v),
    { deep: true },
  )

  function enable() {
    state.value = { ...state.value, enabled: true }
  }

  function disable() {
    state.value = { ...state.value, enabled: false }
  }

  function setLastSyncedAt(ts: number) {
    state.value = { ...state.value, lastSyncedAt: ts }
  }

  function schedulePush(qid: string, kind: ConflictKind) {
    const arr = kind === 'practice' ? state.value.pendingPush.practice : state.value.pendingPush.conversations
    if (arr.includes(qid)) return
    state.value = {
      ...state.value,
      pendingPush: {
        ...state.value.pendingPush,
        [kind === 'practice' ? 'practice' : 'conversations']: [...arr, qid],
      },
    }
  }

  function unschedulePush(qid: string, kind: ConflictKind) {
    const key = kind === 'practice' ? 'practice' : 'conversations'
    const arr = state.value.pendingPush[key]
    if (!arr.includes(qid)) return
    state.value = {
      ...state.value,
      pendingPush: {
        ...state.value.pendingPush,
        [key]: arr.filter((x) => x !== qid),
      },
    }
  }

  function recordFailed(qids: string[]) {
    if (qids.length === 0) return
    const next = { ...state.value.failedAttempts }
    for (const id of qids) {
      next[id] = (next[id] ?? 0) + 1
    }
    state.value = { ...state.value, failedAttempts: next }
  }

  function recordSuccess(qids: string[]) {
    if (qids.length === 0) return
    const next = { ...state.value.failedAttempts }
    for (const id of qids) delete next[id]
    state.value = { ...state.value, failedAttempts: next }
  }

  function shouldGiveUp(qid: string): boolean {
    return (state.value.failedAttempts[qid] ?? 0) >= MAX_FAILED_ATTEMPTS
  }

  return {
    state: state as Ref<TechInterviewSyncState>,
    enable,
    disable,
    setLastSyncedAt,
    schedulePush,
    unschedulePush,
    recordFailed,
    recordSuccess,
    shouldGiveUp,
  }
}

export function useTechInterviewSyncState() {
  if (!singleton) singleton = create()
  return singleton
}