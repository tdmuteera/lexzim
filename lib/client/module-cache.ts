/**
 * Client-side short TTL cache for module GET JSON payloads.
 * Lets revisiting Dashboard / Reminders / etc. paint instantly while refreshing.
 */
type Entry = { at: number; data: unknown };

const store = new Map<string, Entry>();
const DEFAULT_TTL_MS = 30_000;

export function getModuleCache<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > ttlMs) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setModuleCache(key: string, data: unknown) {
  store.set(key, { at: Date.now(), data });
}

export function invalidateModuleCache(key?: string) {
  if (key) store.delete(key);
  else store.clear();
}
