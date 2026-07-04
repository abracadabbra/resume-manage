import { ref } from 'vue'
import type { useResumeStore } from '@/stores/resume'

type ResumeStore = ReturnType<typeof useResumeStore>

export function useModuleDragOrder(store: ResumeStore) {
  const draggingModuleKey = ref<string | null>(null)
  const dragOverModuleKey = ref<string | null>(null)

  function handleSwitchDragStart(event: DragEvent, key: string) {
    if (key === 'basicInfo') {
      event.preventDefault()
      return
    }
    draggingModuleKey.value = key
    event.dataTransfer?.setData('text/plain', key)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
    }
  }

  function handleSwitchDragOver(event: DragEvent, key: string) {
    if (!draggingModuleKey.value || draggingModuleKey.value === key) return
    event.preventDefault()
    dragOverModuleKey.value = key
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  function handleSwitchDrop(targetKey: string) {
    const sourceKey = draggingModuleKey.value
    if (!sourceKey || sourceKey === targetKey) return
    store.reorderModule(sourceKey, targetKey)
    dragOverModuleKey.value = null
  }

  function handleSwitchDragEnd() {
    draggingModuleKey.value = null
    dragOverModuleKey.value = null
  }

  return {
    draggingModuleKey,
    dragOverModuleKey,
    handleSwitchDragStart,
    handleSwitchDragOver,
    handleSwitchDrop,
    handleSwitchDragEnd,
  }
}
