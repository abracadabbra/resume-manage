<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const emit = defineEmits<{ (e: 'close'): void }>()

const email = ref('')
const password = ref('')
const mode = ref<'signin' | 'signup'>('signin')
const submitting = ref(false)
const errorMsg = ref('')

async function submit() {
  if (!email.value.trim() || !password.value) {
    errorMsg.value = '请填写邮箱和密码'
    return
  }
  submitting.value = true
  errorMsg.value = ''
  try {
    if (mode.value === 'signin') {
      await auth.signIn(email.value.trim(), password.value)
    } else {
      await auth.signUp(email.value.trim(), password.value)
    }
    emit('close')
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    submitting.value = false
  }
}

function switchMode() {
  mode.value = mode.value === 'signin' ? 'signup' : 'signin'
  errorMsg.value = ''
}
</script>

<template>
  <div class="auth-overlay" @click.self="emit('close')">
    <div class="auth-dialog">
      <header>
        <h2>{{ mode === 'signin' ? '登录' : '注册' }}</h2>
        <button class="close-btn" @click="emit('close')">×</button>
      </header>

      <p class="hint">
        {{ mode === 'signin'
          ? '登录后即可在多设备间同步练习记录与 AI 追问对话。'
          : '注册新账号。注册成功后将自动登录。' }}
      </p>

      <form @submit.prevent="submit">
        <label>
          <span>邮箱</span>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            required
          />
        </label>
        <label>
          <span>密码</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            minlength="6"
            placeholder="至少 6 位"
            required
          />
        </label>

        <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

        <button class="primary" type="submit" :disabled="submitting">
          {{ submitting ? '处理中…' : (mode === 'signin' ? '登录' : '注册') }}
        </button>
      </form>

      <button class="switch" @click="switchMode">
        {{ mode === 'signin' ? '没有账号？去注册' : '已有账号？去登录' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.auth-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 380px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

header h2 {
  margin: 0;
  font-size: 16px;
  color: #2d2521;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #8a7461;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 4px;
}
.close-btn:hover { background: #f0e8d8; }

.hint {
  font-size: 12px;
  color: #8a7461;
  margin: 0 0 16px;
  line-height: 1.5;
}

form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

label span {
  font-size: 12px;
  font-weight: 600;
  color: #5a4a3a;
}

input {
  padding: 8px 10px;
  border: 1px solid #e0d2c1;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

input:focus { border-color: #7c6af0; }

.error {
  font-size: 12px;
  color: #c14a3a;
  margin: 0;
}

.primary {
  margin-top: 4px;
  padding: 10px;
  background: #7c6af0;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.primary:hover:not(:disabled) { background: #6a59d6; }
.primary:disabled { opacity: 0.5; cursor: not-allowed; }

.switch {
  margin-top: 12px;
  background: none;
  border: none;
  color: #7c6af0;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
}
.switch:hover { text-decoration: underline; }
</style>