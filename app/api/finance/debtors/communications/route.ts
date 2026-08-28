import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  createDebtorCommunication,
  isDebtorChannel,
  listDebtorCommunicationsByClient,
  serializeDebtorCommunication,
} from "@/lib/repos/debtor-communications";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * GET /api/finance/debtors/communications?clientId=
 * POST /api/finance/debtors/communications
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId")?.trim();
    if (!clientId) {
      throw new AuthError("validation", "clientId is required.");
    }

    const rows = await listDebtorCommunicationsByClient(firmId, clientId);
    return jsonOk({
      items: rows.map(serializeDebtorCommunication),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("billing.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as Record<string, unknown>;

    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    if (!clientId) {
      throw new AuthError("validation", "clientId is required.");
    }

    const channel = body.channel;
    if (!isDebtorChannel(channel)) {
      throw new AuthError("validation", "Channel must be phone, email, or in_person.");
    }

    const outcomeNotes =
      typeof body.outcomeNotes === "string" ? body.outcomeNotes : "";
    const loggedAtRaw =
      typeof body.loggedAt === "string" && body.loggedAt.trim()
        ? new Date(body.loggedAt)
        : new Date();
    if (Number.isNaN(loggedAtRaw.getTime())) {
      throw new AuthError("validation", "Invalid loggedAt date.");
    }

    let nextFollowUpAt: Date | null = null;
    if (body.nextFollowUpAt !== undefined && body.nextFollowUpAt !== null && body.nextFollowUpAt !== "") {
      if (typeof body.nextFollowUpAt !== "string") {
        throw new AuthError("validation", "Invalid nextFollowUpAt.");
      }
      nextFollowUpAt = new Date(body.nextFollowUpAt);
      if (Number.isNaN(nextFollowUpAt.getTime())) {
        throw new AuthError("validation", "Invalid nextFollowUpAt.");
      }
    }

    const invoiceId =
      typeof body.invoiceId === "string" && body.invoiceId.trim()
        ? body.invoiceId.trim()
        : null;

    const row = await createDebtorCommunication(firmId, {
      clientId,
      employeeUserId: session.id,
      channel,
      outcomeNotes,
      loggedAt: loggedAtRaw,
      nextFollowUpAt,
      invoiceId,
    });

    await writeAuditLog({
      action: "debtor.communication.create",
      firmId,
      userId: session.id,
      entityType: "debtor_communication",
      entityId: row.id,
      metadata: {
        clientId,
        channel,
        nextFollowUpAt: nextFollowUpAt?.toISOString() ?? null,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ item: serializeDebtorCommunication(row) }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
