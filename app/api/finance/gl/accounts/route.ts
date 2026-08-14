import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  createGlAccount,
  ensureCoaSeeded,
  listGlAccounts,
} from "@/lib/gl/accounts";
import type { GlAccountType, GlNormalBalance } from "@/lib/gl/types";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function serializeAccount(a: {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  isActive: boolean;
  isSystem: boolean;
  normalBalance: string;
  description: string | null;
}) {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    parentId: a.parentId,
    isActive: a.isActive,
    isSystem: a.isSystem,
    normalBalance: a.normalBalance,
    description: a.description,
  };
}

export async function GET() {
  try {
    const session = await requirePermission("finance.gl.view");
    const firmId = tenantFirmId(session);
    await ensureCoaSeeded(firmId);
    const accounts = await listGlAccounts(firmId);
    return jsonOk({ items: accounts.map(serializeAccount) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.gl.post");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    if (!body || typeof body !== "object") {
      throw new AuthError("validation", "Invalid payload.");
    }
    const raw = body as Record<string, unknown>;
    const type = raw.type as GlAccountType;
    const normalBalance = raw.normalBalance as GlNormalBalance;
    if (!type || !normalBalance) {
      throw new AuthError("validation", "type and normalBalance are required.");
    }
    const account = await createGlAccount(firmId, {
      code: String(raw.code ?? ""),
      name: String(raw.name ?? ""),
      type,
      parentId: typeof raw.parentId === "string" ? raw.parentId : null,
      normalBalance,
      description: typeof raw.description === "string" ? raw.description : null,
    });

    await writeAuditLog({
      action: "gl.accounts.create",
      firmId,
      userId: session.id,
      entityType: "gl_account",
      entityId: account.id,
      metadata: { code: account.code, name: account.name },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ account: serializeAccount(account) }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
