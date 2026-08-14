import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";
import {
  buildPettyCashSummary,
  createPettyCashMovement,
  getOpenPettyCashFloat,
  openPettyCashFloat,
} from "@/lib/repos/petty-cash";
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

function parsePositiveCents(raw: Record<string, unknown>): number {
  if ("amountCents" in raw && raw.amountCents != null && raw.amountCents !== "") {
    const n = Number(raw.amountCents);
    if (!Number.isInteger(n) || n < 1) {
      throw new AuthError("validation", "amountCents must be a positive integer.");
    }
    return n;
  }
  const dollars = dollarsToCents(raw.amount ?? raw.amountDollars);
  if (dollars == null || dollars < 1) {
    throw new AuthError("validation", "Amount must be greater than zero.");
  }
  return dollars;
}

export async function GET() {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const summary = await buildPettyCashSummary(firmId);
    return jsonOk({
      float: summary.float
        ? {
            id: summary.float.id,
            openingDate: summary.float.openingDate.toISOString(),
            amountCents: summary.float.amountCents,
            currency: summary.float.currency,
            status: summary.float.status,
          }
        : null,
      balanceCents: summary.balanceCents,
      movements: summary.movements.map((m) => ({
        id: m.id,
        movementType: m.movementType,
        amountCents: m.amountCents,
        currency: m.currency,
        movementDate: m.movementDate.toISOString(),
        expenseGlAccountId: m.expenseGlAccountId,
        reference: m.reference,
        notes: m.notes,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    if (!body || typeof body !== "object") {
      throw new AuthError("validation", "Invalid payload.");
    }
    const raw = body as Record<string, unknown>;
    const action = typeof raw.action === "string" ? raw.action : "movement";
    const currency = session.firm.defaultCurrency || "USD";

    if (action === "open_float") {
      const float = await openPettyCashFloat(firmId, session.id, {
        openingDate: parseDate(raw.openingDate, "Opening date"),
        amountCents: parsePositiveCents(raw),
        currency: typeof raw.currency === "string" ? raw.currency : currency,
      });
      await writeAuditLog({
        action: "petty_cash.open_float",
        firmId,
        userId: session.id,
        entityType: "petty_cash_float",
        entityId: float.id,
        metadata: { amountCents: float.amountCents },
        ipOrUserAgent: clientInfo(request),
      });
      return jsonOk({ float: { id: float.id } }, { status: 201 });
    }

    const float = await getOpenPettyCashFloat(firmId);
    if (!float) {
      throw new AuthError("validation", "Open a petty cash float first.");
    }

    const movementType = raw.movementType;
    if (
      movementType !== "vault_to_petty" &&
      movementType !== "petty_spend" &&
      movementType !== "petty_return"
    ) {
      throw new AuthError(
        "validation",
        "movementType must be vault_to_petty, petty_spend, or petty_return.",
      );
    }

    const movement = await createPettyCashMovement(firmId, session.id, {
      floatId: float.id,
      movementType,
      amountCents: parsePositiveCents(raw),
      currency: typeof raw.currency === "string" ? raw.currency : float.currency,
      movementDate: parseDate(raw.movementDate, "Movement date"),
      expenseGlAccountId:
        typeof raw.expenseGlAccountId === "string" ? raw.expenseGlAccountId : null,
      reference: typeof raw.reference === "string" ? raw.reference.trim() || null : null,
      notes: typeof raw.notes === "string" ? raw.notes.trim() || null : null,
    });

    await writeAuditLog({
      action: "petty_cash.movement",
      firmId,
      userId: session.id,
      entityType: "petty_cash_movement",
      entityId: movement.id,
      metadata: { movementType, amountCents: movement.amountCents },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ movement: { id: movement.id } }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
