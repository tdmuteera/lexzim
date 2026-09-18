import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { listLeaveTypes, createLeaveType } from "@/lib/repos/hr-leave";
import { hasPermission, requireAny, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * GET /api/hr/leave-types
 * POST /api/hr/leave-types { code, name, isPaid }
 */
export async function GET(request: Request) {
  try {
    const session = await requireAny(["hr.leave.request", "hr.view"]);
    const firmId = tenantFirmId(session);
    const types = await listLeaveTypes(firmId, {
      activeOnly: !hasPermission(session, "hr.view"),
    });
    return jsonOk({
      items: types.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        isPaid: t.isPaid,
        isActive: t.isActive,
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("hr.manage");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    if (!body || typeof body !== "object") {
      throw new AuthError("validation", "Invalid request body.");
    }
    const raw = body as Record<string, unknown>;
    const code = typeof raw.code === "string" ? raw.code.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!code || !name) {
      throw new AuthError("validation", "code and name are required.");
    }
    const isPaid = raw.isPaid === undefined ? true : Boolean(raw.isPaid);

    const type = await createLeaveType(firmId, { code, name, isPaid });
    return jsonOk(
      {
        type: {
          id: type.id,
          code: type.code,
          name: type.name,
          isPaid: type.isPaid,
          isActive: type.isActive,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
