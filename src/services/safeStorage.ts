export interface JsonStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface LoadJsonResult<T> {
  value: T
  error: unknown | null
}

export function loadJson<T>(
  storage: Pick<JsonStorage, 'getItem'>,
  key: string,
  fallback: T,
): LoadJsonResult<T> {
  const raw = storage.getItem(key)
  if (!raw) {
    return { value: fallback, error: null }
  }

  try {
    return { value: JSON.parse(raw) as T, error: null }
  } catch (error) {
    return { value: fallback, error }
  }
}

export function saveJson(
  storage: Pick<JsonStorage, 'setItem'>,
  key: string,
  value: unknown,
): boolean {
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeJson(storage: Pick<JsonStorage, 'removeItem'>, key: string): boolean {
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}
