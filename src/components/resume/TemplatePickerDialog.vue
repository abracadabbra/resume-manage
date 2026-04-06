<script setup lang="ts">
import { ref } from 'vue'
import type { ResumeTemplateDefinition, ResumeTemplateKey } from '@/templates/resume'

const props = defineProps<{
  modelValue: boolean
  templates: ResumeTemplateDefinition[]
  selectedKey: ResumeTemplateKey
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'select', key: ResumeTemplateKey): void
}>()

const brokenTemplateImageKeys = ref<Set<string>>(new Set())

function closeDialog() {
  emit('update:modelValue', false)
}

function chooseTemplate(key: ResumeTemplateKey) {
  emit('select', key)
  emit('update:modelValue', false)
}

function isTemplateImageBroken(key: string): boolean {
  return brokenTemplateImageKeys.value.has(key)
}

function markTemplateImageBroken(key: string) {
  if (brokenTemplateImageKeys.value.has(key)) return
  const next = new Set(brokenTemplateImageKeys.value)
  next.add(key)
  brokenTemplateImageKeys.value = next
}

function resolvePreviewImageSrc(value: string): string {
  const src = value.trim()
  if (!src) return ''
  if (src.startsWith('//')) return `https:${src}`
  if (/^(https?:|data:|blob:)/i.test(src)) return src
  return src
}
</script>

<template>
  <div v-if="props.modelValue" class="template-picker-mask" @click.self="closeDialog">
    <div class="template-picker-dialog">
      <div class="template-picker-head">
        <span>选择模板</span>
        <button class="template-picker-close" @click="closeDialog">关闭</button>
      </div>
      <div class="template-picker-list">
        <button
          v-for="item in props.templates"
          :key="item.key"
          class="template-picker-item"
          :class="{ 'template-picker-item-active': item.key === props.selectedKey }"
          @click="chooseTemplate(item.key)"
        >
          <div class="template-thumb">
            <img
              v-if="item.previewImage && !isTemplateImageBroken(item.key)"
              :src="resolvePreviewImageSrc(item.previewImage)"
              :alt="`${item.name}预览图`"
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="markTemplateImageBroken(item.key)"
            />
            <div v-else class="template-thumb-fallback">A4</div>
          </div>
          <div class="template-info">
            <p class="template-name">{{ item.name }}</p>
            <span class="template-badge">A4</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-picker-mask {
  position: fixed;
  inset: 0;
  background: rgba(30, 20, 10, 0.28);
  z-index: 40;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 18px;
}

.template-picker-dialog {
  width: min(980px, calc(100vw - 36px));
  max-height: min(86vh, 960px);
  overflow: hidden;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #e7ddcf;
  box-shadow: 0 24px 60px rgba(45, 37, 33, 0.22);
  display: flex;
  flex-direction: column;
}

.template-picker-head {
  height: 56px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #efe5d8;
  color: #2d2521;
  font-size: 16px;
  font-weight: 700;
}

.template-picker-close {
  border: 1px solid #eadfcc;
  background: #fff;
  color: #7b6a5b;
  border-radius: 8px;
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.template-picker-close:hover {
  background: #faf6f0;
}

.template-picker-list {
  padding: 16px;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 14px;
}

.template-picker-item {
  border: 1px solid #efe5d8;
  border-radius: 12px;
  background: #fff;
  padding: 10px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease;
}

.template-picker-item:hover {
  border-color: #d4c2aa;
  background: #fefcf9;
  box-shadow: 0 8px 18px rgba(45, 37, 33, 0.1);
}

.template-picker-item-active {
  border-color: #4b89dc;
  box-shadow: 0 0 0 1px rgba(75, 137, 220, 0.2);
}

.template-thumb {
  width: 100%;
  aspect-ratio: 4 / 5;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #ece2d4;
  background: #f7f2ea;
}

.template-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.template-thumb-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  color: #b59c81;
  background: linear-gradient(145deg, #f6eee2 0%, #fdf9f3 48%, #f2e8d9 100%);
}

.template-info {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.template-name {
  margin: 0;
  color: #2d2521;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
}

.template-badge {
  flex-shrink: 0;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid #e9ded0;
  color: #7b6a5b;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
}
</style>
