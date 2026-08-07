import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "@/lib/env";

/**
 * Browser Supabase client (anon key only).
 * Safe to use in Client Components.
 */
export function createClient() {
  const { url, anonKey, isConfigured } = getPublicSupabaseConfig();

  if (!isConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }

  return createBrowserClient(url, anonKey);
}
