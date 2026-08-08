import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { clientDisplayName } from "@/lib/clients/display";
import { getClientById } from "@/lib/repos/clients";
import { getClientTrustStatement } from "@/lib/repos/trust";
import { serializeTrustLedgerEntry } from "@/lib/trust/serialize";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("trust.view");
    const firmId = tenantFirmId(session);
    const { id: clientId } = await context.params;

    const client = await getClientById(firmId, clientId);
    if (!client) {
      throw new AuthError("not_found", "Client not found.");
    }

    const statement = await getClientTrustStatement(firmId, clientId);

    return jsonOk({
      client: {
        id: client.id,
        displayName: clientDisplayName(client),
      },
      balanceCents: statement.balanceCents,
      currency: statement.lines[0]?.entry.currency ?? session.firm.defaultCurrency ?? "USD",
      lines: statement.lines.map((l) =>
        serializeTrustLedgerEntry(l.entry, {
          accountName: l.accountName,
          matterTitle: l.matterTitle,
          clientDisplayName: clientDisplayName(client),
          runningBalanceCents: l.runningBalanceCents,
        }),
      ),
      disclaimer:
        "Trust statement only. Fee invoices and fee payments are not included.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
