<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    collapsed?: boolean
    activeMenu?: 'resume-editor' | 'ai-interviewer'
  }>(),
  {
    collapsed: false,
    activeMenu: 'resume-editor',
  }
)

const emit = defineEmits<{
  (e: 'toggle-collapse'): void
  (e: 'select-menu', key: 'resume-editor' | 'ai-interviewer'): void
}>()

const primaryMenus = [
  {
    key: 'resume-editor' as const,
    label: '简历编辑',
    iconPath:
      'M15 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8Zm0 0v5h5M9 13h6M9 17h4',
  },
  {
    key: 'ai-interviewer' as const,
    label: 'AI面试',
    iconPath:
      'M9 3h6M12 3v3m-6 4h12a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-3l-3 2-3-2H6a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Zm3 3h.01M15 15h.01',
  },
]
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: props.collapsed }">
    <div class="brand">
      <div class="brand-left">
        <span class="brand-logo-wrap" aria-hidden="true">
          <img class="brand-logo" src="/favicon.svg?v=orange-black" alt="" />
        </span>
        <span class="brand-text">Resume Builder</span>
      </div>
      <button
        class="collapse-btn"
        type="button"
        :aria-label="props.collapsed ? '展开侧边菜单' : '收起侧边菜单'"
        :title="props.collapsed ? '展开' : '收缩'"
        :data-tip="props.collapsed ? '展开' : '收缩'"
        @click="emit('toggle-collapse')"
      >
        {{ props.collapsed ? '>' : '<' }}
      </button>
    </div>

    <p class="menu-caption">功能菜单</p>

    <ul class="primary-menu-list">
      <li v-for="menu in primaryMenus" :key="menu.key" class="primary-menu-item">
        <button
          class="primary-menu-btn"
          type="button"
          :class="{ active: props.activeMenu === menu.key }"
          :aria-current="props.activeMenu === menu.key ? 'page' : undefined"
          :title="menu.label"
          @click="emit('select-menu', menu.key)"
        >
          <span class="menu-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path :d="menu.iconPath" />
            </svg>
          </span>
          <span class="menu-label">{{ menu.label }}</span>
        </button>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 272px;
  min-width: 272px;
  background: #efe7dc;
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  border-right: 1px solid #dfd2c2;
  overflow-y: auto;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 4px 2px;
}

.brand-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.brand-logo-wrap {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(45, 37, 33, 0.1);
}

.brand-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-text {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: #2d2521;
}

.collapse-btn {
  position: relative;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: #f7f3ee;
  color: #d97745;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.18s ease, color 0.18s ease;
}

.collapse-btn::after {
  content: attr(data-tip);
  position: absolute;
  left: 50%;
  top: -8px;
  transform: translate(-50%, -100%);
  background: #2d2521;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 5px 8px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.16s ease;
  z-index: 6;
}

.collapse-btn::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -8px;
  transform: translateX(-50%);
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid #2d2521;
  opacity: 0;
  transition: opacity 0.16s ease;
  pointer-events: none;
  z-index: 6;
}

.collapse-btn:hover::after,
.collapse-btn:hover::before,
.collapse-btn:focus-visible::after,
.collapse-btn:focus-visible::before {
  opacity: 1;
}

.collapse-btn:hover {
  background: #f2ece5;
  color: #c96a3b;
}

.menu-caption {
  color: #8a7461;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  padding: 0 6px;
}

.primary-menu-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.primary-menu-btn {
  width: 100%;
  border: 1px solid #e3d6c7;
  background: #f8f3ed;
  border-radius: 10px;
  padding: 10px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease;
}

.primary-menu-btn:hover {
  border-color: #d5c4b3;
  background: #fff;
}

.primary-menu-btn.active {
  border-color: #d97745;
  background: #fff;
  box-shadow: 0 6px 14px rgba(217, 119, 69, 0.12);
}

.menu-icon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: #eadccf;
  color: #7b6a5b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.menu-icon svg {
  width: 16px;
  height: 16px;
}

.menu-icon path {
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.primary-menu-btn.active .menu-icon {
  background: #d97745;
  color: #fff;
}

.menu-label {
  color: #2d2521;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.sidebar.collapsed {
  width: 92px;
  min-width: 92px;
  padding: 14px 8px;
}

.sidebar.collapsed .brand-text,
.sidebar.collapsed .menu-caption,
.sidebar.collapsed .menu-label {
  display: none;
}

.sidebar.collapsed .brand {
  justify-content: center;
}

.sidebar.collapsed .primary-menu-btn {
  justify-content: center;
  padding: 10px 6px;
}

.sidebar.collapsed .menu-icon {
  width: 28px;
  height: 28px;
}
</style>
