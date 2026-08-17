import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { clientDisplayName } from "@/lib/clients/display";
import { csvDownloadResponse } from "@/lib/reports/csv";
import { getClientById } from "@/lib/repos/clients";
import { getClientTrustStatement } from "@/lib/repos/trust";
import { serializeTrustLedgerEntry } from "@/lib/trust/serialize";
import { trustStatementToCsv } from "@/lib/trust/statement-csv";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("trust.view");
    const firmId = tenantFirmId(session);
    const { id: clientId } = await context.params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "csv" ? "csv" : "json";

    const client = await getClientById(firmId, clientId);
    if (!client) {
      throw new AuthError("not_found", "Client not found.");
    }

    const statement = await getClientTrustStatement(firmId, clientId);
    const displayName = clientDisplayName(client);
    const currency =
      statement.lines[0]?.entry.currency ?? session.firm.defaultCurrency ?? "USD";

    const lines = statement.lines.map((line) =>
      serializeTrustLedgerEntry(line.entry, {
        accountName: line.accountName,
        matterTitle: line.matterTitle,
        clientDisplayName: displayName,
        runningBalanceCents: line.runningBalanceCents,
      }),
    );

    if (format === "csv") {
      const stamp = new Date().toISOString().slice(0, 10);
      const safeName = displayName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40);
      return csvDownloadResponse(
        `lexzim-trust-statement-${safeName}-${stamp}.csv`,
        trustStatementToCsv(displayName, statement.balanceCents, currency, lines),
      );
    }

    return jsonOk({
      client: {
        id: client.id,
        displayName,
      },
      balanceCents: statement.balanceCents,
      currency,
      lines,
      disclaimer:
        "Trust statement only. Fee invoices and fee payments are not included.",
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
