import type { Directive } from 'vue'
import { sanitizeHtml } from '@/services/htmlSanitizer'

function applySafeHtml(element: HTMLElement, value: unknown) {
  element.innerHTML = sanitizeHtml(String(value ?? ''))
}

export const safeHtmlDirective: Directive<HTMLElement, unknown> = {
  beforeMount(element, binding) {
    applySafeHtml(element, binding.value)
  },
  updated(element, binding) {
    if (binding.value === binding.oldValue) return
    applySafeHtml(element, binding.value)
  },
}
