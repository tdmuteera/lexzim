import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { isMissingRelationError } from "@/lib/db/missing-relation";
import { isProformaKind, isProformaStatus } from "@/lib/proforma/types";
import { serializeProformaDetail, serializeProformaListItem } from "@/lib/proforma/serialize";
import { parseCreateProformaInput } from "@/lib/proforma/validation";
import { createFirmTask } from "@/lib/repos/firm-tasks";
import { createProforma, getProforma, listProformas } from "@/lib/repos/proformas";
import { requireAny, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

const MIGRATION_HINT =
  "Pro forma tables are missing on this database. Run npm run db:migrate (migration 0050_pro_formas / 0051_proforma_money_class), then refresh.";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const statusRaw = url.searchParams.get("status");
    const status = statusRaw && isProformaStatus(statusRaw) ? statusRaw : undefined;
    const kindRaw = url.searchParams.get("kind");
    const kind = kindRaw && isProformaKind(kindRaw) ? kindRaw : undefined;
    const clientId = url.searchParams.get("clientId")?.trim() || undefined;

    try {
      const rows = await listProformas(firmId, { status, kind, clientId });
      return jsonOk({ items: rows.map(serializeProformaListItem), migrationNeeded: false });
    } catch (err) {
      if (isMissingRelationError(err)) {
        return jsonOk({ items: [], migrationNeeded: true, migrationHint: MIGRATION_HINT });
      }
      throw err;
    }
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAny(["finance.quote.manage", "billing.manage"]);
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseCreateProformaInput(body);

    let created;
    try {
      created = await createProforma(
        firmId,
        session.id,
        input,
        session.firm.defaultCurrency || "USD",
      );
    } catch (err) {
      if (isMissingRelationError(err)) {
        throw new AuthError("validation", MIGRATION_HINT);
      }
      throw err;
    }

    const row = await getProforma(firmId, created.id);
    if (!row) throw new AuthError("server", "Pro forma created but could not reload.");

    const clientLabel = row.clientDisplayLabel;
    try {
      await createFirmTask(firmId, session.id, {
        title: `Pro forma ${created.proformaNumber} — ${clientLabel}`,
        description: [
          row.proforma.subject,
          `Kind: ${created.kind}`,
          created.conveyancingCategory
            ? `Category: ${created.conveyancingCategory}`
            : null,
          `Open: /finance/proforma/${created.id}`,
        ]
          .filter(Boolean)
          .join("\n"),
        assigneeUserId: session.id,
        priority: "normal",
      });
    } catch {
      // Task creation must not block saving the estimate.
    }

    await writeAuditLog({
      action: "proformas.create",
      firmId,
      userId: session.id,
      entityType: "pro_forma",
      entityId: created.id,
      metadata: {
        proformaNumber: created.proformaNumber,
        kind: created.kind,
        conveyancingCategory: created.conveyancingCategory,
        clientId: created.clientId,
      },
      ipOrUserAgent: clientInfo(request),
    }).catch(() => undefined);

    return jsonOk({ proforma: serializeProformaDetail(row) }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
