/**
 * 大厂面经 v3 Supabase API 封装
 *
 * 职责：
 *  - 公共表（tech_interview_questions / tech_interview_ai_answers）只读
 *  - 私有表（tech_practice_records / tech_user_ai_conversations）CRUD
 *  - 全部走 RLS，前端只用 anon key
 *
 * question_id 统一为 string（PG text 主键）。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from './aiClient'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let cachedClient: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (cachedClient) return cachedClient
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('缺少 Supabase 配置，请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。')
  }
  cachedClient = createClient(supabaseUrl, supabaseAnonKey)
  return cachedClient
}

// ---------- 类型 ----------

export interface QuestionRow {
  id: string
  question_text: string
  mention_count: number
  companies: string[]
  tech_field: string | null
  position: string | null
  round: string | null
  note_id: string | null
  note_title: string | null
  link: string | null
  published_at: string | null
  source: 'bundled' | 'manual' | 'imported'
  created_at: string
  updated_at: string
}

/** 元数据（pull 阶段使用，不含完整字段） */
export interface QuestionMeta {
  id: string
  mention_count: number
  tech_field: string | null
  position: string | null
  updated_at: string
}

export interface AiAnswerRow {
  question_id: string
  answer: string
  updated_at: string
}

export interface AiAnswerMeta {
  question_id: string
  updated_at: string
}

/** 私有 - 练习记录（与 tech_practice_records 对应） */
export interface PracticeRecordRow {
  user_id: string
  question_id: string
  mastery: 'unpracticed' | 'practicing' | 'mastered' | 'weak'
  answer: string
  notes: string
  updated_at: string
  created_at: string
}

export interface PracticeRecordMeta {
  question_id: string
  mastery: PracticeRecordRow['mastery']
  updated_at: string
}

/** 私有 - 追问对话（与 tech_user_ai_conversations 对应） */
export interface ConversationRow {
  user_id: string
  question_id: string
  conversations: ChatMessage[]
  updated_at: string
  created_at: string
}

export interface ConversationMeta {
  question_id: string
  updated_at: string
}

/** 统一错误 */
export class TechInterviewApiError extends Error {
  readonly code: string
  readonly table: string
  constructor(message: string, code: string, table: string) {
    super(message)
    this.name = 'TechInterviewApiError'
    this.code = code
    this.table = table
  }
}

// ---------- 公共表只读 ----------

/** 拉题库元数据（pull 阶段使用） */
export async function fetchQuestionsMeta(): Promise<QuestionMeta[]> {
  const { data, error } = await getClient()
    .from('tech_interview_questions')
    .select('id, mention_count, tech_field, position, updated_at')
  if (error) throw new TechInterviewApiError(error.message, error.code, 'tech_interview_questions')
  return (data ?? []) as QuestionMeta[]
}

/** 拉全量题目行（主数据源初始化时使用） */
export async function fetchQuestionsAll(): Promise<QuestionRow[]> {
  const { data, error } = await getClient()
    .from('tech_interview_questions')
    .select('*')
  if (error) throw new TechInterviewApiError(error.message, error.code, 'tech_interview_questions')
  return (data ?? []) as QuestionRow[]
}

/** 拉题目详情（按需懒加载） */
export async function fetchQuestionDetail(qid: string): Promise<QuestionRow | null> {
  const { data, error } = await getClient()
    .from('tech_interview_questions')
    .select('*')
    .eq('id', qid)
    .maybeSingle()
  if (error) throw new TechInterviewApiError(error.message, error.code, 'tech_interview_questions')
  return (data as QuestionRow) ?? null
}

/** 拉 AI 答案元数据（pull 阶段使用） */
export async function fetchAiAnswersMeta(): Promise<AiAnswerMeta[]> {
  const { data, error } = await getClient()
    .from('tech_interview_ai_answers')
    .select('question_id, updated_at')
  if (error) throw new TechInterviewApiError(error.message, error.code, 'tech_interview_ai_answers')
  return (data ?? []) as AiAnswerMeta[]
}

/** 拉单个题目的 AI 答案（公共答案文本） */
export async function fetchAiAnswerByQid(qid: string): Promise<string | null> {
  const { data, error } = await getClient()
    .from('tech_interview_ai_answers')
    .select('answer')
    .eq('question_id', qid)
    .maybeSingle()
  if (error) throw new TechInterviewApiError(error.message, error.code, 'tech_interview_ai_answers')
  return data?.answer ?? null
}

// ---------- 私有 - practice ----------

/** 拉当前用户所有 practice 记录元数据 */
export async function fetchPracticeMeta(): Promise<PracticeRecordMeta[]> {
  const { data, error } = await getClient()
    .from('tech_practice_records')
    .select('question_id, mastery, updated_at')
  if (error) throw new TechInterviewApiError(error.message, error.code, 'tech_practice_records')
  return (data ?? []) as PracticeRecordMeta[]
}

/** 拉单个 practice 详情（懒加载 answer / notes） */
export async function fetchPracticeDetail(qid: string): Promise<PracticeRecordRow | null> {
  const { data, error } = await getClient()
    .from('tech_practice_records')
    .select('*')
    .eq('question_id', qid)
    .maybeSingle()
  if (error) throw new TechInterviewApiError(error.message, error.code, 'tech_practice_records')
  return (data as PracticeRecordRow) ?? null
}

/**
 * 批量 upsert 练习记录。
 * - 不传 updated_at（trigger 自动维护）
 * - 单批 200 行
 * - 失败行通过返回值收集，不抛错
 */
export async function upsertPracticeBatch(rows: PracticeRecordRow[]): Promise<string[]> {
  if (rows.length === 0) return []
  const failed: string[] = []
  const BATCH = 200
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const payload = batch.map(({ question_id, mastery, answer, notes, user_id }) => ({
      question_id,
      user_id,
      mastery,
      answer,
      notes,
    }))
    const { error } = await getClient()
      .from('tech_practice_records')
      .upsert(payload, { onConflict: 'user_id,question_id' })
    if (error) {
      failed.push(...batch.map((r) => r.question_id))
    }
  }
  return failed
}

// ---------- 私有 - conversations ----------

/** 拉当前用户所有 conversations 元数据 */
export async function fetchConversationsMeta(): Promise<ConversationMeta[]> {
  const { data, error } = await getClient()
    .from('tech_user_ai_conversations')
    .select('question_id, updated_at')
  if (error) throw new TechInterviewApiError(error.message, error.code, 'tech_user_ai_conversations')
  return (data ?? []) as ConversationMeta[]
}

/** 拉单个 conversations 详情（懒加载 conversations JSONB） */
export async function fetchConversationsDetail(qid: string): Promise<ConversationRow | null> {
  const { data, error } = await getClient()
    .from('tech_user_ai_conversations')
    .select('*')
    .eq('question_id', qid)
    .maybeSingle()
  if (error) throw new TechInterviewApiError(error.message, error.code, 'tech_user_ai_conversations')
  return (data as ConversationRow) ?? null
}

/** 批量 upsert conversations */
export async function upsertConversationsBatch(rows: ConversationRow[]): Promise<string[]> {
  if (rows.length === 0) return []
  const failed: string[] = []
  const BATCH = 200
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const payload = batch.map(({ question_id, conversations, user_id }) => ({
      question_id,
      user_id,
      conversations,
    }))
    const { error } = await getClient()
      .from('tech_user_ai_conversations')
      .upsert(payload, { onConflict: 'user_id,question_id' })
    if (error) {
      failed.push(...batch.map((r) => r.question_id))
    }
  }
  return failed
}

/** 删除 conversations（用户清空自己的追问） */
export async function deleteConversations(qid: string): Promise<void> {
  const { error } = await getClient()
    .from('tech_user_ai_conversations')
    .delete()
    .eq('question_id', qid)
  if (error) throw new TechInterviewApiError(error.message, error.code, 'tech_user_ai_conversations')
}