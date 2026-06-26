import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from './aiClient'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function getClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('缺少 Supabase 配置，请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。')
  }
  return createClient(supabaseUrl, supabaseAnonKey)
}

export interface TechInterviewQuestion {
  id?: number
  question_text: string
  mention_count: number
  companies: string[]
  tech_field?: string
  position?: string
  round?: string
  note_id?: string
  note_title?: string
  link?: string
  published_at?: string
  source?: 'bundled' | 'manual' | 'imported'
  created_at?: string
  updated_at?: string
}

export interface AiAnswerData {
  answer: string
  conversations: ChatMessage[]
  updatedAt: number
}

export interface TechInterviewQuestionDraft {
  question_text: string
  tech_field?: string
  companies?: string[]
  position?: string
  round?: string
  note_id?: string
  note_title?: string
  link?: string
  published_at?: string
}

// ---------- Questions ----------

export async function listTechQuestions(techField?: string): Promise<TechInterviewQuestion[]> {
  const client = getClient()
  let query = client
    .from('tech_interview_questions')
    .select('*')
    .order('mention_count', { ascending: false })

  if (techField) {
    query = query.eq('tech_field', techField)
  }

  const { data, error } = await query

  if (error) throw new Error(`加载题目失败: ${error.message}`)
  return (data as TechInterviewQuestion[]) ?? []
}

export async function getTechQuestion(id: number): Promise<TechInterviewQuestion | null> {
  const client = getClient()
  const { data, error } = await client
    .from('tech_interview_questions')
    .select('*')
    .eq('id', id)
    .single()

  if (error && error.code !== 'PGRST116') throw new Error(`加载题目失败: ${error.message}`)
  return (data as TechInterviewQuestion) ?? null
}

export async function createTechQuestion(
  draft: TechInterviewQuestionDraft,
): Promise<TechInterviewQuestion> {
  const client = getClient()
  const { data, error } = await client
    .from('tech_interview_questions')
    .insert({
      question_text: draft.question_text,
      mention_count: 1,
      companies: draft.companies ?? [],
      tech_field: draft.tech_field ?? null,
      position: draft.position ?? null,
      round: draft.round ?? null,
      note_id: draft.note_id ?? null,
      note_title: draft.note_title ?? null,
      link: draft.link ?? null,
      published_at: draft.published_at ?? null,
      source: 'manual',
    })
    .select()
    .single()

  if (error) throw new Error(`创建题目失败: ${error.message}`)
  return data as TechInterviewQuestion
}

export async function updateTechQuestion(
  id: number,
  updates: Partial<Pick<TechInterviewQuestion, 'question_text'>>,
): Promise<TechInterviewQuestion> {
  const client = getClient()
  const { data, error } = await client
    .from('tech_interview_questions')
    .update({ question_text: updates.question_text })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`更新题目失败: ${error.message}`)
  return data as TechInterviewQuestion
}

export async function deleteTechQuestion(id: number): Promise<void> {
  const client = getClient()
  const { error } = await client
    .from('tech_interview_questions')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`删除题目失败: ${error.message}`)
}

export async function getTechFields(): Promise<string[]> {
  const client = getClient()
  const { data, error } = await client
    .from('tech_interview_questions')
    .select('tech_field')
    .not('tech_field', 'is', null)

  if (error) throw new Error(`获取分类失败: ${error.message}`)
  const fields = [...new Set((data ?? []).map((r) => r.tech_field).filter(Boolean))]
  return fields as string[]
}

export async function getTechCompanies(): Promise<string[]> {
  const client = getClient()
  const { data, error } = await client
    .from('tech_interview_questions')
    .select('companies')

  if (error) throw new Error(`获取公司列表失败: ${error.message}`)
  const allCompanies = (data ?? []).flatMap((r) => r.companies ?? [])
  return [...new Set(allCompanies)] as string[]
}

export async function getTechQuestionCount(): Promise<number> {
  const client = getClient()
  const { count, error } = await client
    .from('tech_interview_questions')
    .select('id', { count: 'exact', head: true })

  if (error) return 0
  return count ?? 0
}

// ---------- AI Answers ----------

export async function getAiAnswer(questionId: number): Promise<AiAnswerData | null> {
  const client = getClient()
  const { data, error } = await client
    .from('tech_interview_ai_answers')
    .select('*')
    .eq('question_id', questionId)
    .single()

  if (error && error.code !== 'PGRST116') return null
  if (!data) return null

  return {
    answer: data.answer ?? '',
    conversations: data.conversations ?? [],
    updatedAt: data.updated_at
      ? new Date(data.updated_at).getTime()
      : Date.now(),
  }
}

export async function upsertAiAnswer(
  questionId: number,
  answerData: AiAnswerData,
): Promise<void> {
  const client = getClient()
  const { error } = await client
    .from('tech_interview_ai_answers')
    .upsert(
      {
        question_id: questionId,
        answer: answerData.answer,
        conversations: answerData.conversations,
        updated_at: new Date(answerData.updatedAt).toISOString(),
      },
      { onConflict: 'question_id' },
    )

  if (error) throw new Error(`保存 AI 答案失败: ${error.message}`)
}

export async function deleteAiAnswer(questionId: number): Promise<void> {
  const client = getClient()
  const { error } = await client
    .from('tech_interview_ai_answers')
    .delete()
    .eq('question_id', questionId)

  if (error) throw new Error(`删除 AI 答案失败: ${error.message}`)
}
