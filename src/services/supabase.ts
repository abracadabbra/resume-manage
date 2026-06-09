import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { QuestionBankCloudData, QuestionBankCloudRecord } from '@/stores/questionBankCloud'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabaseClient: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('缺少 Supabase 配置，请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。')
  }
  supabaseClient ??= createClient(supabaseUrl, supabaseAnonKey)
  return supabaseClient
}

export interface ResumeRecord {
  id: string
  user_id: string
  name: string
  data: unknown
  version: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  email: string
  created_at: string
}

export async function signUp(email: string, password: string) {
  const result = await getSupabaseClient().auth.signUp({ email, password })
  
  if (result.data?.user) {
    await getSupabaseClient().from('profiles').upsert({
      id: result.data.user.id,
      email: email,
    }, { onConflict: 'id' })
  }
  
  return result
}

export async function signIn(email: string, password: string) {
  const result = await getSupabaseClient().auth.signInWithPassword({ email, password })
  
  if (result.data?.user) {
    const { data: existingProfile } = await getSupabaseClient()
      .from('profiles')
      .select('id')
      .eq('id', result.data.user.id)
      .single()
    
    if (!existingProfile) {
      await getSupabaseClient().from('profiles').insert({
        id: result.data.user.id,
        email: email,
      })
    }
  }
  
  return result
}

export async function signOut() {
  return getSupabaseClient().auth.signOut()
}

export async function getSession() {
  return getSupabaseClient().auth.getSession()
}

export async function getResumes(userId: string) {
  const { data, error } = await getSupabaseClient()
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .order('version', { ascending: false })
  
  if (error) throw error
  return data as ResumeRecord[]
}

export async function getActiveResume(userId: string) {
  const { data, error } = await getSupabaseClient()
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data as ResumeRecord | null
}

export async function createResume(userId: string, name: string, data: unknown) {
  const { data: existingResumes } = await getSupabaseClient()
    .from('resumes')
    .select('version')
    .eq('user_id', userId)
    .order('version', { ascending: false })
    .limit(1)
  
  const nextVersion = existingResumes && existingResumes.length > 0 && existingResumes[0]
    ? (existingResumes[0].version || 0) + 1 
    : 1

  const { data: resume, error } = await getSupabaseClient()
    .from('resumes')
    .insert({
      user_id: userId,
      name,
      data,
      version: nextVersion,
      is_active: nextVersion === 1,
    })
    .select()
    .single()
  
  if (error) throw error
  return resume as ResumeRecord
}

export async function updateResume(id: string, data: unknown) {
  const { data: resume, error } = await getSupabaseClient()
    .from('resumes')
    .update({ data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return resume as ResumeRecord
}

export async function setActiveResume(userId: string, resumeId: string) {
  await getSupabaseClient()
    .from('resumes')
    .update({ is_active: false })
    .eq('user_id', userId)
  
  const { error } = await getSupabaseClient()
    .from('resumes')
    .update({ is_active: true })
    .eq('id', resumeId)
  
  if (error) throw error
}

export async function deleteResume(id: string) {
  const { error } = await getSupabaseClient()
    .from('resumes')
    .delete()
    .eq('id', id)
  
  if (error) throw error
}

export async function getQuestionBankState(userId: string) {
  const { data, error } = await getSupabaseClient()
    .from('question_bank_states')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data as QuestionBankCloudRecord | null
}

export async function upsertQuestionBankState(userId: string, data: QuestionBankCloudData) {
  const { data: record, error } = await getSupabaseClient()
    .from('question_bank_states')
    .upsert(
      {
        user_id: userId,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select()
    .single()

  if (error) throw error
  return record as QuestionBankCloudRecord
}
