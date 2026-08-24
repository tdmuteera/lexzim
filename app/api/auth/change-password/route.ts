import { eq } from "drizzle-orm";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { writeAuditLog } from "@/lib/auth/audit";
import { validatePassword } from "@/lib/auth/password";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { assertServerSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Self-service password change for any signed-in user (including Managing Partner).
 * When must_change_password is set (temp password), currentPassword is optional.
 * Otherwise currentPassword is required.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = (await request.json()) as {
      newPassword?: string;
      currentPassword?: string;
    };
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    validatePassword(newPassword);

    if (!session.mustChangePassword) {
      if (!currentPassword) {
        throw new AuthError(
          "validation",
          "Enter your current password to set a new one.",
        );
      }
      const { url, anonKey } = assertServerSupabaseEnv();
      const verifier = createSupabaseClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: verifyError } = await verifier.auth.signInWithPassword({
        email: session.email,
        password: currentPassword,
      });
      if (verifyError) {
        throw new AuthError("unauthorized", "Current password is incorrect.");
      }
      await verifier.auth.signOut().catch(() => undefined);
    }

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
      metadata: {
        email: session.email,
        forced: Boolean(session.mustChangePassword),
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ changed: true });
  } catch (err) {
    return jsonError(err, request);
  }
}
