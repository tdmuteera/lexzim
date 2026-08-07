import "server-only";

import { AiProviderError } from "@/lib/ai/errors";

const TRANSIENT_CODES = new Set(["rate_limited", "network_error", "provider_error"]);

export function isTransientAiError(err: unknown): boolean {
  if (err instanceof AiProviderError) {
    if (err.code === "rate_limited" || err.code === "network_error") return true;
    // Retry 5xx provider errors only.
    if (err.code === "provider_error" && (err.httpStatus ?? 0) >= 500) return true;
    return false;
  }
  return false;
}

/**
 * Retry transient AI provider failures with exponential backoff.
 * Does not retry missing/invalid keys.
 */
export async function withAiRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; baseDelayMs?: number },
): Promise<T> {
  const retries = opts?.retries ?? 2;
  const baseDelayMs = opts?.baseDelayMs ?? 400;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientAiError(err) || attempt >= retries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      attempt += 1;
      await new Promise((r) => setTimeout(r, delay));
      void TRANSIENT_CODES;
    }
  }
}
