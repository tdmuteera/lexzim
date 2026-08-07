import type { ClientAuthSession } from "@/lib/rbac/permissions";
import type { AuthSessionUser } from "@/lib/auth/types";
import { initialsFromName } from "@/lib/utils/name";

export const PLATFORM_PRODUCT_NAME = "LexZim";

export type FirmBranding = {
  /** Tenant display name (e.g. T Pfigu Attorneys). */
  displayName: string;
  /** Product/platform name (LexZim). */
  platformName: string;
  /** Sidebar / mark initials derived from firm name. */
  logoInitials: string;
  logoUrl: string | null;
  tagline: string;
  isDemo: boolean;
  status: string;
};

export function getFirmBranding(
  session: AuthSessionUser | ClientAuthSession | null,
): FirmBranding {
  const displayName = session?.firm.name ?? PLATFORM_PRODUCT_NAME;
  return {
    displayName,
    platformName: PLATFORM_PRODUCT_NAME,
    logoInitials: initialsFromName(displayName),
    logoUrl: session?.firm.logoUrl ?? null,
    tagline: session?.firm.isDemo ? "Demo workspace" : "Practice Platform",
    isDemo: session?.firm.isDemo ?? false,
    status: session?.firm.status ?? "active",
  };
}

export function welcomeLine(branding: FirmBranding): string {
  return `Welcome to ${branding.displayName}`;
}
