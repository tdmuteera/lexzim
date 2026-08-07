import "server-only";

import type { AuthSessionUser } from "@/lib/auth/types";

/**
 * Firm id for tenant-scoped queries. Always from session, never trust client-only input.
 */
export function tenantFirmId(session: AuthSessionUser): string {
  return session.firm.id;
}

/** Storage path prefix for firm documents (Supabase Storage, Phase 1+). */
export function firmStoragePrefix(firmId: string): string {
  return `firms/${firmId}`;
}
