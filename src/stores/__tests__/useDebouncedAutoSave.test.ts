import { reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDebouncedAutoSave } from '@/stores/useDebouncedAutoSave'

describe('useDebouncedAutoSave', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces saves for reactive snapshots', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const state = reactive({ title: 'old' })
    const onScheduled = vi.fn()
    const onSave = vi.fn()

    const handle = useDebouncedAutoSave({
      delayMs: 500,
      getSnapshot: () => ({ ...state }),
      onScheduled,
      onSave,
    })

    state.title = 'new'
    await Promise.resolve()

    expect(onScheduled).toHaveBeenCalledWith(1_500)
    expect(onSave).not.toHaveBeenCalled()

    vi.advanceTimersByTime(499)
    expect(onSave).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onSave).toHaveBeenCalledTimes(1)

    handle.stop()
  })

  it('can cancel a pending save', async () => {
    vi.useFakeTimers()
    const state = reactive({ title: 'old' })
    const onSave = vi.fn()
    const handle = useDebouncedAutoSave({
      delayMs: 500,
      getSnapshot: () => ({ ...state }),
      onScheduled: vi.fn(),
      onSave,
    })

    state.title = 'new'
    await Promise.resolve()
    handle.cancelPending()
    vi.advanceTimersByTime(500)

    expect(onSave).not.toHaveBeenCalled()
    handle.stop()
  })
})
