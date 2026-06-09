<script setup lang="ts">
import { ref } from 'vue'
import { useResumeStore } from '@/stores/resume'

const store = useResumeStore()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const isLoginMode = ref(true)
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''
  loading.value = true
  
  try {
    if (isLoginMode.value) {
      await store.login(email.value, password.value)
    } else {
      await store.register(email.value, password.value)
    }
    emit('close')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-overlay" @click.self="emit('close')">
    <div class="login-dialog">
      <div class="login-header">
        <h2>{{ isLoginMode ? '登录' : '注册' }}</h2>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>
      
      <form class="login-form" @submit.prevent="handleSubmit">
        <div class="form-field">
          <label>邮箱</label>
          <input 
            v-model="email" 
            type="email" 
            placeholder="your@email.com"
            required
          />
        </div>
        
        <div class="form-field">
          <label>密码</label>
          <input 
            v-model="password" 
            type="password" 
            placeholder="至少6位"
            required
            minlength="6"
          />
        </div>
        
        <div v-if="error" class="error-msg">{{ error }}</div>
        
        <button type="submit" class="submit-btn" :disabled="loading">
          {{ loading ? '处理中...' : (isLoginMode ? '登录' : '注册') }}
        </button>
      </form>
      
      <div class="login-footer">
        <button 
          type="button" 
          class="switch-mode-btn"
          @click="isLoginMode = !isLoginMode"
        >
          {{ isLoginMode ? '没有账号？去注册' : '已有账号？去登录' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.login-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  width: 320px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.login-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.login-header h2 {
  margin: 0;
  font-size: 20px;
  color: #2d2521;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #7b6a5b;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field label {
  font-size: 13px;
  color: #2d2521;
  font-weight: 600;
}

.form-field input {
  padding: 10px 12px;
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  font-size: 14px;
}

.form-field input:focus {
  outline: none;
  border-color: #2a5caa;
}

.error-msg {
  color: #dc3545;
  font-size: 13px;
}

.submit-btn {
  background: #2d2521;
  color: #fff;
  border: none;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.login-footer {
  margin-top: 16px;
  text-align: center;
}

.switch-mode-btn {
  background: none;
  border: none;
  color: #2a5caa;
  font-size: 13px;
  cursor: pointer;
}
</style>
