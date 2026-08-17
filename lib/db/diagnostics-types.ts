/** Phase 8 platform diagnostic store (P8-02). Not firm audit. */

export type DiagnosticEventSource = "api" | "frontend" | "health" | "worker";

export type DiagnosticEventLevel = "debug" | "info" | "warn" | "error";

export type DiagnosticRecommendedAction =
  | "none"
  | "retry"
  | "inspect_health"
  | "runtime_heal"
  | "propose_patch";

export type DiagnosticRepairKind = "runtime_heal" | "patch_proposal";

export type DiagnosticRepairStatus =
  | "proposed"
  | "approved"
  | "running"
  | "succeeded"
  | "failed"
  | "rolled_back"
  | "rejected";

export type DiagnosticEvent = {
  id: string;
  requestId: string;
  createdAt: Date;
  source: DiagnosticEventSource | string;
  level: DiagnosticEventLevel | string;
  module: string;
  route: string | null;
  httpMethod: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  sqlstate: string | null;
  messageSafe: string;
  userId: string | null;
  firmId: string | null;
  role: string | null;
  durationMs: number | null;
  payloadJson: Record<string, unknown> | null;
};

export type DiagnosticSpan = {
  id: string;
  requestId: string;
  parentSpanId: string | null;
  name: string;
  startedAt: Date;
  durationMs: number | null;
  ok: boolean;
  errorCode: string | null;
};

export type DiagnosticDiagnosis = {
  id: string;
  requestId: string | null;
  createdAt: Date;
  summary: string;
  likelyCause: string;
  confidence: number;
  alternativesJson: unknown[] | null;
  evidenceJson: Record<string, unknown> | null;
  recommendedAction: DiagnosticRecommendedAction | string;
  modelId: string | null;
  createdBy: string;
};

export type DiagnosticRepairAction = {
  id: string;
  diagnosisId: string | null;
  createdAt: Date;
  kind: DiagnosticRepairKind | string;
  actionCode: string;
  status: DiagnosticRepairStatus | string;
  requestedBy: string | null;
  approvedBy: string | null;
  executedAt: Date | null;
  resultSafe: string | null;
  proposalPath: string | null;
};
