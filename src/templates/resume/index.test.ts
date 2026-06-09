import { describe, expect, it } from 'vitest'

import {
  getResumeTemplateByKey,
  isResumeTemplateKey,
  normalizeResumeTemplateKey,
  RESUME_TEMPLATES,
} from './index'

describe('resume template registry', () => {
  it('registers templates with required metadata and unique keys', () => {
    const keys = RESUME_TEMPLATES.map((template) => template.key)

    expect(RESUME_TEMPLATES.length).toBeGreaterThan(0)
    expect(new Set(keys).size).toBe(keys.length)
    RESUME_TEMPLATES.forEach((template) => {
      expect(template.key.trim()).toBe(template.key)
      expect(template.name.trim()).toBeTruthy()
      expect(template.previewImage.trim()).toMatch(/(?:preview\.svg|^data:image\/svg\+xml)/)
      expect(template.component).toBeTruthy()
    })
  })

  it('normalizes legacy and unknown template keys', () => {
    expect(normalizeResumeTemplateKey('classic-blue')).toBe('blue-linear')
    expect(normalizeResumeTemplateKey('missing-template')).toBe('default')
    expect(normalizeResumeTemplateKey(null)).toBe('default')
  })

  it('resolves registered templates by key', () => {
    expect(isResumeTemplateKey('software-engineer')).toBe(true)
    expect(isResumeTemplateKey('missing-template')).toBe(false)
    expect(getResumeTemplateByKey('software-engineer').key).toBe('software-engineer')
  })
})
