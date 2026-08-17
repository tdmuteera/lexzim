/**
 * Deterministic diagnostic classifiers (P8-11). Rules first; AI is optional second opinion.
 * No writes. Uses workflow contracts + registry overlay for module/severity hints.
 */

import type { DiagnosticRecommendedAction } from "@/lib/db/diagnostics-types";
import {
  MODULE_OVERLAY,
  type DiagnosticModuleCode,
  type DiagnosticSeverity,
} from "@/lib/diagnostics/registry.overlay";
import { suggestWorkflows } from "@/lib/diagnostics/workflows";

export type EvidenceEvent = {
  id: string;
  source: string;
  level: string;
  module: string;
  route: string | null;
  httpMethod: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  sqlstate: string | null;
  messageSafe: string;
  durationMs: number | null;
};

export type EvidenceSpan = {
  id: string;
  name: string;
  ok: boolean;
  errorCode: string | null;
  durationMs: number | null;
};

export type RuleHit = {
  ruleId: string;
  causeCode: string;
  summary: string;
  likelyCause: string;
  confidence: number;
  recommendedAction: DiagnosticRecommendedAction;
  alternatives: string[];
  evidenceEventIds: string[];
  module: string;
  severity: DiagnosticSeverity | "unknown";
};

export type ClassifyInput = {
  events: EvidenceEvent[];
  spans?: EvidenceSpan[];
  circuitOpen?: boolean;
};

function overlayFor(module: string): {
  severity: DiagnosticSeverity | "unknown";
  recoveryHint: string;
} {
  const code = module as DiagnosticModuleCode;
  const row = MODULE_OVERLAY[code];
  if (!row) return { severity: "unknown", recoveryHint: "" };
  return { severity: row.severity, recoveryHint: row.recoveryHint };
}

function isConnectivitySqlstate(sql: string | null | undefined): boolean {
  if (!sql) return false;
  return /^08/.test(sql) || sql === "57P01" || sql === "57P03";
}

function isSchemaSqlstate(sql: string | null | undefined): boolean {
  if (!sql) return false;
  return sql === "42703" || sql === "42P01" || sql === "42883";
}

function pickEvents(
  events: EvidenceEvent[],
  pred: (e: EvidenceEvent) => boolean,
): EvidenceEvent[] {
  return events.filter(pred);
}

/**
 * Run deterministic rules. Highest confidence wins as primary.
 * Order of evaluation is stable; ties keep the first highest.
 */
export function classifyDiagnosticEvidence(input: ClassifyInput): {
  primary: RuleHit | null;
  hits: RuleHit[];
  suggestedWorkflowIds: string[];
} {
  const events = input.events ?? [];
  const hits: RuleHit[] = [];

  const workflowIds = new Set<string>();
  for (const e of events) {
    for (const w of suggestWorkflows({
      route: e.route,
      module: e.module,
      method: e.httpMethod,
    })) {
      workflowIds.add(w.id);
    }
  }

  if (input.circuitOpen) {
    const related = pickEvents(
      events,
      (e) =>
        e.errorCode === "database_unavailable" ||
        e.module === "db" ||
        /unreachable|circuit/i.test(e.messageSafe),
    );
    hits.push({
      ruleId: "db.circuit_open",
      causeCode: "db.circuit_open",
      summary: "Database circuit is open (recent connectivity failure cooldown).",
      likelyCause:
        "In-process DB circuit breaker is open after a connectivity failure. Not a schema mismatch.",
      confidence: 92,
      recommendedAction: "runtime_heal",
      alternatives: [
        "Wait for cooldown and retry",
        "Confirm DATABASE_URL / Supabase pooler from /api/db-status",
      ],
      evidenceEventIds: related.map((e) => e.id).slice(0, 8),
      module: "db",
      severity: "user_blocker",
    });
  }

  const schemaEvents = pickEvents(
    events,
    (e) =>
      isSchemaSqlstate(e.sqlstate) ||
      e.errorCode === "schema_mismatch" ||
      /42703|undefined column|does not exist|pending migration|db:migrate/i.test(
        e.messageSafe,
      ),
  );
  if (schemaEvents.length) {
    hits.push({
      ruleId: "db.schema_mismatch",
      causeCode: "db.schema_mismatch",
      summary: "Schema mismatch or pending migrations (not connectivity).",
      likelyCause:
        "Postgres reported a missing relation/column (e.g. SQLSTATE 42703). Run npm run db:migrate.",
      confidence: 95,
      recommendedAction: "inspect_health",
      alternatives: [
        "Confirm journal vs drizzle.__drizzle_migrations on /api/db-status",
        "Do not treat this as database unreachable",
      ],
      evidenceEventIds: schemaEvents.map((e) => e.id).slice(0, 8),
      module: "db",
      severity: "user_blocker",
    });
  }

  const connEvents = pickEvents(
    events,
    (e) =>
      e.errorCode === "database_unavailable" ||
      isConnectivitySqlstate(e.sqlstate) ||
      /CONNECT_TIMEOUT|ECONNRESET|ECONNREFUSED|pooler|Cannot reach/i.test(
        e.messageSafe,
      ),
  );
  if (connEvents.length && !schemaEvents.length) {
    hits.push({
      ruleId: "db.connectivity",
      causeCode: "db.connectivity",
      summary: "Database connectivity failure.",
      likelyCause:
        "Network/pooler could not reach Postgres (SQLSTATE 08xxx or socket error).",
      confidence: 90,
      recommendedAction: "runtime_heal",
      alternatives: [
        "Check Supabase project status",
        "Retry after circuit cooldown",
        "Inspect /api/db-status failureClass",
      ],
      evidenceEventIds: connEvents.map((e) => e.id).slice(0, 8),
      module: "db",
      severity: "user_blocker",
    });
  }

  const credEvents = pickEvents(
    events,
    (e) =>
      e.errorCode === "invalid_credentials" ||
      (e.httpStatus === 400 && /invalid email or password/i.test(e.messageSafe)),
  );
  if (credEvents.length) {
    hits.push({
      ruleId: "auth.credentials",
      causeCode: "auth.credentials",
      summary: "Invalid login credentials (not an outage).",
      likelyCause:
        "Staff entered a wrong email/password, or the app user is inactive. This is not a database outage.",
      confidence: 98,
      recommendedAction: "none",
      alternatives: [
        "User retries with correct password",
        "Managing Partner issues a password reset",
      ],
      evidenceEventIds: credEvents.map((e) => e.id).slice(0, 8),
      module: "auth",
      severity: "user_blocker",
    });
  }

  const authzEvents = pickEvents(
    events,
    (e) =>
      e.errorCode === "forbidden" ||
      e.errorCode === "unauthorized" ||
      e.httpStatus === 401 ||
      e.httpStatus === 403 ||
      /^licence_|^feature_disabled$|^seat_limit$|^matter_limit$/.test(
        e.errorCode ?? "",
      ),
  ).filter((e) => e.errorCode !== "invalid_credentials");
  if (authzEvents.length) {
    const licence = authzEvents.some((e) =>
      /licence_|feature_disabled|seat_limit|matter_limit/.test(e.errorCode ?? ""),
    );
    hits.push({
      ruleId: licence ? "licence.block" : "auth.authorisation",
      causeCode: licence ? "licence.block" : "auth.authorisation",
      summary: licence
        ? "Licence or feature gate blocked the action."
        : "Authorisation or session gate blocked the action.",
      likelyCause: licence
        ? "Firm licence expired, feature disabled, or seat/matter limit reached."
        : "Missing permission, revoked session, or suspended firm.",
      confidence: 88,
      recommendedAction: "none",
      alternatives: licence
        ? ["Review licence in /ops", "Confirm edition features"]
        : ["Confirm RBAC permission", "Re-sign-in", "Check OPS_IP_ALLOWLIST for ops routes"],
      evidenceEventIds: authzEvents.map((e) => e.id).slice(0, 8),
      module: authzEvents[0]?.module || "auth",
      severity: licence ? "user_blocker" : "user_blocker",
    });
  }

  const exportEvents = pickEvents(
    events,
    (e) =>
      e.module === "exports" ||
      (e.route?.startsWith("/api/export") ?? false) ||
      /Unknown export kind|export registry|isExportKind/i.test(e.messageSafe),
  );
  if (exportEvents.length) {
    const missingBuilder = exportEvents.some((e) =>
      /Unknown export kind|not_found|builder/i.test(
        `${e.errorCode ?? ""} ${e.messageSafe}`,
      ),
    );
    if (missingBuilder || exportEvents.some((e) => (e.httpStatus ?? 0) >= 400)) {
      hits.push({
        ruleId: "exports.registry",
        causeCode: "exports.registry",
        summary: "Export registry or builder failure.",
        likelyCause:
          "Export kind missing from lib/export/registry.ts or builder threw while rendering PDF/Word/Excel.",
        confidence: missingBuilder ? 85 : 70,
        recommendedAction: missingBuilder ? "propose_patch" : "retry",
        alternatives: [
          "Confirm EXPORT_KINDS includes the requested kind",
          "Retry after health.recheck",
        ],
        evidenceEventIds: exportEvents.map((e) => e.id).slice(0, 8),
        module: "exports",
        severity: "degraded",
      });
    }
  }

  const layoutEvents = pickEvents(
    events,
    (e) =>
      e.errorCode === "ui.overflow_clip" ||
      e.errorCode === "ui.chart_label_hidden" ||
      e.errorCode === "ui.controlled_input",
  );
  if (layoutEvents.length) {
    const mod = layoutEvents[0]!.module || "dashboard";
    const { severity, recoveryHint } = overlayFor(mod);
    const blocker =
      severity === "user_blocker" ||
      severity === "finance_blocker" ||
      severity === "trust_blocker";
    hits.push({
      ruleId: "layout.overflow",
      causeCode:
        layoutEvents[0]!.errorCode === "ui.chart_label_hidden"
          ? "layout.chart_label"
          : layoutEvents[0]!.errorCode === "ui.controlled_input"
            ? "layout.controlled_input"
            : "layout.overflow",
      summary: "Known layout anomaly detector fired.",
      likelyCause:
        recoveryHint ||
        "Frontend layout detector reported overflow clip, hidden chart labels, or controlled input warning.",
      confidence: 80,
      recommendedAction: blocker ? "propose_patch" : "none",
      alternatives: [
        "Confirm with npm run diagnostics:ui-anomalies",
        "Treat as cosmetic unless the module is a user/finance/trust blocker",
      ],
      evidenceEventIds: layoutEvents.map((e) => e.id).slice(0, 8),
      module: mod,
      severity,
    });
  }

  const errorEvents = pickEvents(
    events,
    (e) => e.level === "error" || (e.httpStatus ?? 0) >= 500,
  );
  if (!hits.length && errorEvents.length) {
    const e = errorEvents[0]!;
    const { severity, recoveryHint } = overlayFor(e.module);
    hits.push({
      ruleId: "generic.module_error",
      causeCode: `module.${e.module || "unknown"}`,
      summary: `Error in module ${e.module || "unknown"}.`,
      likelyCause:
        recoveryHint ||
        e.messageSafe ||
        "Server error without a more specific classifier.",
      confidence: 45,
      recommendedAction: "inspect_health",
      alternatives: ["Retry the staff action", "Inspect full timeline in /ops/diagnostics"],
      evidenceEventIds: errorEvents.map((x) => x.id).slice(0, 8),
      module: e.module || "platform",
      severity,
    });
  }

  hits.sort((a, b) => b.confidence - a.confidence);
  return {
    primary: hits[0] ?? null,
    hits,
    suggestedWorkflowIds: [...workflowIds],
  };
}
