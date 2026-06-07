import { defineAsyncComponent } from 'vue'
import type { ResumeTemplateDefinition } from '../types'
import previewImage from '../../../assets/templates/resume/software-engineer-preview.svg'

export const SOFTWARE_ENGINEER_TEMPLATE: ResumeTemplateDefinition = {
  key: 'software-engineer',
  name: '软件工程师',
  previewImage,
  component: defineAsyncComponent(() => import('./ResumeTemplate.vue')),
}
