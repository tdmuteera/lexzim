import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  createDelegationGrant,
  DELEGATION_CAPABILITIES,
  listDelegationGrants,
  revokeDelegationGrant,
} from "@/lib/rbac/delegation";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** GET: list grants. POST: create. DELETE: revoke (body.grantId). users.manage only. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("activeOnly") !== "0";
    const items = await listDelegationGrants(firmId, { activeOnly });
    return jsonOk({
      items,
      capabilities: DELEGATION_CAPABILITIES,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      granteeUserId?: string;
      capability?: string;
      expiresAt?: string | null;
    };
    if (!body.granteeUserId?.trim() || !body.capability?.trim()) {
      throw new AuthError("validation", "granteeUserId and capability are required.");
    }
    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const d = new Date(body.expiresAt);
      if (Number.isNaN(d.getTime())) {
        throw new AuthError("validation", "expiresAt must be a valid date.");
      }
      if (d.getTime() <= Date.now()) {
        throw new AuthError("validation", "expiresAt must be in the future.");
      }
      expiresAt = d;
    }

    const row = await createDelegationGrant({
      firmId,
      grantorUserId: session.id,
      granteeUserId: body.granteeUserId.trim(),
      capability: body.capability.trim(),
      expiresAt,
    });

    await writeAuditLog({
      action: "delegation.grant",
      firmId,
      userId: session.id,
      entityType: "delegation_grant",
      entityId: row.id,
      metadata: {
        granteeUserId: row.granteeUserId,
        capability: row.capability,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ grant: { id: row.id, capability: row.capability } });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as { grantId?: string };
    if (!body.grantId?.trim()) {
      throw new AuthError("validation", "grantId is required.");
    }
    const row = await revokeDelegationGrant({
      firmId,
      grantId: body.grantId.trim(),
      actorUserId: session.id,
    });

    await writeAuditLog({
      action: "delegation.revoke",
      firmId,
      userId: session.id,
      entityType: "delegation_grant",
      entityId: row.id,
      metadata: {
        granteeUserId: row.granteeUserId,
        capability: row.capability,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ revoked: true, id: row.id });
  } catch (err) {
    return jsonError(err, request);
  }
}
