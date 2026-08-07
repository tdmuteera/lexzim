import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { serializeTemplate } from "@/lib/templates/serialize";
import { TEMPLATE_DISCLAIMER, TEMPLATE_MERGE_FIELDS } from "@/lib/templates/fields";
import { seedStarterTemplates } from "@/lib/templates/seed-starters";
import { listTemplates } from "@/lib/repos/templates";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("templates.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const areaOfLaw = url.searchParams.get("areaOfLaw") ?? undefined;
    const activeOnly = url.searchParams.get("activeOnly") !== "0";
    const approvedOnly = url.searchParams.get("approvedOnly") === "1";

    const rows = await listTemplates(firmId, {
      q,
      areaOfLaw: areaOfLaw || undefined,
      activeOnly,
      approvedOnly,
    });

    return jsonOk({
      items: rows.map((row) =>
        serializeTemplate(row, {
          createdByName: row.createdByName,
          approvedByName: row.approvedByName,
        }),
      ),
      mergeFields: TEMPLATE_MERGE_FIELDS,
      disclaimer: TEMPLATE_DISCLAIMER,
    });
  } catch (err) {
    return jsonError(err);
  }
}

/** Seed Family/Civil/Labour starter placeholders for the current firm. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("templates.manage");
    const firmId = tenantFirmId(session);
    const result = await seedStarterTemplates(firmId, session.id);

    await writeAuditLog({
      action: "templates.seed_starters",
      firmId,
      userId: session.id,
      entityType: "template",
      metadata: result,
      ipOrUserAgent: clientInfo(request),
    });

    const rows = await listTemplates(firmId, { activeOnly: true });
    return jsonOk({
      ...result,
      items: rows.map((row) =>
        serializeTemplate(row, {
          createdByName: row.createdByName,
          approvedByName: row.approvedByName,
        }),
      ),
    });
  } catch (err) {
    return jsonError(err);
  }
}
