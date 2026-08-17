import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  getFirmProfile,
  updateFirmProfile,
} from "@/lib/repos/firm-profile";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const profile = await getFirmProfile(firmId);
    if (!profile) throw new AuthError("not_found", "Firm not found.");
    return jsonOk(profile);
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as Record<string, unknown>;

    const invoiceDueDaysRaw = body.invoiceDueDays;
    const invoiceDueDays =
      invoiceDueDaysRaw === undefined || invoiceDueDaysRaw === null || invoiceDueDaysRaw === ""
        ? undefined
        : typeof invoiceDueDaysRaw === "number"
          ? invoiceDueDaysRaw
          : Number(invoiceDueDaysRaw);

    const profile = await updateFirmProfile(firmId, {
      name: typeof body.name === "string" ? body.name : undefined,
      defaultCurrency:
        typeof body.defaultCurrency === "string" ? body.defaultCurrency : undefined,
      contactEmail:
        body.contactEmail === undefined
          ? undefined
          : typeof body.contactEmail === "string"
            ? body.contactEmail
            : null,
      contactPhone:
        body.contactPhone === undefined
          ? undefined
          : typeof body.contactPhone === "string"
            ? body.contactPhone
            : null,
      addressLine1:
        body.addressLine1 === undefined
          ? undefined
          : typeof body.addressLine1 === "string"
            ? body.addressLine1
            : null,
      addressLine2:
        body.addressLine2 === undefined
          ? undefined
          : typeof body.addressLine2 === "string"
            ? body.addressLine2
            : null,
      city:
        body.city === undefined
          ? undefined
          : typeof body.city === "string"
            ? body.city
            : null,
      country:
        body.country === undefined
          ? undefined
          : typeof body.country === "string"
            ? body.country
            : null,
      invoicePrefix:
        typeof body.invoicePrefix === "string" ? body.invoicePrefix : undefined,
      invoiceDueDays,
      confirmProfile: body.confirmProfile !== false,
    });

    await writeAuditLog({
      action: "firm.profile_updated",
      firmId,
      userId: session.id,
      entityType: "firm",
      entityId: firmId,
      metadata: {
        name: profile.name,
        defaultCurrency: profile.defaultCurrency,
        invoicePrefix: profile.invoicePrefix,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(profile);
  } catch (err) {
    return jsonError(err, request);
  }
}
