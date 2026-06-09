import { describe, expect, it, vi } from 'vitest'

import { loadJson, removeJson, saveJson } from './safeStorage'

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
  }
}

describe('safeStorage', () => {
  it('loads JSON values with fallback for missing or invalid data', () => {
    const storage = createStorage({
      valid: '{"count":1}',
      invalid: '{',
    })

    expect(loadJson(storage, 'valid', { count: 0 })).toEqual({
      value: { count: 1 },
      error: null,
    })
    expect(loadJson(storage, 'missing', { count: 0 })).toEqual({
      value: { count: 0 },
      error: null,
    })
    expect(loadJson(storage, 'invalid', { count: 0 }).value).toEqual({ count: 0 })
    expect(loadJson(storage, 'invalid', { count: 0 }).error).toBeInstanceOf(SyntaxError)
  })

  it('saves and removes JSON values safely', () => {
    const storage = createStorage()

    expect(saveJson(storage, 'key', { ok: true })).toBe(true)
    expect(storage.setItem).toHaveBeenCalledWith('key', '{"ok":true}')
    expect(removeJson(storage, 'key')).toBe(true)
    expect(storage.removeItem).toHaveBeenCalledWith('key')
  })
})
