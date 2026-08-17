import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { disableGlAccount, getGlAccount, updateGlAccount } from "@/lib/gl/accounts";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("finance.gl.post");
    const firmId = tenantFirmId(session);
    const { id } = await params;
    const body = await request.json();
    if (!body || typeof body !== "object") {
      throw new AuthError("validation", "Invalid payload.");
    }
    const raw = body as Record<string, unknown>;

    const account = await updateGlAccount(firmId, id, {
      ...(typeof raw.name === "string" ? { name: raw.name } : {}),
      ...(raw.description !== undefined
        ? { description: typeof raw.description === "string" ? raw.description : null }
        : {}),
      ...(typeof raw.isActive === "boolean" ? { isActive: raw.isActive } : {}),
      ...(raw.parentId !== undefined
        ? { parentId: typeof raw.parentId === "string" ? raw.parentId : null }
        : {}),
    });

    await writeAuditLog({
      action: "gl.accounts.update",
      firmId,
      userId: session.id,
      entityType: "gl_account",
      entityId: account.id,
      metadata: { code: account.code },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ account });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("finance.gl.post");
    const firmId = tenantFirmId(session);
    const { id } = await params;
    const existing = await getGlAccount(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Account not found.");
    }
    const account = await disableGlAccount(firmId, id);

    await writeAuditLog({
      action: "gl.accounts.disable",
      firmId,
      userId: session.id,
      entityType: "gl_account",
      entityId: account.id,
      metadata: { code: account.code },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ account });
  } catch (err) {
    return jsonError(err, request);
  }
}
