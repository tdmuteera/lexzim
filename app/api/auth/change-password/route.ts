import { eq } from "drizzle-orm";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { writeAuditLog } from "@/lib/auth/audit";
import { validatePassword } from "@/lib/auth/password";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Self-service password change for the signed-in user. Clears the
 * must_change_password flag (used after a temp password is issued).
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = (await request.json()) as { newPassword?: string };
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    validatePassword(newPassword);

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(session.id, {
      password: newPassword,
    });
    if (error) {
      throw new AuthError("validation", "Could not update the password.");
    }

    const db = getDb();
    await db
      .update(users)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, session.id));

    await writeAuditLog({
      action: "auth.password_changed",
      firmId: session.firm.id,
      userId: session.id,
      entityType: "user",
      entityId: session.id,
      metadata: { email: session.email },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ changed: true });
  } catch (err) {
    return jsonError(err);
  }
}
