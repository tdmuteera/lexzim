/**
 * Short-lived in-memory caches for hot-path auth/RBAC lookups.
 * Survives soft navigations within the same Node process; not a security boundary.
 */
import "server-only";

type CacheEntry<T> = { value: T; expiresAt: number };

const globalStore = globalThis as unknown as {
  lexzimAuthNeedsSetupCache?: CacheEntry<boolean>;
  lexzimRolePermCache?: Map<string, CacheEntry<string[]>>;
  lexzimUserPermCache?: Map<string, CacheEntry<string[] | null>>;
};

const SETUP_TTL_MS = 60_000;
const ROLE_PERMS_TTL_MS = 5 * 60_000;
const USER_PERMS_TTL_MS = 60_000;

export function getCachedAuthNeedsSetup(): boolean | undefined {
  const entry = globalStore.lexzimAuthNeedsSetupCache;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    globalStore.lexzimAuthNeedsSetupCache = undefined;
    return undefined;
  }
  return entry.value;
}

export function setCachedAuthNeedsSetup(value: boolean) {
  globalStore.lexzimAuthNeedsSetupCache = {
    value,
    expiresAt: Date.now() + SETUP_TTL_MS,
  };
}

export function clearCachedAuthNeedsSetup() {
  globalStore.lexzimAuthNeedsSetupCache = undefined;
}

/** Flush in-process auth/RBAC caches owned by this process (P8-12). */
export function flushAuthHotCaches() {
  globalStore.lexzimAuthNeedsSetupCache = undefined;
  globalStore.lexzimRolePermCache = undefined;
  globalStore.lexzimUserPermCache = undefined;
}

export function getCachedRolePermissionCodes(roleId: string): string[] | undefined {
  const map = globalStore.lexzimRolePermCache;
  const entry = map?.get(roleId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    map?.delete(roleId);
    return undefined;
  }
  return entry.value;
}

export function setCachedRolePermissionCodes(roleId: string, codes: string[]) {
  if (!globalStore.lexzimRolePermCache) {
    globalStore.lexzimRolePermCache = new Map();
  }
  globalStore.lexzimRolePermCache.set(roleId, {
    value: codes,
    expiresAt: Date.now() + ROLE_PERMS_TTL_MS,
  });
}

/** Cached per-user grants. `null` means no rows (use role fallback). */
export function getCachedUserPermissionCodes(userId: string): string[] | null | undefined {
  const map = globalStore.lexzimUserPermCache;
  const entry = map?.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    map?.delete(userId);
    return undefined;
  }
  return entry.value;
}

export function setCachedUserPermissionCodes(userId: string, codes: string[] | null) {
  if (!globalStore.lexzimUserPermCache) {
    globalStore.lexzimUserPermCache = new Map();
  }
  globalStore.lexzimUserPermCache.set(userId, {
    value: codes,
    expiresAt: Date.now() + USER_PERMS_TTL_MS,
  });
}

export function clearCachedUserPermissionCodes(userId: string) {
  globalStore.lexzimUserPermCache?.delete(userId);
}
