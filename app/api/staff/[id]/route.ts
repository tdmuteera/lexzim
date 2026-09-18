import { and, eq, ne } from "drizzle-orm";
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { validateEmail } from "@/lib/auth/password";
import { getDb } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";
import {
  getPrimaryCommunicationEmail,
  listNotifyEmailsForUser,
  setCommunicationEmails,
  setPrimaryCommunicationEmail,
} from "@/lib/repos/staff-communication-emails";
import { requirePermission } from "@/lib/rbac/guards";
import {
  getEffectivePermissionCodes,
  replaceUserPermissionCodes,
} from "@/lib/rbac/repository";
import {
  expandAccessTicks,
  mergePreservedGrants,
  navTicksFromGrants,
} from "@/lib/rbac/access-ticks";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseTickCodes(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) {
    throw new AuthError("validation", "permissionCodes must be an array of tick codes.");
  }
  return raw.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
}

/** Update job title, emails, and/or module access ticks. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = (await request.json()) as {
      jobTitle?: string | null;
      permissionCodes?: unknown;
      isLawyer?: boolean;
      email?: string;
      communicationEmail?: string | null;
      communicationEmails?: unknown;
    };

    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        roleId: users.roleId,
        roleCode: roles.code,
        jobTitle: users.jobTitle,
        isLawyer: users.isLawyer,
        isSystemUser: users.isSystemUser,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, id), eq(users.firmId, firmId)))
      .limit(1);
    const target = rows[0];
    if (!target) throw new AuthError("not_found", "User not found.");

    const tickCodes = parseTickCodes(body.permissionCodes);
    let savedTicks: string[] | undefined;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    let nextEmail = target.email;

    if (typeof body.jobTitle === "string" || body.jobTitle === null) {
      patch.jobTitle =
        typeof body.jobTitle === "string" && body.jobTitle.trim()
          ? body.jobTitle.trim()
          : null;
    }
    if (typeof body.isLawyer === "boolean") {
      patch.isLawyer = body.isLawyer;
    }

    if (typeof body.email === "string" && body.email.trim()) {
      if (!target.isSystemUser) {
        throw new AuthError(
          "validation",
          "Directory people (no login) do not have a login email to change here.",
        );
      }
      nextEmail = validateEmail(body.email);
      if (nextEmail !== target.email) {
        const conflict = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.firmId, firmId), ne(users.id, id), eq(users.email, nextEmail)))
          .limit(1);
        if (conflict[0]) {
          throw new AuthError(
            "validation",
            "That email is already used by another user in this firm.",
          );
        }
        const admin = createAdminClient();
        const authUpdate = await admin.auth.admin.updateUserById(id, {
          email: nextEmail,
          email_confirm: true,
        });
        if (authUpdate.error) {
          throw new AuthError(
            "validation",
            authUpdate.error.message || "Could not update login email.",
          );
        }
        patch.email = nextEmail;
      }
    }

    if (Object.keys(patch).length > 1) {
      await db
        .update(users)
        .set(patch)
        .where(and(eq(users.id, id), eq(users.firmId, firmId)));
    }

    let communicationEmails = target.isSystemUser
      ? await listNotifyEmailsForUser(firmId, id)
      : [];
    let communicationEmail =
      communicationEmails[0] ||
      (await getPrimaryCommunicationEmail(firmId, id)) ||
      nextEmail;

    const emailsFromBody = Array.isArray(body.communicationEmails)
      ? body.communicationEmails.filter(
          (e): e is string => typeof e === "string" && e.trim().length > 0,
        )
      : null;

    if (emailsFromBody) {
      if (!target.isSystemUser) {
        throw new AuthError(
          "validation",
          "Directory people (no login) do not receive system notification emails.",
        );
      }
      const saved = await setCommunicationEmails(firmId, id, emailsFromBody);
      communicationEmails = saved.emails;
      communicationEmail = saved.primary;
    } else if (typeof body.communicationEmail === "string") {
      if (!target.isSystemUser) {
        throw new AuthError(
          "validation",
          "Directory people (no login) do not receive system notification emails.",
        );
      }
      if (body.communicationEmail.trim()) {
        const row = await setPrimaryCommunicationEmail(
          firmId,
          id,
          body.communicationEmail,
        );
        communicationEmail = row.email;
        communicationEmails = await listNotifyEmailsForUser(firmId, id);
      }
    }

    if (tickCodes) {
      if (!target.isSystemUser) {
        throw new AuthError(
          "validation",
          "Directory people (no login) do not have module access ticks.",
        );
      }
      const existing = await getEffectivePermissionCodes({
        userId: target.id,
        roleId: target.roleId,
        roleCode: target.roleCode,
        firmId,
        includeDelegations: false,
      });
      const expanded = expandAccessTicks(tickCodes);
      const merged = mergePreservedGrants(expanded, existing);
      const watched = [
        "clients.view_all",
        "finance.view_all_client_accounts",
      ] as const;
      const beforeWatch = Object.fromEntries(
        watched.map((code) => [code, existing.includes(code)]),
      );
      const afterWatch = Object.fromEntries(
        watched.map((code) => [code, merged.includes(code)]),
      );
      await replaceUserPermissionCodes({
        userId: target.id,
        firmId,
        codes: merged,
        actorUserId: session.id,
        targetRoleCode: target.roleCode,
      });
      savedTicks = navTicksFromGrants(merged);
      await writeAuditLog({
        action: "users.access_update",
        firmId,
        userId: session.id,
        entityType: "user",
        entityId: target.id,
        metadata: {
          permissionCodes: tickCodes,
          visibilityGrantsBefore: beforeWatch,
          visibilityGrantsAfter: afterWatch,
        },
        ipOrUserAgent: clientInfo(request),
      });
    }

    if (typeof body.isLawyer === "boolean") {
      await writeAuditLog({
        action: "users.lawyer_flag_update",
        firmId,
        userId: session.id,
        entityType: "user",
        entityId: target.id,
        metadata: { isLawyer: body.isLawyer },
        ipOrUserAgent: clientInfo(request),
      });
    }

    if (
      patch.email ||
      typeof body.communicationEmail === "string" ||
      emailsFromBody
    ) {
      await writeAuditLog({
        action: "users.email_update",
        firmId,
        userId: session.id,
        entityType: "user",
        entityId: target.id,
        metadata: {
          email: nextEmail,
          communicationEmail,
          communicationEmails,
          byAdmin: true,
        },
        ipOrUserAgent: clientInfo(request),
      });
    }

    return jsonOk({
      user: {
        id: target.id,
        email: nextEmail,
        communicationEmail,
        communicationEmails,
        permissionCodes: savedTicks ?? tickCodes,
        isLawyer:
          typeof body.isLawyer === "boolean" ? body.isLawyer : target.isLawyer,
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
