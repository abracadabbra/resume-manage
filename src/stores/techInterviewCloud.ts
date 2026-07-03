/**
 * 大厂面经云同步 manager
 *
 * 职责：
 *  - pull 阶段：拉公共表元数据 + 私有表元数据，行级 LWW，冲突入 ConflictMap
 *  - push 阶段：批量 upsert 私有表 pendingPush，失败入重试队列
 *  - 懒加载：题目详情按需拉
 *  - 协调：本地存储注入器（从 store 抽离）+ 多 tab BroadcastChannel + online 事件
 */
import { ref, type Ref } from 'vue'
import * as api from '@/services/techInterviewSupabaseApi'
import { useTechInterviewSyncState, type ConflictMap, type ConflictKind } from './techInterviewSyncState'

export type CloudSyncStatus =
  | { kind: 'idle' }
  | { kind: 'pulling' }
  | { kind: 'pushing'; queueSize: number }
  | { kind: 'ok'; lastSyncedAt: number }
  | { kind: 'partial'; lastSyncedAt: number; failedCount: number }
  | { kind: 'offline'; lastSyncedAt: number | null }
  | { kind: 'error'; message: string }

export type PracticeSnapshot = {
  mastery: 'unpracticed' | 'practicing' | 'mastered' | 'weak'
  answer: string
  notes: string
  updatedAt: number | null
}

export type ConversationSnapshot = {
  conversations: unknown[]
  updatedAt: number | null
}

/** store 注入器：从 techInterviewQuestions store 解耦读取/写入 */
export interface CloudStoreAdapter {
  userId: () => string | null
  getPractice: (qid: string) => PracticeSnapshot | null
  setPractice: (qid: string, snap: PracticeSnapshot) => void
  getConversation: (qid: string) => ConversationSnapshot | null
  setConversation: (qid: string, snap: ConversationSnapshot) => void
  /** 设置 AI 公共答案（pull 阶段写入） */
  setAiAnswer: (qid: string, answer: string | null, updatedAt: number) => void
}

let singleton: ReturnType<typeof create> | null = null

function create(adapter: CloudStoreAdapter) {
  const sync = useTechInterviewSyncState()
  const status: Ref<CloudSyncStatus> = ref({ kind: 'idle' })
  const conflicts: Ref<ConflictMap> = ref({})
  const running = ref(false)
  const pulling = ref(false)
  const pushing = ref(false)
  const online = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)

  // ---------- helpers ----------

  function setStatus(s: CloudSyncStatus) {
    status.value = s
  }

  function snapshotOf<T>(arr: T[]): { latest: number } {
    let latest = 0
    for (const r of arr) {
      const rAny = r as unknown as { updated_at?: string | number }
      const t = rAny.updated_at ? new Date(rAny.updated_at as string).getTime() : 0
      if (t > latest) latest = t
    }
    return { latest }
  }

  function isOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  }

  // ---------- pull ----------

  async function pull() {
    if (pulling.value) return
    if (isOffline()) {
      setStatus({ kind: 'offline', lastSyncedAt: sync.state.value.lastSyncedAt })
      return
    }
    if (!sync.state.value.enabled) return
    if (!adapter.userId()) return

    pulling.value = true
    setStatus({ kind: 'pulling' })
    try {
      const [qMeta, aiMeta, pMeta, cMeta] = await Promise.all([
        api.fetchQuestionsMeta(),
        api.fetchAiAnswersMeta(),
        api.fetchPracticeMeta(adapter.userId()!),
        api.fetchConversationsMeta(adapter.userId()!),
      ])

      // 1) AI 答案元数据 → store（公共来源）
      for (const m of aiMeta) {
        const t = new Date(m.updated_at).getTime()
        adapter.setAiAnswer(m.question_id, null, t)
      }

      // 2) practice 行级合并 + 冲突
      const newConflicts: ConflictMap = { ...conflicts.value }
      const isFirstSync = sync.state.value.lastSyncedAt === null
      for (const m of pMeta) {
        const cloudTs = new Date(m.updated_at).getTime()
        const local = adapter.getPractice(m.question_id)
        const lastSyncedAt = sync.state.value.lastSyncedAt ?? 0
        if (!local || !local.updatedAt) {
          // 详情懒加载：先建本地空记录，详情按需 fetchPracticeDetail
          adapter.setPractice(m.question_id, {
            mastery: m.mastery,
            answer: '',
            notes: '',
            updatedAt: cloudTs,
          })
        } else if (local.updatedAt >= cloudTs) {
          // 本地新 → 保留
        } else {
          // 云端新 → 覆盖 mastery（answer/notes 懒加载）
          adapter.setPractice(m.question_id, { ...local, mastery: m.mastery, updatedAt: cloudTs })
        }
        // 首次同步不报冲突（两边都有数据是正常首次合并，不是"同时修改"）
        if (!isFirstSync && local && local.updatedAt && local.updatedAt > lastSyncedAt && cloudTs > lastSyncedAt) {
          newConflicts[m.question_id] = {
            kind: 'practice',
            local: { mastery: local.mastery, answer: local.answer, notes: local.notes, updated_at: local.updatedAt },
            cloud: { mastery: m.mastery, answer: '', notes: '', updated_at: cloudTs },
          }
        }
      }

      // 3) conversations 行级合并 + 冲突
      for (const m of cMeta) {
        const cloudTs = new Date(m.updated_at).getTime()
        const local = adapter.getConversation(m.question_id)
        const lastSyncedAt = sync.state.value.lastSyncedAt ?? 0
        if (!local || !local.updatedAt) {
          adapter.setConversation(m.question_id, { conversations: [], updatedAt: cloudTs })
        } else if (local.updatedAt >= cloudTs) {
          // 保留
        } else {
          adapter.setConversation(m.question_id, { conversations: [], updatedAt: cloudTs })
        }
        // 首次同步不报冲突
        if (!isFirstSync && local && local.updatedAt && local.updatedAt > lastSyncedAt && cloudTs > lastSyncedAt) {
          newConflicts[m.question_id] = {
            kind: 'conversation',
            local: { conversations: local.conversations, updated_at: local.updatedAt },
            cloud: { conversations: [], updated_at: cloudTs },
          }
        }
      }

      conflicts.value = newConflicts

      // 更新 lastSyncedAt = max(qMeta, aiMeta, pMeta, cMeta)
      const candidates = [...qMeta, ...aiMeta, ...pMeta, ...cMeta]
      const { latest } = snapshotOf(candidates)
      if (latest > 0) sync.setLastSyncedAt(latest)
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'pull 失败' })
    } finally {
      pulling.value = false
    }
  }

  // ---------- push ----------

  async function push(): Promise<void> {
    if (pushing.value) return
    if (isOffline()) {
      setStatus({ kind: 'offline', lastSyncedAt: sync.state.value.lastSyncedAt })
      return
    }
    if (!sync.state.value.enabled) return
    const userId = adapter.userId()
    if (!userId) return

    const practiceIds = [...sync.state.value.pendingPush.practice]
    const conversationIds = [...sync.state.value.pendingPush.conversations]

    if (practiceIds.length === 0 && conversationIds.length === 0) {
      setStatus({ kind: 'ok', lastSyncedAt: sync.state.value.lastSyncedAt ?? Date.now() })
      return
    }

    pushing.value = true
    setStatus({ kind: 'pushing', queueSize: practiceIds.length + conversationIds.length })

    try {

    // 过滤：冲突中的行不自动推
    const conflictedIds = new Set(Object.keys(conflicts.value))

    // 拼装批量行
    const practiceRows = practiceIds
      .filter((qid) => !conflictedIds.has(qid))
      .filter((qid) => !sync.shouldGiveUp(qid))
      .map((qid) => {
        const local = adapter.getPractice(qid)
        if (!local) return null
        return {
          user_id: userId,
          question_id: qid,
          mastery: local.mastery,
          answer: local.answer,
          notes: local.notes,
          updated_at: new Date(local.updatedAt ?? Date.now()).toISOString(),
          created_at: new Date(local.updatedAt ?? Date.now()).toISOString(),
        }
      })
      .filter((r): r is api.PracticeRecordRow => r !== null)

    const conversationRows = conversationIds
      .filter((qid) => !conflictedIds.has(qid))
      .filter((qid) => !sync.shouldGiveUp(qid))
      .map((qid) => {
        const local = adapter.getConversation(qid)
        if (!local) return null
        return {
          user_id: userId,
          question_id: qid,
          conversations: local.conversations as api.ConversationRow['conversations'],
          updated_at: new Date(local.updatedAt ?? Date.now()).toISOString(),
          created_at: new Date(local.updatedAt ?? Date.now()).toISOString(),
        }
      })
      .filter((r): r is api.ConversationRow => r !== null)

    let practiceFailed: string[] = practiceRows.map((r) => r.question_id) // 默认全失败
    let convFailed: string[] = conversationRows.map((r) => r.question_id)

    const settled = await Promise.allSettled([
      api.upsertPracticeBatch(practiceRows),
      api.upsertConversationsBatch(conversationRows),
    ])
    if (settled[0].status === 'fulfilled') {
      practiceFailed = settled[0].value
    } else {
      console.warn('[TechCloud] practice batch 网络失败', settled[0].reason)
    }
    if (settled[1].status === 'fulfilled') {
      convFailed = settled[1].value
    } else {
      console.warn('[TechCloud] conversations batch 网络失败', settled[1].reason)
    }

    // 即使两批全失败，也继续处理成功/失败的统计
    // 成功行：清队列 + 推进 lastSyncedAt
    const successPractice = practiceRows.map((r) => r.question_id).filter((qid) => !practiceFailed.includes(qid))
    const successConv = conversationRows.map((r) => r.question_id).filter((qid) => !convFailed.includes(qid))

    for (const qid of successPractice) sync.unschedulePush(qid, 'practice')
    for (const qid of successConv) sync.unschedulePush(qid, 'conversation')
    sync.recordSuccess([...successPractice, ...successConv])

    // 失败行：重试计数 + 留在队列
    for (const qid of practiceFailed) sync.recordFailed([qid])
    for (const qid of convFailed) sync.recordFailed([qid])

    const allTs = [...practiceRows, ...conversationRows]
      .filter((r) => successPractice.includes(r.question_id) || successConv.includes(r.question_id))
      .map((r) => new Date(r.updated_at).getTime())
    if (allTs.length > 0) {
      const max = Math.max(...allTs)
      sync.setLastSyncedAt(max)
    }

    const totalFailed = practiceFailed.length + convFailed.length
    if (totalFailed > 0) {
      setStatus({ kind: 'partial', lastSyncedAt: sync.state.value.lastSyncedAt ?? Date.now(), failedCount: totalFailed })
    } else {
      setStatus({ kind: 'ok', lastSyncedAt: sync.state.value.lastSyncedAt ?? Date.now() })
    }
    } finally {
      pushing.value = false
    }
  }

  // ---------- combined ----------

  async function pullThenPush(): Promise<void> {
    if (running.value) return
    running.value = true
    try {
      await pull()
      await push()
    } finally {
      running.value = false
    }
  }

  async function flushPending(): Promise<void> {
    if (sync.state.value.pendingPush.practice.length > 0 ||
        sync.state.value.pendingPush.conversations.length > 0) {
      await push()
    }
  }

  // ---------- 冲突解决 ----------

  async function resolveConflict(qid: string, choice: 'local' | 'cloud' | 'merge'): Promise<void> {
    const entry = conflicts.value[qid]
    if (!entry) return

    if (choice === 'local') {
      // 把本地推上云（强制 upsert，不走 conflict 过滤）
      await forceUpsertOne(qid, entry.kind)
    } else if (choice === 'cloud') {
      // 用云端覆盖本地
      if (entry.kind === 'practice') {
        const cloud = entry.cloud as { mastery: string; answer: string; notes: string; updated_at: number }
        adapter.setPractice(qid, {
          mastery: cloud.mastery as PracticeSnapshot['mastery'],
          answer: cloud.answer,
          notes: cloud.notes,
          updatedAt: cloud.updated_at,
        })
      } else {
        const cloud = entry.cloud as { conversations: unknown[]; updated_at: number }
        adapter.setConversation(qid, {
          conversations: cloud.conversations,
          updatedAt: cloud.updated_at,
        })
      }
    } else if (choice === 'merge' && entry.kind === 'practice') {
      // 把云端 answer 追加到本地 answer 末尾
      const local = adapter.getPractice(qid)
      const cloud = entry.cloud as { answer: string; updated_at: number }
      if (local) {
        const merged = `${local.answer}\n\n---\n[云端 ${new Date(cloud.updated_at).toISOString().slice(0, 10)}]\n${cloud.answer}`
        adapter.setPractice(qid, { ...local, answer: merged, updatedAt: Date.now() })
        await forceUpsertOne(qid, 'practice')
      }
    }

    // 从 conflictMap 移除
    const next = { ...conflicts.value }
    delete next[qid]
    conflicts.value = next
  }

  async function forceUpsertOne(qid: string, kind: ConflictKind): Promise<void> {
    const userId = adapter.userId()
    if (!userId) return
    if (kind === 'practice') {
      const local = adapter.getPractice(qid)
      if (!local) return
      await api.upsertPracticeBatch([{
        user_id: userId,
        question_id: qid,
        mastery: local.mastery,
        answer: local.answer,
        notes: local.notes,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }])
      sync.unschedulePush(qid, 'practice')
    } else {
      const local = adapter.getConversation(qid)
      if (!local) return
      await api.upsertConversationsBatch([{
        user_id: userId,
        question_id: qid,
        conversations: local.conversations as api.ConversationRow['conversations'],
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }])
      sync.unschedulePush(qid, 'conversation')
    }
  }

  // ---------- 懒加载 ----------

  async function loadPracticeDetail(qid: string): Promise<void> {
    const uid = adapter.userId()
    if (!uid) return
    const local = adapter.getPractice(qid)
    if (local && local.answer && local.notes) return
    try {
      const row = await api.fetchPracticeDetail(qid, uid)
      if (row) {
        adapter.setPractice(qid, {
          mastery: row.mastery,
          answer: row.answer,
          notes: row.notes,
          updatedAt: new Date(row.updated_at).getTime(),
        })
      }
    } catch {
      console.warn('[TechCloud] loadPracticeDetail failed', qid)
    }
  }

  async function loadConversationDetail(qid: string): Promise<void> {
    const uid = adapter.userId()
    if (!uid) return
    const local = adapter.getConversation(qid)
    if (local && local.conversations.length > 0) return
    try {
      const row = await api.fetchConversationsDetail(qid, uid)
      if (row) {
        adapter.setConversation(qid, {
          conversations: row.conversations,
          updatedAt: new Date(row.updated_at).getTime(),
        })
      }
    } catch {
      console.warn('[TechCloud] loadConversationDetail failed', qid)
    }
  }

  async function loadAiAnswerDetail(qid: string): Promise<string | null> {
    try {
      return await api.fetchAiAnswerByQid(qid)
    } catch {
      return null
    }
  }

  // ---------- schedule ----------

  function schedulePush(qid: string, kind: ConflictKind) {
    if (!sync.state.value.enabled) return
    if (!adapter.userId()) return
    sync.schedulePush(qid, kind)
    // debounce flush 留给调用方
  }

  // ---------- 事件挂载 ----------

  // 存储 handler 引用，使 removeEventListener 可匹配
  const onlineHandler = () => {
    online.value = true
    void flushPending()
  }
  const offlineHandler = () => {
    online.value = false
    setStatus({ kind: 'offline', lastSyncedAt: sync.state.value.lastSyncedAt })
  }

  // ---------- 多 tab 协调 ----------

  /** 实例唯一标识，用于 BroadcastChannel 过滤自身消息 */
  const instanceId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let bc: BroadcastChannel | null = null

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)

    // 多 tab 协调
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('tech-interview-sync')
        bc.onmessage = (e) => {
          if (e.data?.type === 'pull-then-push' && e.data?.sender !== instanceId) {
            void pullThenPush()
          }
        }
      } catch {
        console.warn('[TechCloud] BroadcastChannel 不可用，多 tab 协调退化')
      }
    }
  }

  /** 销毁：清理事件监听、BroadcastChannel */
  function destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', offlineHandler)
    }
    bc?.close()
    bc = null
  }

  return {
    status: status as Ref<CloudSyncStatus>,
    conflicts: conflicts as Ref<ConflictMap>,
    pull,
    push,
    pullThenPush,
    flushPending,
    resolveConflict,
    schedulePush,
    loadPracticeDetail,
    loadConversationDetail,
    loadAiAnswerDetail,
    destroy,
    enable: sync.enable,
    disable: sync.disable,
    sync,
  }
}

export function useTechInterviewCloud(adapter: CloudStoreAdapter) {
  if (!singleton) singleton = create(adapter)
  return singleton
}