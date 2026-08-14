import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { createFirmHoliday, listFirmHolidays } from "@/lib/repos/crm";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseDate(value: unknown, label: string): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw new AuthError("validation", `${label} is required.`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `${label} is invalid.`);
  }
  return d;
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("crm.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const yearRaw = url.searchParams.get("year");
    const year = yearRaw ? Number(yearRaw) : new Date().getFullYear();

    const rows = await listFirmHolidays(firmId, Number.isInteger(year) ? year : undefined);
    return jsonOk({
      items: rows.map((r) => ({
        id: r.id,
        holidayDate: r.holidayDate.toISOString(),
        name: r.name,
        country: r.country,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("crm.manage");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    if (!body || typeof body !== "object") {
      throw new AuthError("validation", "Invalid payload.");
    }
    const raw = body as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) throw new AuthError("validation", "Holiday name is required.");

    const holiday = await createFirmHoliday(firmId, session.id, {
      holidayDate: parseDate(raw.holidayDate, "Holiday date"),
      name,
      country: typeof raw.country === "string" ? raw.country : "ZW",
    });

    await writeAuditLog({
      action: "crm.holidays.create",
      firmId,
      userId: session.id,
      entityType: "firm_holiday",
      entityId: holiday.id,
      metadata: { name: holiday.name },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      {
        holiday: {
          id: holiday.id,
          holidayDate: holiday.holidayDate.toISOString(),
          name: holiday.name,
          country: holiday.country,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err);
  }
}
