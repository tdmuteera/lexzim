import { AuthError } from "@/lib/auth/types";
import type { AuthSessionUser } from "@/lib/auth/types";
import { canViewAllMatters } from "@/lib/rbac/permissions";
import { userCanAccessMatter } from "@/lib/repos/matters";

/** Server-side: invoice matter must be accessible to the session user. */
export async function assertInvoiceMatterAccess(
  session: AuthSessionUser,
  firmId: string,
  matterId: string,
): Promise<void> {
  const viewAll = canViewAllMatters(session);
  const allowed = await userCanAccessMatter(
    firmId,
    matterId,
    session.id,
    viewAll,
  );
  if (!allowed) {
    throw new AuthError(
      "forbidden",
      "You do not have access to this invoice matter.",
    );
  }
}
