import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://plymffomjwgaisicytbl.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBseW1mZm9tandnYWlzaWN5dGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NjY2MzYsImV4cCI6MjA5MTA0MjYzNn0.EhktPQqFanIbF6ButJpyczFmOvrwnO9xNvdBkp4WomA'

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)

export interface ResumeRecord {
  id: string
  user_id: string
  name: string
  data: any
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
  const result = await supabase.auth.signUp({ email, password })
  
  if (result.data?.user) {
    await supabase.from('profiles').upsert({
      id: result.data.user.id,
      email: email,
    }, { onConflict: 'id' })
  }
  
  return result
}

export async function signIn(email: string, password: string) {
  const result = await supabase.auth.signInWithPassword({ email, password })
  
  if (result.data?.user) {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', result.data.user.id)
      .single()
    
    if (!existingProfile) {
      await supabase.from('profiles').insert({
        id: result.data.user.id,
        email: email,
      })
    }
  }
  
  return result
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getSession() {
  return supabase.auth.getSession()
}

export async function getResumes(userId: string) {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .order('version', { ascending: false })
  
  if (error) throw error
  return data as ResumeRecord[]
}

export async function getActiveResume(userId: string) {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data as ResumeRecord | null
}

export async function createResume(userId: string, name: string, data: any) {
  const { data: existingResumes } = await supabase
    .from('resumes')
    .select('version')
    .eq('user_id', userId)
    .order('version', { ascending: false })
    .limit(1)
  
  const nextVersion = existingResumes && existingResumes.length > 0 && existingResumes[0]
    ? (existingResumes[0].version || 0) + 1 
    : 1

  const { data: resume, error } = await supabase
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

export async function updateResume(id: string, data: any) {
  const { data: resume, error } = await supabase
    .from('resumes')
    .update({ data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return resume as ResumeRecord
}

export async function setActiveResume(userId: string, resumeId: string) {
  await supabase
    .from('resumes')
    .update({ is_active: false })
    .eq('user_id', userId)
  
  const { error } = await supabase
    .from('resumes')
    .update({ is_active: true })
    .eq('id', resumeId)
  
  if (error) throw error
}

export async function deleteResume(id: string) {
  const { error } = await supabase
    .from('resumes')
    .delete()
    .eq('id', id)
  
  if (error) throw error
}
