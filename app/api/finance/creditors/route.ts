import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { buildCreditorAging, createCreditor, listCreditors } from "@/lib/repos/creditors";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const includeAging = url.searchParams.get("aging") === "1";

    const creditors = await listCreditors(firmId);
    const aging = includeAging ? await buildCreditorAging(firmId) : undefined;

    return jsonOk({
      items: creditors.map((c) => ({
        id: c.id,
        name: c.name,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        defaultExpenseAccountId: c.defaultExpenseAccountId,
        isActive: c.isActive,
      })),
      aging,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    if (!body || typeof body !== "object") {
      throw new AuthError("validation", "Invalid payload.");
    }
    const raw = body as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) throw new AuthError("validation", "Creditor name is required.");

    const creditor = await createCreditor(firmId, {
      name,
      contactEmail: typeof raw.contactEmail === "string" ? raw.contactEmail.trim() || null : null,
      contactPhone: typeof raw.contactPhone === "string" ? raw.contactPhone.trim() || null : null,
      defaultExpenseAccountId:
        typeof raw.defaultExpenseAccountId === "string"
          ? raw.defaultExpenseAccountId.trim() || null
          : null,
    });

    await writeAuditLog({
      action: "creditors.create",
      firmId,
      userId: session.id,
      entityType: "creditor",
      entityId: creditor.id,
      metadata: { name: creditor.name },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ creditor: { id: creditor.id, name: creditor.name } }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
