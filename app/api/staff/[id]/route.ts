import { and, eq } from "drizzle-orm";
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";
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
import { tenantFirmId } from "@/lib/tenant/scope";

function parseTickCodes(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) {
    throw new AuthError("validation", "permissionCodes must be an array of tick codes.");
  }
  return raw.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
}

/** Update job title and/or module access ticks. */
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
    };

    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        roleId: users.roleId,
        roleCode: roles.code,
        jobTitle: users.jobTitle,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, id), eq(users.firmId, firmId)))
      .limit(1);
    const target = rows[0];
    if (!target) throw new AuthError("not_found", "User not found.");

    const tickCodes = parseTickCodes(body.permissionCodes);
    let savedTicks: string[] | undefined;

    if (typeof body.jobTitle === "string" || body.jobTitle === null) {
      const jobTitle =
        typeof body.jobTitle === "string" && body.jobTitle.trim()
          ? body.jobTitle.trim()
          : null;
      await db
        .update(users)
        .set({ jobTitle, updatedAt: new Date() })
        .where(and(eq(users.id, id), eq(users.firmId, firmId)));
    }

    if (tickCodes) {
      const existing = await getEffectivePermissionCodes({
        userId: target.id,
        roleId: target.roleId,
        roleCode: target.roleCode,
      });
      const expanded = expandAccessTicks(tickCodes);
      const merged = mergePreservedGrants(expanded, existing);
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
        metadata: { permissionCodes: tickCodes },
        ipOrUserAgent: clientInfo(request),
      });
    }

    return jsonOk({
      user: {
        id: target.id,
        permissionCodes: savedTicks ?? tickCodes,
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
