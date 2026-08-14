import "server-only";

import { count, eq } from "drizzle-orm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getDb, noteDbConnectivityFailure, noteDbConnectivitySuccess } from "@/lib/db";
import { asDatabaseUnavailable } from "@/lib/db/connectivity";
import { firms, roles, users } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/auth/audit";
import {
  normalizeEmail,
  slugifyFirmName,
  validateEmail,
  validatePassword,
} from "@/lib/auth/password";
import { authCurrentUser, loadSessionUser } from "@/lib/auth/session";
import {
  decodeAccessTokenClaims,
  registerStaffSession,
} from "@/lib/auth/staff-sessions";
import { AuthError, type AuthSessionUser, type SetupFirmInput } from "@/lib/auth/types";
import { ensureTrialLicence } from "@/lib/repos/licences";
import {
  clearCachedAuthNeedsSetup,
  getCachedAuthNeedsSetup,
  setCachedAuthNeedsSetup,
} from "@/lib/auth/hot-cache";

/** True when no firm exists yet (bootstrap tenant #1 on empty platform). */
export async function authNeedsSetup(): Promise<boolean> {
  const cached = getCachedAuthNeedsSetup();
  if (cached !== undefined) return cached;

  try {
    const db = getDb();
    const [firmCount] = await db.select({ value: count() }).from(firms);
    noteDbConnectivitySuccess();
    const needs = (firmCount?.value ?? 0) === 0;
    setCachedAuthNeedsSetup(needs);
    return needs;
  } catch (err) {
    const unavailable = asDatabaseUnavailable(err);
    if (unavailable) {
      noteDbConnectivityFailure();
      throw unavailable;
    }
    throw err;
  }
}

async function uniqueFirmSlug(base: string): Promise<string> {
  const db = getDb();
  let slug = base;
  let n = 0;
  for (;;) {
    const existing = await db.select({ id: firms.id }).from(firms).where(eq(firms.slug, slug)).limit(1);
    if (!existing[0]) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

/**
 * Bootstrap tenant #1 when the platform has zero firms (empty database).
 * After this, additional firms are created via platform admin (platformCreateFirm), not this wizard.
 */
export async function authSetupFirm(
  input: SetupFirmInput,
  opts?: { ipOrUserAgent?: string | null },
): Promise<AuthSessionUser> {
  clearCachedAuthNeedsSetup();
  if (!(await authNeedsSetup())) {
    throw new AuthError(
      "setup_complete",
      "Platform bootstrap is complete. Sign in, or contact the platform administrator to register a new firm.",
    );
  }

  const firmName = input.firmName.trim();
  const fullName = input.fullName.trim();
  if (!firmName) throw new AuthError("invalid_firm", "Firm name is required.");
  if (!fullName) throw new AuthError("invalid_name", "Full name is required.");

  const email = validateEmail(input.email);
  validatePassword(input.password);

  const db = getDb();
  const mpRows = await db
    .select()
    .from(roles)
    .where(eq(roles.code, "managing_partner"))
    .limit(1);
  const mpRole = mpRows[0];
  if (!mpRole) {
    throw new AuthError(
      "roles_missing",
      "Managing Partner role not found. Run npm run db:seed:rbac first.",
    );
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    const msg = createError?.message ?? "Could not create auth user.";
    // Avoid confirming whether an email already exists beyond a generic failure when possible.
    throw new AuthError("setup_failed", msg.includes("already") ? "Could not complete setup." : msg);
  }

  const authUserId = created.user.id;
  const slug = await uniqueFirmSlug(slugifyFirmName(firmName));

  try {
    const [firm] = await db
      .insert(firms)
      .values({
        name: firmName,
        slug,
        status: "active",
        isDemo: false,
        defaultCurrency: input.defaultCurrency?.trim() || "USD",
      })
      .returning();

    if (!firm) throw new Error("Firm insert returned no row.");

    await db.insert(users).values({
      id: authUserId,
      firmId: firm.id,
      email,
      fullName,
      roleId: mpRole.id,
      isActive: true,
      lastLoginAt: new Date(),
    });

    await writeAuditLog({
      action: "auth.setup_firm",
      firmId: firm.id,
      userId: authUserId,
      entityType: "firm",
      entityId: firm.id,
      metadata: { email, firmName, slug },
      ipOrUserAgent: opts?.ipOrUserAgent ?? null,
    });

    await ensureTrialLicence(firm.id, {
      issuedBy: "bootstrap",
      notes: "Bootstrap trial licence",
    });
  } catch (err) {
    // Best-effort rollback of auth user if DB failed mid-setup.
    await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    throw err instanceof AuthError
      ? err
      : new AuthError("setup_failed", "Could not complete firm setup.");
  }

  // Establish cookie session for the new user.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (signInError) {
    throw new AuthError(
      "setup_session",
      "Firm created but sign-in failed. Try logging in with your credentials.",
    );
  }

  const session = await loadSessionUser(authUserId);
  if (!session) {
    throw new AuthError("setup_session", "Firm created but session profile is missing.");
  }
  setCachedAuthNeedsSetup(false);
  return session;
}

export async function authLogin(
  emailRaw: string,
  password: string,
  opts?: { ipOrUserAgent?: string | null },
): Promise<AuthSessionUser> {
  const email = normalizeEmail(emailRaw);
  if (!email || !password) {
    throw new AuthError("invalid_credentials", "Email and password are required.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    await writeAuditLog({
      action: "auth.login_failed",
      metadata: { email },
      ipOrUserAgent: opts?.ipOrUserAgent ?? null,
    }).catch(() => undefined);

    throw new AuthError("invalid_credentials", "Invalid email or password.");
  }

  try {
    const profile = await loadSessionUser(data.user.id);
    if (!profile) {
      await supabase.auth.signOut();
      const db = getDb();
      const statusRows = await db
        .select({ status: firms.status, isActive: users.isActive })
        .from(users)
        .innerJoin(firms, eq(users.firmId, firms.id))
        .where(eq(users.id, data.user.id))
        .limit(1);
      const firmStatus = statusRows[0]?.status;
      if (firmStatus === "suspended" || firmStatus === "archived") {
        await writeAuditLog({
          action: "auth.login_failed",
          userId: data.user.id,
          metadata: { email, reason: "firm_disabled", firmStatus },
          ipOrUserAgent: opts?.ipOrUserAgent ?? null,
        }).catch(() => undefined);
        throw new AuthError(
          "forbidden",
          "This firm is suspended. Contact LexZim support.",
        );
      }
      await writeAuditLog({
        action: "auth.login_failed",
        userId: data.user.id,
        metadata: { email, reason: "no_app_user_or_inactive" },
        ipOrUserAgent: opts?.ipOrUserAgent ?? null,
      }).catch(() => undefined);
      throw new AuthError("invalid_credentials", "Invalid email or password.");
    }

    const db = getDb();
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, profile.id));

    const accessToken = data.session?.access_token ?? null;
    const { sessionId } = accessToken
      ? decodeAccessTokenClaims(accessToken)
      : { sessionId: null };
    await registerStaffSession({
      firmId: profile.firm.id,
      userId: profile.id,
      sessionId,
      ipOrUserAgent: opts?.ipOrUserAgent ?? null,
    });

    await writeAuditLog({
      action: "auth.login",
      firmId: profile.firm.id,
      userId: profile.id,
      metadata: { email: profile.email, sessionId },
      ipOrUserAgent: opts?.ipOrUserAgent ?? null,
    });

    noteDbConnectivitySuccess();
    return { ...profile, lastLoginAt: new Date() };
  } catch (err) {
    await supabase.auth.signOut().catch(() => undefined);
    const unavailable = asDatabaseUnavailable(err);
    if (unavailable) {
      noteDbConnectivityFailure();
      throw unavailable;
    }
    throw err;
  }
}

export async function authLogout(opts?: { ipOrUserAgent?: string | null }): Promise<void> {
  // Prefer audit metadata when DB is healthy, but never block Sign out on pooler timeouts.
  const current = await Promise.race([
    authCurrentUser().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
  ]);

  const supabase = await createClient();
  await supabase.auth.signOut();

  if (current) {
    await writeAuditLog({
      action: "auth.logout",
      firmId: current.firm.id,
      userId: current.id,
      metadata: { email: current.email },
      ipOrUserAgent: opts?.ipOrUserAgent ?? null,
    }).catch(() => undefined);
  }
}

export { authCurrentUser, requireSession } from "@/lib/auth/session";
