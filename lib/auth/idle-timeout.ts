/** Staff web idle + absolute session policy (Phase 10 / bookmark return). */

const DEFAULT_IDLE_MS = 30 * 60 * 1000;
const DEFAULT_ABSOLUTE_MS = 2 * 24 * 60 * 60 * 1000;

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

/**
 * Hard cap from login / session create: re-authenticate after this even if busy.
 * Optional `NEXT_PUBLIC_STAFF_SESSION_ABSOLUTE_MS` (ms, minimum 1 hour).
 */
export const STAFF_SESSION_ABSOLUTE_MAX_MS = (() => {
  const raw = process.env.NEXT_PUBLIC_STAFF_SESSION_ABSOLUTE_MS?.trim();
  if (!raw) return DEFAULT_ABSOLUTE_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60 * 60 * 1000) return DEFAULT_ABSOLUTE_MS;
  return Math.floor(n);
})();

/** How often the browser may ping the server to refresh last-seen. */
export const STAFF_ACTIVITY_PING_MIN_MS = 60_000;

export const STAFF_IDLE_CHECK_INTERVAL_MS = 15_000;

/** Throttle high-frequency pointer moves so we do not reset every pixel. */
export const STAFF_IDLE_ACTIVITY_THROTTLE_MS = 5_000;

export const STAFF_IDLE_LOGOUT_REASON = "idle" as const;
export const STAFF_EXPIRED_LOGOUT_REASON = "expired" as const;

export type StaffLogoutReason =
  | typeof STAFF_IDLE_LOGOUT_REASON
  | typeof STAFF_EXPIRED_LOGOUT_REASON;
