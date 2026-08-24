import { and, eq, ne } from "drizzle-orm";
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { requireSession } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/types";
import { validateEmail } from "@/lib/auth/password";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    return jsonOk({
      profile: {
        fullName: session.fullName,
        email: session.email,
        jobTitle: session.jobTitle ?? null,
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const db = getDb();
    const body = (await request.json()) as {
      fullName?: string;
      email?: string;
      jobTitle?: string | null;
    };

    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (!fullName) {
      throw new AuthError("validation", "Full name is required.");
    }

    const email = validateEmail(body.email ?? session.email);
    const jobTitle =
      typeof body.jobTitle === "string" && body.jobTitle.trim() ? body.jobTitle.trim() : null;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.firmId, session.firm.id), ne(users.id, session.id), eq(users.email, email)))
      .limit(1);
    if (existing.length) {
      throw new AuthError("validation", "That email is already used by another user in this firm.");
    }

    const admin = createAdminClient();
    const authUpdate = await admin.auth.admin.updateUserById(session.id, {
      email,
      user_metadata: { full_name: fullName },
      email_confirm: true,
    });
    if (authUpdate.error) {
      throw new AuthError("validation", authUpdate.error.message || "Could not update auth email.");
    }

    await db
      .update(users)
      .set({
        fullName,
        email,
        jobTitle,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.id));

    await writeAuditLog({
      action: "users.profile_update",
      firmId: session.firm.id,
      userId: session.id,
      entityType: "user",
      entityId: session.id,
      metadata: {
        fullName,
        email,
        jobTitle,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      profile: { fullName, email, jobTitle },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
