/**
 * Allowlisted runtime self-heal (P8-12).
 * No code patches, no trust/fee posting, no arbitrary SQL.
 */
import "server-only";

import { desc, eq } from "drizzle-orm";
import { writeAuditLog } from "@/lib/auth/audit";
import { flushAuthHotCaches } from "@/lib/auth/hot-cache";
import { requeueAiJobById } from "@/lib/ai/jobs/process";
import {
  clearDbUnavailable,
  isDbCircuitOpen,
} from "@/lib/db/connectivity";
import { getDb, prepareDbRetry, resetDbClient } from "@/lib/db";
import { diagnosticDiagnoses, diagnosticRepairActions } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/types";
import { recordEvent } from "@/lib/diagnostics/events";
import { collectOpsDiagnosticHealth } from "@/lib/diagnostics/health";
import { mintRequestId } from "@/lib/diagnostics/request-id";

export const RUNTIME_HEAL_ACTIONS = [
  "db.circuit_reset",
  "db.pool_recycle",
  "health.recheck",
  "job.requeue",
  "cache.flush",
] as const;

export type RuntimeHealActionCode = (typeof RUNTIME_HEAL_ACTIONS)[number];

export function isRuntimeHealAction(code: string): code is RuntimeHealActionCode {
  return (RUNTIME_HEAL_ACTIONS as readonly string[]).includes(code);
}

export type RepairActionRecord = {
  id: string;
  diagnosisId: string | null;
  createdAt: string;
  kind: string;
  actionCode: string;
  status: string;
  requestedBy: string | null;
  approvedBy: string | null;
  executedAt: string | null;
  resultSafe: string | null;
  proposalPath: string | null;
};

function serializeRepair(
  row: typeof diagnosticRepairActions.$inferSelect,
): RepairActionRecord {
  return {
    id: row.id,
    diagnosisId: row.diagnosisId,
    createdAt: row.createdAt.toISOString(),
    kind: row.kind,
    actionCode: row.actionCode,
    status: row.status,
    requestedBy: row.requestedBy,
    approvedBy: row.approvedBy,
    executedAt: row.executedAt ? row.executedAt.toISOString() : null,
    resultSafe: row.resultSafe,
    proposalPath: row.proposalPath,
  };
}

async function executeAction(input: {
  actionCode: RuntimeHealActionCode;
  jobId?: string | null;
  request: Request;
}): Promise<{ resultSafe: string; followUpRequestId: string; healthOk: boolean }> {
  const followUpRequestId = mintRequestId();
  let resultSafe = "";

  switch (input.actionCode) {
    case "db.circuit_reset": {
      const wasOpen = isDbCircuitOpen();
      prepareDbRetry();
      resultSafe = wasOpen
        ? "Circuit cleared and DB client reset for a fresh probe."
        : "Circuit was already closed; prepareDbRetry left the healthy pool in place.";
      break;
    }
    case "db.pool_recycle": {
      clearDbUnavailable();
      resetDbClient();
      resultSafe =
        "Cached Postgres client dropped. Next request opens a new pool connection. In-flight queries on the old client may fail.";
      break;
    }
    case "health.recheck": {
      const snapshot = await collectOpsDiagnosticHealth(input.request);
      const failing = snapshot.checks.filter((c) => !c.ok).map((c) => c.name);
      resultSafe = snapshot.ok
        ? `Health recheck ok (${snapshot.checks.length} checks).`
        : `Health recheck degraded: ${failing.join(", ") || "unknown"}.`;
      void recordEvent({
        requestId: followUpRequestId,
        source: "health",
        level: snapshot.ok ? "info" : "warn",
        module: "platform",
        route: "/api/ops/diagnostics/repair/runtime",
        httpMethod: "POST",
        httpStatus: 200,
        errorCode: snapshot.ok ? "health.recheck.ok" : "health.degraded",
        messageSafe: resultSafe,
        payload: {
          action: "health.recheck",
          failing,
          checkCount: snapshot.checks.length,
        },
      });
      return { resultSafe, followUpRequestId, healthOk: snapshot.ok };
    }
    case "job.requeue": {
      const outcome = await requeueAiJobById(input.jobId ?? "");
      if (!outcome.ok) {
        throw new AuthError("validation", outcome.message);
      }
      resultSafe = outcome.message;
      break;
    }
    case "cache.flush": {
      flushAuthHotCaches();
      resultSafe =
        "Flushed in-process auth/RBAC hot caches (lexzimAuthNeedsSetupCache, role permission cache). No Redis.";
      break;
    }
    default: {
      throw new AuthError("validation", "Unsupported runtime action.");
    }
  }

  const snapshot = await collectOpsDiagnosticHealth(input.request);
  const failing = snapshot.checks.filter((c) => !c.ok).map((c) => c.name);
  void recordEvent({
    requestId: followUpRequestId,
    source: "health",
    level: snapshot.ok ? "info" : "warn",
    module: "platform",
    route: "/api/ops/diagnostics/repair/runtime",
    httpMethod: "POST",
    httpStatus: 200,
    errorCode: snapshot.ok ? "runtime_heal.ok" : "runtime_heal.health_degraded",
    messageSafe: `After ${input.actionCode}: ${resultSafe}`,
    payload: {
      action: input.actionCode,
      failing,
      checkCount: snapshot.checks.length,
    },
  });

  return { resultSafe, followUpRequestId, healthOk: snapshot.ok };
}

/**
 * Two-step runtime heal.
 * confirm=false → propose only.
 * confirm=true → execute (optionally continuing a proposed repair_id).
 */
export async function proposeOrExecuteRuntimeHeal(input: {
  actionCode: string;
  diagnosisId?: string | null;
  jobId?: string | null;
  confirm: boolean;
  repairId?: string | null;
  actorUserId: string;
  request: Request;
  ipOrUserAgent?: string | null;
}): Promise<{
  repair: RepairActionRecord;
  executed: boolean;
  needsConfirm: boolean;
  followUpRequestId?: string;
  healthOk?: boolean;
}> {
  if (!isRuntimeHealAction(input.actionCode)) {
    throw new AuthError(
      "validation",
      `Arbitrary action_code rejected. Allowlist: ${RUNTIME_HEAL_ACTIONS.join(", ")}.`,
    );
  }

  const db = getDb();

  if (input.diagnosisId) {
    const rows = await db
      .select({ id: diagnosticDiagnoses.id })
      .from(diagnosticDiagnoses)
      .where(eq(diagnosticDiagnoses.id, input.diagnosisId))
      .limit(1);
    if (!rows[0]) {
      throw new AuthError("not_found", "diagnosis_id not found.");
    }
  }

  if (input.actionCode === "job.requeue" && input.confirm && !input.jobId?.trim()) {
    throw new AuthError("validation", "job_id is required for job.requeue.");
  }

  let repairRow: typeof diagnosticRepairActions.$inferSelect | undefined;

  if (input.repairId?.trim()) {
    const existing = await db
      .select()
      .from(diagnosticRepairActions)
      .where(eq(diagnosticRepairActions.id, input.repairId.trim()))
      .limit(1);
    repairRow = existing[0];
    if (!repairRow) {
      throw new AuthError("not_found", "repair_id not found.");
    }
    if (repairRow.kind !== "runtime_heal") {
      throw new AuthError("validation", "Repair is not a runtime_heal action.");
    }
    if (repairRow.actionCode !== input.actionCode) {
      throw new AuthError("validation", "action_code does not match the proposed repair.");
    }
    if (repairRow.status !== "proposed") {
      throw new AuthError(
        "validation",
        `Repair status is ${repairRow.status}; only proposed can execute.`,
      );
    }
  } else {
    const inserted = await db
      .insert(diagnosticRepairActions)
      .values({
        diagnosisId: input.diagnosisId ?? null,
        kind: "runtime_heal",
        actionCode: input.actionCode,
        status: "proposed",
        requestedBy: input.actorUserId,
      })
      .returning();
    repairRow = inserted[0];
  }

  if (!input.confirm) {
    await writeAuditLog({
      action: "diagnostics.runtime_heal.proposed",
      userId: input.actorUserId,
      firmId: null,
      entityType: "diagnostic_repair_action",
      entityId: repairRow!.id,
      metadata: {
        actionCode: input.actionCode,
        diagnosisId: input.diagnosisId ?? null,
        note: "Proposed only. Trust and fee ledgers were not touched.",
      },
      ipOrUserAgent: input.ipOrUserAgent ?? null,
    }).catch(() => undefined);

    return {
      repair: serializeRepair(repairRow!),
      executed: false,
      needsConfirm: true,
    };
  }

  const running = await db
    .update(diagnosticRepairActions)
    .set({ status: "running", approvedBy: input.actorUserId })
    .where(eq(diagnosticRepairActions.id, repairRow!.id))
    .returning();
  repairRow = running[0] ?? repairRow;

  try {
    const outcome = await executeAction({
      actionCode: input.actionCode,
      jobId: input.jobId,
      request: input.request,
    });

    const done = await db
      .update(diagnosticRepairActions)
      .set({
        status: "succeeded",
        executedAt: new Date(),
        approvedBy: input.actorUserId,
        resultSafe: outcome.resultSafe.slice(0, 1000),
      })
      .where(eq(diagnosticRepairActions.id, repairRow!.id))
      .returning();

    await writeAuditLog({
      action: "diagnostics.runtime_heal.executed",
      userId: input.actorUserId,
      firmId: null,
      entityType: "diagnostic_repair_action",
      entityId: repairRow!.id,
      metadata: {
        actionCode: input.actionCode,
        diagnosisId: input.diagnosisId ?? null,
        followUpRequestId: outcome.followUpRequestId,
        healthOk: outcome.healthOk,
        resultSafe: outcome.resultSafe.slice(0, 240),
        note: "Allowlisted runtime heal. Trust and fee ledgers were not touched.",
      },
      ipOrUserAgent: input.ipOrUserAgent ?? null,
    }).catch(() => undefined);

    return {
      repair: serializeRepair(done[0]!),
      executed: true,
      needsConfirm: false,
      followUpRequestId: outcome.followUpRequestId,
      healthOk: outcome.healthOk,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 500) : "Runtime heal failed.";
    await db
      .update(diagnosticRepairActions)
      .set({
        status: "failed",
        executedAt: new Date(),
        approvedBy: input.actorUserId,
        resultSafe: message,
      })
      .where(eq(diagnosticRepairActions.id, repairRow!.id));

    await writeAuditLog({
      action: "diagnostics.runtime_heal.failed",
      userId: input.actorUserId,
      firmId: null,
      entityType: "diagnostic_repair_action",
      entityId: repairRow!.id,
      metadata: {
        actionCode: input.actionCode,
        resultSafe: message,
      },
      ipOrUserAgent: input.ipOrUserAgent ?? null,
    }).catch(() => undefined);

    throw err;
  }
}

export async function listRecentRuntimeRepairs(limit = 10) {
  const db = getDb();
  const rows = await db
    .select()
    .from(diagnosticRepairActions)
    .where(eq(diagnosticRepairActions.kind, "runtime_heal"))
    .orderBy(desc(diagnosticRepairActions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows.map(serializeRepair);
}
