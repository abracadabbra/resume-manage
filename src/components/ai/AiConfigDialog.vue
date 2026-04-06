<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'

const store = useAiConfigStore()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const form = reactive({
  apiUrl: store.apiUrl,
  apiToken: store.apiToken,
  modelName: store.modelName,
})

const showToken = ref(false)
const testing = ref(false)
const testResult = ref<{ type: 'success' | 'error'; text: string } | null>(null)

function normalizeApiUrl(raw: string): string {
  let baseUrl = raw.trim().replace(/\/+$/, '')
  if (!baseUrl.includes('/v1/chat/completions')) {
    if (!baseUrl.endsWith('/v1')) baseUrl += '/v1'
    baseUrl += '/chat/completions'
  }
  return baseUrl
}

function resetTestResult() {
  testResult.value = null
}

function extractErrorText(text: string): string {
  const cleaned = text.trim()
  if (!cleaned) return ''
  try {
    const parsed = JSON.parse(cleaned) as { error?: { message?: string }; message?: string }
    return parsed.error?.message?.trim() || parsed.message?.trim() || cleaned
  } catch {
    return cleaned
  }
}

async function handleTestConnection() {
  if (testing.value) return

  const apiUrl = form.apiUrl.trim()
  const apiToken = form.apiToken.trim()
  const modelName = form.modelName.trim()

  if (!apiUrl || !apiToken || !modelName) {
    testResult.value = { type: 'error', text: '请先完整填写 API 地址、API Key 和模型名称。' }
    return
  }

  testing.value = true
  testResult.value = null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)

  try {
    const response = await fetch(normalizeApiUrl(apiUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
        temperature: 0,
        max_tokens: 1,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = extractErrorText(await response.text().catch(() => ''))
      testResult.value = {
        type: 'error',
        text: `连接失败（${response.status}）：${errorText || response.statusText || '未知错误'}`,
      }
      return
    }

    const data = await response.json().catch(() => null)
    const hasChoices = Array.isArray((data as { choices?: unknown[] } | null)?.choices)
    if (!hasChoices) {
      testResult.value = { type: 'error', text: '连接成功，但返回格式异常，请检查模型或服务兼容性。' }
      return
    }

    testResult.value = { type: 'success', text: '连接成功，当前模型可用。' }
  } catch (error: unknown) {
    const message =
      error instanceof DOMException && error.name === 'AbortError'
        ? '请求超时，请检查 API 地址或网络。'
        : error instanceof Error
          ? error.message
          : String(error ?? '未知错误')
    testResult.value = { type: 'error', text: `连接失败：${message}` }
  } finally {
    clearTimeout(timeout)
    testing.value = false
  }
}

function handleSave() {
  store.updateConfig({
    apiUrl: form.apiUrl.trim(),
    apiToken: form.apiToken.trim(),
    modelName: form.modelName.trim(),
  })
  emit('close')
}

function handleCancel() {
  emit('close')
}
</script>

<template>
  <teleport to="body">
    <div class="dialog-overlay">
      <div class="dialog-card">
        <div class="dialog-header">
          <h3 class="dialog-title">
            <svg class="dialog-title-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            AI 服务配置
          </h3>
          <button class="dialog-close" @click="handleCancel">
            <svg class="icon-sm" viewBox="0 0 24 24"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
          </button>
        </div>

        <p class="dialog-desc">配置 AI 接口信息，支持 OpenAI 兼容协议（OpenAI / Claude / DeepSeek 等）</p>

        <div class="dialog-body">
          <div class="form-group">
            <label class="form-label">API 地址</label>
            <input
              v-model="form.apiUrl"
              @input="resetTestResult"
              class="form-input"
              placeholder="例如：https://api.openai.com"
            />
            <span class="form-hint">填写 API base URL，无需包含 /v1/chat/completions</span>
          </div>

          <div class="form-group">
            <label class="form-label">API Key</label>
            <div class="input-with-toggle">
              <input
                v-model="form.apiToken"
                :type="showToken ? 'text' : 'password'"
                @input="resetTestResult"
                class="form-input"
                placeholder="sk-..."
              />
              <button class="toggle-eye" type="button" @click="showToken = !showToken">
                <svg v-if="!showToken" class="icon-eye" viewBox="0 0 24 24">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <svg v-else class="icon-eye" viewBox="0 0 24 24">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">模型名称</label>
            <input
              v-model="form.modelName"
              @input="resetTestResult"
              class="form-input"
              placeholder="例如：gpt-4o / claude-3.5-sonnet / deepseek-chat"
            />
          </div>
        </div>

        <p
          v-if="testResult"
          class="test-result"
          :class="testResult.type === 'success' ? 'test-result-success' : 'test-result-error'"
        >
          {{ testResult.text }}
        </p>

        <div class="dialog-footer">
          <button class="btn-cancel" @click="handleCancel">取消</button>
          <button class="btn-test" :disabled="testing" @click="handleTestConnection">
            {{ testing ? '测试中...' : '测试连接' }}
          </button>
          <button class="btn-save" :disabled="testing" @click="handleSave">保存配置</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(30, 20, 14, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dialog-card {
  background: #fff;
  border-radius: 16px;
  width: 480px;
  max-width: 92vw;
  box-shadow: 0 20px 60px rgba(30, 20, 14, 0.18);
  animation: slideUp 0.25s ease;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}

.dialog-title {
  font-size: 16px;
  font-weight: 700;
  color: #2d2521;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog-title-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: #d97745;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.icon-sm {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dialog-close {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: #f5f0ea;
  color: #8a7461;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-close:hover {
  background: #efe7dc;
  color: #d97745;
}

.dialog-desc {
  padding: 8px 24px 0;
  font-size: 12px;
  color: #8a7461;
  line-height: 1.5;
}

.dialog-body {
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 12px;
  font-weight: 600;
  color: #5c4f44;
}

.form-input {
  height: 40px;
  border: 1px solid #ddd2c6;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  color: #2d2521;
  background: #faf7f4;
  width: 100%;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #d97745;
  box-shadow: 0 0 0 3px rgba(217, 119, 69, 0.12);
  background: #fff;
}

.form-hint {
  font-size: 11px;
  color: #a89888;
}

.input-with-toggle {
  position: relative;
}

.input-with-toggle .form-input {
  padding-right: 40px;
}

.toggle-eye {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: none;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  color: #8a7461;
  display: flex;
  align-items: center;
}

.toggle-eye:hover {
  color: #d97745;
}

.icon-eye {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dialog-footer {
  padding: 0 24px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.test-result {
  margin: 0 24px 10px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.45;
}

.test-result-success {
  border: 1px solid #c8e6cf;
  background: #eef8f1;
  color: #2b7a45;
}

.test-result-error {
  border: 1px solid #f0d2c8;
  background: #fff1ec;
  color: #b74a30;
}

.btn-test {
  height: 38px;
  padding: 0 18px;
  border-radius: 8px;
  border: 1px solid #d97745;
  background: #fff;
  color: #d97745;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-test:hover:not(:disabled) {
  background: #fff3eb;
}

.btn-test:disabled {
  opacity: 0.65;
  cursor: wait;
}

.btn-cancel {
  height: 38px;
  padding: 0 18px;
  border-radius: 8px;
  border: 1px solid #ddd2c6;
  background: #fff;
  color: #8a7461;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel:hover {
  border-color: #c9bba9;
}

.btn-save {
  height: 38px;
  padding: 0 20px;
  border-radius: 8px;
  border: none;
  background: #d97745;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-save:hover {
  background: #c96a3b;
}

.btn-save:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
