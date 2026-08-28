/** Staff web idle session policy (Phase 10). */

const DEFAULT_IDLE_MS = 30 * 60 * 1000;

/**
 * 30 minutes of inactivity by default.
 * Optional `NEXT_PUBLIC_STAFF_IDLE_TIMEOUT_MS` (ms, minimum 60_000) for local smoke only.
 */
export const STAFF_IDLE_TIMEOUT_MS = (() => {
  const raw = process.env.NEXT_PUBLIC_STAFF_IDLE_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_IDLE_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60_000) return DEFAULT_IDLE_MS;
  return Math.floor(n);
})();

export const STAFF_IDLE_CHECK_INTERVAL_MS = 15_000;

/** Throttle high-frequency pointer moves so we do not reset every pixel. */
export const STAFF_IDLE_ACTIVITY_THROTTLE_MS = 5_000;

export const STAFF_IDLE_LOGOUT_REASON = "idle" as const;
