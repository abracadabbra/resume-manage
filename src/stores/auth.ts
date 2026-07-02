/**
 * 共享 Auth Store
 *
 * 职责：
 *  - 暴露当前登录用户的 uuid 与 email（ref，便于其他 store 反应式订阅）
 *  - 复用 services/supabase.ts 的 signIn / signUp / signOut，不重复实现
 *  - 挂 onAuthStateChange 监听，跨 tab / refresh 自动同步
 *  - 提供 init() 拉一次当前 session，供 App.vue 启动时调用
 *
 * 用法：
 *   const auth = useAuthStore()
 *   auth.init()
 *   ...
 *   watch(() => auth.userId, (id) => techStore.setCurrentUserId(id))
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { signIn as svcSignIn, signUp as svcSignUp, signOut as svcSignOut, getSession } from '@/services/supabase'

export const useAuthStore = defineStore('auth', () => {
  const userId = ref<string | null>(null)
  const email = ref<string | null>(null)
  const isConfigured = ref<boolean>(Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY))

  async function init() {
    try {
      const { data } = await getSession()
      const user = data.session?.user
      if (user) {
        userId.value = user.id
        email.value = user.email ?? null
      }
    } catch {
      // 没配置 SUPABASE 或离线：保持未登录态
    }

    if (isConfigured.value && typeof window !== 'undefined') {
      try {
        // 动态 import 拿到 client（避免在测试 / 无配置时抛错）
        const url = import.meta.env.VITE_SUPABASE_URL
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY
        if (!url || !key) return
        const { createClient } = await import('@supabase/supabase-js')
        const client = createClient(url, key)
        client.auth.onAuthStateChange((_event, session) => {
          const u = session?.user
          userId.value = u?.id ?? null
          email.value = u?.email ?? null
        })
      } catch {
        // ignore
      }
    }
  }

  async function signIn(emailIn: string, password: string) {
    const { data, error } = await svcSignIn(emailIn, password)
    if (error) throw error instanceof Error ? error : new Error(String(error))
    const u = data?.user
    if (u) {
      userId.value = u.id
      email.value = u.email ?? emailIn
    }
  }

  async function signUp(emailIn: string, password: string) {
    const { data, error } = await svcSignUp(emailIn, password)
    if (error) throw error instanceof Error ? error : new Error(String(error))
    const u = data?.user
    if (u) {
      userId.value = u.id
      email.value = u.email ?? emailIn
    }
  }

  async function signOut() {
    await svcSignOut()
    userId.value = null
    email.value = null
  }

  return {
    userId,
    email,
    isConfigured,
    init,
    signIn,
    signUp,
    signOut,
  }
})