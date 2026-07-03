/**
 * 公共 AI 答案 IndexedDB 缓存
 *
 * - key: question_id (string)
 * - value: { answer: string; cachedAt: number }
 *
 * 目的：
 * 1. 首次进入页面后，离线也能浏览已缓存过的公共 AI 答案
 * 2. 同一 question_id 重复打开时，跳过网络 round-trip
 * 3. 公共数据按 updatedAt 做软过期（仅提示，不强制失效）
 */

const DB_NAME = 'tech-interview-ai-cache'
const DB_VERSION = 1
const STORE_NAME = 'ai-answers'

interface AiAnswerCacheRecord {
  /** primary key, 同时也是 question_id */
  questionId: string
  answer: string
  /** 本地写入时间 (ms epoch)，用于离线 / 调试 */
  cachedAt: number
}

interface OpenDbResult {
  ok: boolean
  db: IDBDatabase | null
  error?: unknown
}

function openDb(): Promise<OpenDbResult> {
  return new Promise((resolve) => {
    // SSR / 无 indexedDB 环境（单元测试、Node 工具脚本）走快速失败
    if (typeof indexedDB === 'undefined') {
      resolve({ ok: false, db: null })
      return
    }

    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (err) {
      resolve({ ok: false, db: null, error: err })
      return
    }

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'questionId' })
      }
    }

    req.onsuccess = () => {
      resolve({ ok: true, db: req.result })
    }

    req.onerror = () => {
      resolve({ ok: false, db: null, error: req.error })
    }

    req.onblocked = () => {
      resolve({ ok: false, db: null, error: new Error('idb blocked') })
    }
  })
}

/** 读取一条缓存；不存在或失败时返回 null（绝不抛） */
export async function getCachedAiAnswer(questionId: string): Promise<string | null> {
  const { ok, db, error } = await openDb()
  if (!ok || !db) {
    if (import.meta.env?.DEV) {
      console.warn('[tech-ai-cache] openDb failed', error)
    }
    return null
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(questionId)
      req.onsuccess = () => {
        const rec = req.result as AiAnswerCacheRecord | undefined
        resolve(rec?.answer ?? null)
      }
      req.onerror = () => {
        resolve(null)
      }
      tx.oncomplete = () => db.close()
    } catch (err) {
      if (import.meta.env?.DEV) console.warn('[tech-ai-cache] get tx failed', err)
      db.close()
      resolve(null)
    }
  })
}

/**
 * 批量读取；按 questionIds 顺序返回 (answer|null)[]
 * - 顺序对齐是因为调用方一般按 filteredQuestions 顺序去查，要做"边加载边渲染"
 * - 单笔失败降级为 null，不阻断其他
 */
export async function getCachedAiAnswers(questionIds: string[]): Promise<(string | null)[]> {
  const { ok, db } = await openDb()
  if (!ok || !db || questionIds.length === 0) {
    return questionIds.map(() => null)
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const results: (string | null)[] = Array.from({ length: questionIds.length }).fill(null)
      let pending = questionIds.length

      const finalize = () => {
        if (pending <= 0) {
          db.close()
          resolve(results)
        }
      }

      questionIds.forEach((qid, idx) => {
        const req = store.get(qid)
        req.onsuccess = () => {
          const rec = req.result as AiAnswerCacheRecord | undefined
          results[idx] = rec?.answer ?? null
          pending--
          finalize()
        }
        req.onerror = () => {
          results[idx] = null
          pending--
          finalize()
        }
      })

      tx.oncomplete = () => {
        pending = 0
        db.close()
        resolve(results)
      }
      tx.onerror = () => {
        db.close()
        resolve(results)
      }
    } catch (err) {
      if (import.meta.env?.DEV) console.warn('[tech-ai-cache] batch get failed', err)
      db.close()
      resolve(questionIds.map(() => null))
    }
  })
}

/** 写入单条；失败时静默吞掉，不阻塞 UI */
export async function setCachedAiAnswer(questionId: string, answer: string): Promise<void> {
  if (!answer) return
  const { ok, db } = await openDb()
  if (!ok || !db) return

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put({ questionId, answer, cachedAt: Date.now() } satisfies AiAnswerCacheRecord)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        resolve()
      }
    } catch (err) {
      if (import.meta.env?.DEV) console.warn('[tech-ai-cache] put failed', err)
      db.close()
      resolve()
    }
  })
}

/** 清空所有缓存（一般用于"清缓存"按钮或 schema 升级时） */
export async function clearAiAnswerCache(): Promise<void> {
  const { ok, db } = await openDb()
  if (!ok || !db) return

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.clear()
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        resolve()
      }
    } catch (err) {
      if (import.meta.env?.DEV) console.warn('[tech-ai-cache] clear failed', err)
      db.close()
      resolve()
    }
  })
}