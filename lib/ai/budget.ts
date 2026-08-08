import "server-only";

import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiUsageEvents } from "@/lib/db/schema";
import { getAiSettings } from "@/lib/repos/ai-settings";

export class AiBudgetExceededError extends Error {
  readonly code = "budget_exceeded" as const;
  readonly httpStatus = 429;
  readonly used: number;
  readonly budget: number;

  constructor(used: number, budget: number) {
    super(
      `Firm monthly AI soft budget reached (${used}/${budget} calls). A Managing Partner can raise or clear the limit in Settings → AI → Usage.`,
    );
    this.name = "AiBudgetExceededError";
    this.used = used;
    this.budget = budget;
  }
}

export type AiUsageMonthSummary = {
  year: number;
  month: number;
  /** Calendar month start (UTC). */
  periodStartIso: string;
  callsThisMonth: number;
  successCalls: number;
  failedCalls: number;
  softBudget: number | null;
  softBudgetUnlimited: boolean;
  remaining: number | null;
  warnAt80: boolean;
  exceeded: boolean;
  byMode: Record<string, number>;
  byProvider: Record<string, number>;
};

function monthStartUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Count firm AI usage events for the current UTC calendar month. */
export async function countAiUsageThisMonth(firmId: string): Promise<{
  total: number;
  success: number;
  failed: number;
  byMode: Record<string, number>;
  byProvider: Record<string, number>;
}> {
  const db = getDb();
  const start = monthStartUtc();

  const totals = await db
    .select({
      total: count(),
      success: sql<number>`coalesce(sum(case when ${aiUsageEvents.success} then 1 else 0 end), 0)`.mapWith(
        Number,
      ),
    })
    .from(aiUsageEvents)
    .where(
      and(eq(aiUsageEvents.firmId, firmId), gte(aiUsageEvents.createdAt, start)),
    );

  const byModeRows = await db
    .select({
      mode: aiUsageEvents.mode,
      n: count(),
    })
    .from(aiUsageEvents)
    .where(
      and(eq(aiUsageEvents.firmId, firmId), gte(aiUsageEvents.createdAt, start)),
    )
    .groupBy(aiUsageEvents.mode);

  const byProviderRows = await db
    .select({
      provider: aiUsageEvents.provider,
      n: count(),
    })
    .from(aiUsageEvents)
    .where(
      and(eq(aiUsageEvents.firmId, firmId), gte(aiUsageEvents.createdAt, start)),
    )
    .groupBy(aiUsageEvents.provider);

  const total = Number(totals[0]?.total ?? 0);
  const success = Number(totals[0]?.success ?? 0);
  const byMode: Record<string, number> = {};
  for (const row of byModeRows) {
    byMode[row.mode ?? "unknown"] = Number(row.n);
  }
  const byProvider: Record<string, number> = {};
  for (const row of byProviderRows) {
    byProvider[row.provider] = Number(row.n);
  }

  return {
    total,
    success,
    failed: Math.max(0, total - success),
    byMode,
    byProvider,
  };
}

export async function getAiUsageMonthSummary(firmId: string): Promise<AiUsageMonthSummary> {
  const settings = await getAiSettings(firmId);
  const counts = await countAiUsageThisMonth(firmId);
  const now = new Date();
  // No settings row yet: default soft budget 500. Null/0 in settings = unlimited.
  const budget = !settings
    ? 500
    : settings.monthlySoftBudget === null || settings.monthlySoftBudget <= 0
      ? null
      : settings.monthlySoftBudget;
  const softBudgetUnlimited = budget === null;
  const softBudget = budget;
  const exceeded = softBudget !== null && counts.total >= softBudget;
  const remaining =
    softBudget === null ? null : Math.max(0, softBudget - counts.total);
  const warnAt80 =
    softBudget !== null && counts.total >= Math.floor(softBudget * 0.8);

  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    periodStartIso: monthStartUtc(now).toISOString(),
    callsThisMonth: counts.total,
    successCalls: counts.success,
    failedCalls: counts.failed,
    softBudget,
    softBudgetUnlimited,
    remaining,
    warnAt80,
    exceeded,
    byMode: counts.byMode,
    byProvider: counts.byProvider,
  };
}

/**
 * Soft budget gate before an LLM chat call.
 * Unlimited when monthly_soft_budget is null or <= 0.
 */
export async function assertAiSoftBudget(firmId: string): Promise<AiUsageMonthSummary> {
  const summary = await getAiUsageMonthSummary(firmId);
  if (summary.exceeded && summary.softBudget !== null) {
    throw new AiBudgetExceededError(summary.callsThisMonth, summary.softBudget);
  }
  return summary;
}
