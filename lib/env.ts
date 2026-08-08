/**
 * Public URL + production cookie helpers (P4-09).
 * Never put service-role or DB passwords in NEXT_PUBLIC_*.
 */

export function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    url: url ?? "",
    anonKey: anonKey ?? "",
    isConfigured: Boolean(url && anonKey),
  };
}

export function assertServerSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local.",
    );
  }

  return { url, anonKey };
}

/**
 * Canonical public app origin (no trailing slash).
 * Prefer NEXT_PUBLIC_APP_URL; APP_URL is an optional server alias.
 */
export function getAppPublicUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "";
  return raw.replace(/\/$/, "");
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/** True when the configured public URL is https (required for Secure cookies in prod). */
export function appUrlIsHttps(): boolean {
  const url = getAppPublicUrl();
  return url.startsWith("https://");
}

/**
 * Merge Supabase cookie options for production HTTPS.
 * Pilots on http://localhost keep default (secure false).
 */
export function withProductionCookieOptions<T extends Record<string, unknown>>(
  options: T | undefined,
): T & { secure?: boolean; sameSite?: "lax" | "strict" | "none" } {
  const base = { ...(options ?? {}) } as T & {
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
  };
  if (isProductionRuntime() && appUrlIsHttps()) {
    base.secure = true;
    if (!base.sameSite) base.sameSite = "lax";
  }
  return base;
}
