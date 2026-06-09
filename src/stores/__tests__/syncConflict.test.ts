import { describe, expect, it } from 'vitest'

import { createSyncConflict, decideSyncDecision } from '@/stores/syncConflict'

describe('syncConflict', () => {
  it('uses cloud on first sync when cloud is at least as fresh as local', () => {
    expect(decideSyncDecision({
      localUpdatedAt: 100,
      cloudUpdatedAt: 200,
      lastSyncedAt: null,
    })).toBe('use-cloud')
  })

  it('keeps local on first sync when local is fresher', () => {
    expect(decideSyncDecision({
      localUpdatedAt: 300,
      cloudUpdatedAt: 200,
      lastSyncedAt: null,
    })).toBe('keep-local')
  })

  it('detects conflict when both local and cloud changed after last sync', () => {
    expect(decideSyncDecision({
      localUpdatedAt: 300,
      cloudUpdatedAt: 400,
      lastSyncedAt: 200,
    })).toBe('conflict')
  })

  it('uses cloud when only cloud changed after last sync', () => {
    expect(decideSyncDecision({
      localUpdatedAt: 200,
      cloudUpdatedAt: 400,
      lastSyncedAt: 200,
    })).toBe('use-cloud')
  })

  it('keeps local when only local changed after last sync', () => {
    expect(decideSyncDecision({
      localUpdatedAt: 400,
      cloudUpdatedAt: 200,
      lastSyncedAt: 200,
    })).toBe('keep-local')
  })

  it('normalizes conflict timestamps for display/state', () => {
    expect(createSyncConflict({
      localUpdatedAt: 300,
      cloudUpdatedAt: 400,
      lastSyncedAt: 200,
    })).toEqual({
      localUpdatedAt: 300,
      cloudUpdatedAt: 400,
      lastSyncedAt: 200,
    })
  })
})
