import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertServerSupabaseEnv, withProductionCookieOptions } from "@/lib/env";

/**
 * Server Supabase client for Server Components, Route Handlers, and Server Actions.
 * Uses the anon key + cookie session (user-scoped).
 */
export async function createClient() {
  const { url, anonKey } = assertServerSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, withProductionCookieOptions(options));
          });
        } catch {
          // Called from a Server Component where cookies are read-only — safe to ignore.
          // Proxy (`proxy.ts`) refreshes the session cookies for the browser.
        }
      },
    },
  });
}
