/**
 * GET /api/finance/commission/settings
 * PUT /api/finance/commission/settings  (finance.commission.configure)
 */
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";
import {
  COMMISSION_FORMULA_HELP,
  getLatestCommissionSettings,
  saveCommissionSettings,
} from "@/lib/repos/finance-commission";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.commission.view");
    const firmId = tenantFirmId(session);
    const settings = await getLatestCommissionSettings(firmId);
    return jsonOk({
      settings,
      formulaHelp: COMMISSION_FORMULA_HELP,
      defaults: {
        monthlyTargetDollars: 3000,
        commissionPercentAboveTarget: 25,
        currency: session.firm.defaultCurrency || "USD",
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requirePermission("finance.commission.configure");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      monthlyTargetDollars?: unknown;
      monthlyTargetCents?: unknown;
      currency?: string;
      commissionPercentAboveTarget?: unknown;
      effectiveFrom?: string;
    };

    let monthlyTargetCents: number | null = null;
    if (body.monthlyTargetCents != null) {
      const n = Number(body.monthlyTargetCents);
      monthlyTargetCents = Number.isFinite(n) ? Math.round(n) : null;
    } else if (body.monthlyTargetDollars != null) {
      monthlyTargetCents = dollarsToCents(body.monthlyTargetDollars);
    }
    if (monthlyTargetCents == null || monthlyTargetCents < 0) {
      throw new AuthError("validation", "monthlyTargetDollars is required.");
    }

    const pct = Number(body.commissionPercentAboveTarget);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new AuthError(
        "validation",
        "commissionPercentAboveTarget must be a number from 0 to 100.",
      );
    }

    const effectiveFrom =
      typeof body.effectiveFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.effectiveFrom)
        ? body.effectiveFrom
        : todayDate();

    const currency =
      (typeof body.currency === "string" && body.currency.trim()) ||
      session.firm.defaultCurrency ||
      "USD";

    const settings = await saveCommissionSettings({
      firmId,
      monthlyTargetCents,
      currency,
      commissionPercentAboveTarget: pct,
      effectiveFrom,
      updatedBy: session.id,
    });

    await writeAuditLog({
      action: "finance_commission_settings.save",
      firmId,
      userId: session.id,
      entityType: "finance_commission_settings",
      entityId: settings.id,
      metadata: {
        monthlyTargetCents: settings.monthlyTargetCents,
        commissionPercentAboveTarget: settings.commissionPercentAboveTarget,
        currency: settings.currency,
        effectiveFrom: settings.effectiveFrom,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ settings, formulaHelp: COMMISSION_FORMULA_HELP });
  } catch (err) {
    return jsonError(err, request);
  }
}
