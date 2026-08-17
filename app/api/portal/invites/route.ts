import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { invitePortalUser } from "@/lib/portal/auth";
import { isPortalEnabled } from "@/lib/portal/config";
import { getDb } from "@/lib/db";
import { portalUsers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAny } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** List portal users for the firm (staff). */
export async function GET(request: Request) {
  try {
    if (!isPortalEnabled()) {
      throw new AuthError("portal_disabled", "Client portal is disabled.");
    }
    const session = await requireAny(["clients.edit", "clients.create"]);
    const firmId = tenantFirmId(session);
    const db = getDb();
    const rows = await db
      .select({
        id: portalUsers.id,
        email: portalUsers.email,
        fullName: portalUsers.fullName,
        clientId: portalUsers.clientId,
        isActive: portalUsers.isActive,
        invitedAt: portalUsers.invitedAt,
        lastLoginAt: portalUsers.lastLoginAt,
        hasPassword: portalUsers.passwordHash,
      })
      .from(portalUsers)
      .where(eq(portalUsers.firmId, firmId));

    return jsonOk({
      items: rows.map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.fullName,
        clientId: r.clientId,
        isActive: r.isActive,
        invitedAt: r.invitedAt.toISOString(),
        lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
        hasPassword: Boolean(r.hasPassword),
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * Invite / upsert a portal user for a client.
 * Body: { clientId, email, fullName, password?, createMagicLink? }
 */
export async function POST(request: Request) {
  try {
    if (!isPortalEnabled()) {
      throw new AuthError("portal_disabled", "Client portal is disabled.");
    }
    const session = await requireAny(["clients.edit", "clients.create"]);
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      clientId?: string;
      email?: string;
      fullName?: string;
      password?: string;
      createMagicLink?: boolean;
    };

    if (!body.clientId?.trim()) {
      throw new AuthError("validation", "clientId is required.");
    }

    const result = await invitePortalUser({
      firmId,
      clientId: body.clientId.trim(),
      email: body.email ?? "",
      fullName: body.fullName ?? "",
      password: body.password,
      invitedByUserId: session.id,
      createMagicLink: body.createMagicLink,
    });

    await writeAuditLog({
      action: "portal.invite_api",
      firmId,
      userId: session.id,
      entityType: "portal_user",
      entityId: result.portalUserId,
      metadata: { email: result.email },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(result);
  } catch (err) {
    return jsonError(err, request);
  }
}
