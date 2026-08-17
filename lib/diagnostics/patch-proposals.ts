/**
 * Patch proposals only (P8-13). Never writes application source as a "fix".
 * Markdown lands under docs/diagnostics/proposals/. Humans apply outside the app.
 */
import "server-only";

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { writeAuditLog } from "@/lib/auth/audit";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { diagnosticDiagnoses, diagnosticRepairActions } from "@/lib/db/schema";
import { recordEvent } from "@/lib/diagnostics/events";
import { collectOpsDiagnosticHealth } from "@/lib/diagnostics/health";
import {
  redactDiagnosticMessage,
  redactDiagnosticPayload,
} from "@/lib/diagnostics/redact";
import { mintRequestId } from "@/lib/diagnostics/request-id";

export const PATCH_PROPOSAL_ACTION = "patch.propose" as const;

export type PatchProposalStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "succeeded"
  | "rolled_back"
  | "failed";

const ALLOWED_STATUS_TRANSITIONS: Record<string, PatchProposalStatus[]> = {
  proposed: ["approved", "rejected", "succeeded"],
  approved: ["succeeded", "rejected", "rolled_back"],
  succeeded: ["rolled_back"],
  rejected: [],
  rolled_back: [],
  failed: ["proposed", "rejected"],
  running: ["succeeded", "failed", "rejected"],
};

export type PatchProposalRecord = {
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

function serialize(
  row: typeof diagnosticRepairActions.$inferSelect,
): PatchProposalRecord {
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

function proposalsDir() {
  return path.join(process.cwd(), "docs", "diagnostics", "proposals");
}

function sanitizeRequestIdForFilename(requestId: string): string {
  const cleaned = requestId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);
  return cleaned || "norequest";
}

function yyyymmdd(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function looksLikeDashboardRegression(input: {
  title: string;
  rationale: string;
  files: string[];
}): boolean {
  const hay = `${input.title} ${input.rationale} ${input.files.join(" ")}`.toLowerCase();
  return (
    hay.includes("overflow") ||
    hay.includes("chart_label") ||
    hay.includes("chart label") ||
    hay.includes("dashboard") ||
    hay.includes("caseload")
  );
}

function looksLikeFinanceScrollRegression(input: {
  title: string;
  rationale: string;
  files: string[];
}): boolean {
  const hay = `${input.title} ${input.rationale} ${input.files.join(" ")}`.toLowerCase();
  return (
    hay.includes("invoicing") ||
    hay.includes("panel-body") ||
    hay.includes("finance-desk") ||
    (hay.includes("finance") && hay.includes("scroll"))
  );
}

function optionalKnownDiff(input: {
  title: string;
  rationale: string;
  files: string[];
}): string | null {
  if (looksLikeDashboardRegression(input)) {
    return [
      "### Optional reference diff (do not auto-apply)",
      "",
      "Known Phase 8 regression area: dashboard / lawyer caseload chart labels.",
      "Confirm against `npm run diagnostics:ui-anomalies` before opening a PR.",
      "",
      "```diff",
      "--- a/app/globals.css",
      "+++ b/app/globals.css",
      "@@ dashboard chart labels @@",
      "-/* regression: labels clipped or absolute on fill only */",
      "+.dashboard-bar-value { color: var(--text); transform: none; }",
      "+.dashboard-bar-label { color: var(--text-muted); transform: none; }",
      "```",
      "",
      "Exact selectors may differ. Treat this as a reminder, not a complete patch.",
    ].join("\n");
  }
  if (looksLikeFinanceScrollRegression(input)) {
    return [
      "### Optional reference diff (do not auto-apply)",
      "",
      "Known Phase 8 regression area: finance invoicing scroll inside `.panel-body`.",
      "",
      "```diff",
      "--- a/app/(app)/finance/invoicing/new/page.tsx",
      "+++ b/app/(app)/finance/invoicing/new/page.tsx",
      "@@ scroll container @@",
      "-<div className=\"finance-desk-view\">",
      "+<div className=\"finance-desk-view\">",
      "+  <div className=\"panel-body\">",
      "   …form…",
      "+  </div>",
      "</div>",
      "```",
      "",
      "Do not redesign the finance desk. Restore scroll containment only.",
    ].join("\n");
  }
  return null;
}

function buildProposalMarkdown(input: {
  title: string;
  files: string[];
  rationale: string;
  requestId: string | null;
  testPlan: string;
  diagnosisId: string | null;
  repairId: string;
  actorUserId: string;
  knownDiff: string | null;
}): string {
  const filesList =
    input.files.length > 0
      ? input.files.map((f) => `- \`${f}\``).join("\n")
      : "- _(none listed)_";
  const rollback =
    input.files.length > 0
      ? input.files
          .map((f) => `- Revert the human-applied change to \`${f}\` (git revert or reverse patch).`)
          .join("\n")
      : "- Reverse the human-applied PR or paste the inverse of the applied patch.";

  const sections = [
    `# Patch proposal: ${input.title}`,
    "",
    "_Redacted diagnostic proposal. No passwords, JWTs, KYC, amounts, or matter titles._",
    "",
    "## Metadata",
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Repair id | \`${input.repairId}\` |`,
    `| Request id | \`${input.requestId ?? "n/a"}\` |`,
    `| Diagnosis id | \`${input.diagnosisId ?? "n/a"}\` |`,
    `| Created by (ops user id) | \`${input.actorUserId}\` |`,
    `| Created at (UTC) | ${new Date().toISOString()} |`,
    `| Status at write | proposed |`,
    "",
    "## Rationale",
    "",
    input.rationale,
    "",
    "## Files in scope",
    "",
    filesList,
    "",
    "## Test plan",
    "",
    input.testPlan,
    "",
    "## How to apply",
    "",
    "1. Open a reviewable branch or paste the patch into a PR.",
    "2. Do **not** expect LexZim to write `src/` or `app/` for you. The running app never auto-edits production source.",
    "3. Mark the proposal **approved** in `/ops/diagnostics` when a human accepts the plan.",
    "4. After you merge/apply outside the app, mark **applied** (`succeeded`). The verify hook records typecheck/smoke notes and rechecks ops health.",
    "5. If you must undo, apply the reverse patch below and mark **rolled back**.",
    "",
    "## Rollback (reverse patch notes)",
    "",
    rollback,
    "",
    "Document the exact reverse diff in the PR description when you apply.",
    "",
  ];

  if (input.knownDiff) {
    sections.push(input.knownDiff, "");
  }

  sections.push(
    "## Verify commands (human / verify hook)",
    "",
    "```powershell",
    "npx tsc --noEmit",
    "npm run diagnostics:ui-anomalies",
    "```",
    "",
    "Then confirm `/ops/diagnostics` Health is green enough for the change.",
    "",
  );

  return sections.join("\n");
}

async function runVerifySubset(): Promise<{ ok: boolean; log: string }> {
  const runTsc = process.env.DIAGNOSTICS_VERIFY_TSC === "1";
  const commands = [
    ...(runTsc
      ? [{ label: "tsc", cmd: "npx", args: ["tsc", "--noEmit"] as string[] }]
      : []),
    {
      label: "ui-anomalies",
      cmd: process.platform === "win32" ? "npm.cmd" : "npm",
      args: ["run", "diagnostics:ui-anomalies"],
    },
  ];
  const lines: string[] = [];
  if (!runTsc) {
    lines.push("tsc: recorded (set DIAGNOSTICS_VERIFY_TSC=1 to run in-process)");
  }
  let ok = true;

  for (const c of commands) {
    const result = await new Promise<{ code: number | null; out: string }>((resolve) => {
      const child = spawn(c.cmd, c.args, {
        cwd: process.cwd(),
        env: process.env,
        shell: process.platform === "win32",
      });
      let out = "";
      const timer = setTimeout(() => {
        child.kill();
        resolve({ code: null, out: out || `${c.label} timed out` });
      }, 120_000);
      child.stdout?.on("data", (b) => {
        out += String(b);
      });
      child.stderr?.on("data", (b) => {
        out += String(b);
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ code: 1, out: err.message });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, out });
      });
    });
    const snippet = result.out.replace(/\s+/g, " ").trim().slice(0, 280);
    if (result.code === 0) {
      lines.push(`${c.label}: ok`);
    } else {
      ok = false;
      lines.push(
        `${c.label}: failed (code ${result.code ?? "timeout"})${snippet ? `: ${snippet}` : ""}`,
      );
    }
  }

  return { ok, log: lines.join(" | ").slice(0, 900) };
}

export async function createPatchProposal(input: {
  title: string;
  files: string[];
  rationale: string;
  requestId?: string | null;
  testPlan: string;
  diagnosisId?: string | null;
  actorUserId: string;
  ipOrUserAgent?: string | null;
  request: Request;
}): Promise<{ repair: PatchProposalRecord; markdown: string; proposalPath: string }> {
  const title = redactDiagnosticMessage(input.title).slice(0, 200).trim();
  const rationale = redactDiagnosticMessage(input.rationale).slice(0, 4000).trim();
  const testPlan = redactDiagnosticMessage(input.testPlan).slice(0, 4000).trim();
  const files = input.files
    .map((f) => redactDiagnosticMessage(String(f)).slice(0, 240).trim())
    .filter(Boolean)
    .slice(0, 40);

  if (!title) throw new AuthError("validation", "title is required.");
  if (!rationale) throw new AuthError("validation", "rationale is required.");
  if (!testPlan) throw new AuthError("validation", "test_plan is required.");

  const db = getDb();
  if (input.diagnosisId) {
    const rows = await db
      .select({ id: diagnosticDiagnoses.id })
      .from(diagnosticDiagnoses)
      .where(eq(diagnosticDiagnoses.id, input.diagnosisId))
      .limit(1);
    if (!rows[0]) throw new AuthError("not_found", "diagnosis_id not found.");
  }

  const requestId = input.requestId?.trim()
    ? sanitizeRequestIdForFilename(input.requestId.trim())
    : "norequest";
  const relativePath = path
    .join("docs", "diagnostics", "proposals", `${yyyymmdd()}-${requestId}.md`)
    .replace(/\\/g, "/");

  const inserted = await db
    .insert(diagnosticRepairActions)
    .values({
      diagnosisId: input.diagnosisId ?? null,
      kind: "patch_proposal",
      actionCode: PATCH_PROPOSAL_ACTION,
      status: "proposed",
      requestedBy: input.actorUserId,
      proposalPath: relativePath,
      resultSafe: title.slice(0, 240),
    })
    .returning();
  const repair = inserted[0]!;

  const knownDiff = optionalKnownDiff({ title, rationale, files });
  const markdown = buildProposalMarkdown({
    title,
    files,
    rationale,
    requestId: input.requestId?.trim() || null,
    testPlan,
    diagnosisId: input.diagnosisId ?? null,
    repairId: repair.id,
    actorUserId: input.actorUserId,
    knownDiff,
  });

  await fs.mkdir(proposalsDir(), { recursive: true });
  const abs = path.join(process.cwd(), ...relativePath.split("/"));
  // If same-day same requestId already exists, append repair id to avoid overwrite.
  let finalRelative = relativePath;
  let finalAbs = abs;
  try {
    await fs.access(abs);
    finalRelative = relativePath.replace(/\.md$/, `-${repair.id.slice(0, 8)}.md`);
    finalAbs = path.join(process.cwd(), ...finalRelative.split("/"));
    await db
      .update(diagnosticRepairActions)
      .set({ proposalPath: finalRelative })
      .where(eq(diagnosticRepairActions.id, repair.id));
  } catch {
    /* file does not exist yet */
  }
  await fs.writeFile(finalAbs, markdown, "utf8");

  const updated =
    finalRelative !== relativePath
      ? (
          await db
            .select()
            .from(diagnosticRepairActions)
            .where(eq(diagnosticRepairActions.id, repair.id))
            .limit(1)
        )[0]!
      : repair;

  await writeAuditLog({
    action: "diagnostics.patch_proposal.created",
    userId: input.actorUserId,
    firmId: null,
    entityType: "diagnostic_repair_action",
    entityId: updated.id,
    metadata: redactDiagnosticPayload({
      proposalPath: finalRelative,
      title,
      fileCount: files.length,
      requestId: input.requestId ?? null,
      note: "Markdown proposal only. Application source was not modified.",
    }),
    ipOrUserAgent: input.ipOrUserAgent ?? null,
  }).catch(() => undefined);

  void recordEvent({
    requestId: input.requestId?.trim() || mintRequestId(),
    source: "api",
    level: "info",
    module: "platform",
    route: "/api/ops/diagnostics/repair/propose",
    httpMethod: "POST",
    httpStatus: 200,
    errorCode: "patch_proposal.created",
    messageSafe: `Patch proposal created: ${title}`.slice(0, 500),
    payload: {
      repairId: updated.id,
      proposalPath: finalRelative,
    },
  });

  return {
    repair: serialize({ ...updated, proposalPath: finalRelative }),
    markdown,
    proposalPath: finalRelative,
  };
}

export async function listPatchProposals(limit = 30) {
  const db = getDb();
  const rows = await db
    .select()
    .from(diagnosticRepairActions)
    .where(eq(diagnosticRepairActions.kind, "patch_proposal"))
    .orderBy(desc(diagnosticRepairActions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map(serialize);
}

export async function getPatchProposal(id: string): Promise<{
  repair: PatchProposalRecord;
  markdown: string | null;
}> {
  const db = getDb();
  const rows = await db
    .select()
    .from(diagnosticRepairActions)
    .where(eq(diagnosticRepairActions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || row.kind !== "patch_proposal") {
    throw new AuthError("not_found", "Patch proposal not found.");
  }
  let markdown: string | null = null;
  if (row.proposalPath) {
    try {
      const abs = path.join(process.cwd(), ...row.proposalPath.split("/"));
      markdown = await fs.readFile(abs, "utf8");
    } catch {
      markdown = null;
    }
  }
  return { repair: serialize(row), markdown };
}

export async function updatePatchProposalStatus(input: {
  id: string;
  status: PatchProposalStatus;
  actorUserId: string;
  ipOrUserAgent?: string | null;
  request: Request;
}): Promise<{
  repair: PatchProposalRecord;
  verify?: { ok: boolean; log: string; healthOk?: boolean };
}> {
  const status = input.status;
  if (
    status !== "approved" &&
    status !== "rejected" &&
    status !== "succeeded" &&
    status !== "rolled_back"
  ) {
    throw new AuthError(
      "validation",
      "status must be approved, rejected, succeeded, or rolled_back.",
    );
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(diagnosticRepairActions)
    .where(eq(diagnosticRepairActions.id, input.id))
    .limit(1);
  const row = rows[0];
  if (!row || row.kind !== "patch_proposal") {
    throw new AuthError("not_found", "Patch proposal not found.");
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[row.status] ?? [];
  if (!allowed.includes(status)) {
    throw new AuthError(
      "validation",
      `Cannot move patch proposal from ${row.status} to ${status}.`,
    );
  }

  let verify:
    | { ok: boolean; log: string; healthOk?: boolean }
    | undefined;

  let resultSafe = row.resultSafe;
  if (status === "succeeded") {
    const verifyOutcome = await runVerifySubset();
    const health = await collectOpsDiagnosticHealth(input.request);
    verify = {
      ok: verifyOutcome.ok && health.ok,
      log: verifyOutcome.log,
      healthOk: health.ok,
    };
    resultSafe = [
      row.resultSafe,
      `verify: ${verifyOutcome.log}`,
      `health: ${health.ok ? "ok" : "degraded"}`,
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 1000);

    const followUpRequestId = mintRequestId();
    void recordEvent({
      requestId: followUpRequestId,
      source: "health",
      level: verify.ok ? "info" : "warn",
      module: "platform",
      route: "/api/ops/diagnostics/repair/propose",
      httpMethod: "PATCH",
      httpStatus: 200,
      errorCode: verify.ok ? "patch_proposal.verified" : "patch_proposal.verify_failed",
      messageSafe: `Patch proposal marked applied. ${resultSafe}`.slice(0, 500),
      payload: {
        repairId: row.id,
        proposalPath: row.proposalPath,
        verifyOk: verifyOutcome.ok,
        healthOk: health.ok,
      },
    });
  } else if (status === "rolled_back") {
    resultSafe = [row.resultSafe, "Human confirmed rollback (reverse patch outside app)."]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 1000);
  }

  const updated = await db
    .update(diagnosticRepairActions)
    .set({
      status,
      approvedBy: input.actorUserId,
      executedAt:
        status === "succeeded" || status === "rolled_back" ? new Date() : row.executedAt,
      resultSafe,
    })
    .where(eq(diagnosticRepairActions.id, row.id))
    .returning();

  await writeAuditLog({
    action: `diagnostics.patch_proposal.${status}`,
    userId: input.actorUserId,
    firmId: null,
    entityType: "diagnostic_repair_action",
    entityId: row.id,
    metadata: redactDiagnosticPayload({
      from: row.status,
      to: status,
      proposalPath: row.proposalPath,
      verify: verify
        ? { ok: verify.ok, healthOk: verify.healthOk, log: verify.log.slice(0, 240) }
        : null,
      note: "Status change only. App did not write production source.",
    }),
    ipOrUserAgent: input.ipOrUserAgent ?? null,
  }).catch(() => undefined);

  return { repair: serialize(updated[0]!), verify };
}
