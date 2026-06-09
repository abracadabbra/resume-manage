export type SyncDecision = 'use-cloud' | 'keep-local' | 'conflict'

export interface SyncConflict {
  localUpdatedAt: number
  cloudUpdatedAt: number
  lastSyncedAt: number | null
}

export interface SyncDecisionInput {
  localUpdatedAt: number | null | undefined
  cloudUpdatedAt: number | null | undefined
  lastSyncedAt: number | null | undefined
}

function normalizeTimestamp(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function decideSyncDecision(input: SyncDecisionInput): SyncDecision {
  const localUpdatedAt = normalizeTimestamp(input.localUpdatedAt)
  const cloudUpdatedAt = normalizeTimestamp(input.cloudUpdatedAt)
  const lastSyncedAt = typeof input.lastSyncedAt === 'number' && Number.isFinite(input.lastSyncedAt)
    ? input.lastSyncedAt
    : null

  if (lastSyncedAt === null) {
    if (cloudUpdatedAt === 0) return 'keep-local'
    return cloudUpdatedAt >= localUpdatedAt ? 'use-cloud' : 'keep-local'
  }

  const localChanged = localUpdatedAt > lastSyncedAt
  const cloudChanged = cloudUpdatedAt > lastSyncedAt

  if (localChanged && cloudChanged) return 'conflict'
  if (cloudChanged) return 'use-cloud'
  return 'keep-local'
}

export function createSyncConflict(input: SyncDecisionInput): SyncConflict {
  return {
    localUpdatedAt: normalizeTimestamp(input.localUpdatedAt),
    cloudUpdatedAt: normalizeTimestamp(input.cloudUpdatedAt),
    lastSyncedAt: typeof input.lastSyncedAt === 'number' && Number.isFinite(input.lastSyncedAt)
      ? input.lastSyncedAt
      : null,
  }
}
