"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { suggestWorkflows } from "@/lib/diagnostics/workflows";

type HealthCheck = {
  name: string;
  ok: boolean;
  durationMs: number;
  safeDetail: string;
};

type HealthData = {
  ok: boolean;
  timestamp: string;
  checks: HealthCheck[];
  version?: string;
  circuit?: { open: boolean; remainingMs: number };
  db?: Record<string, unknown>;
};

type EventRow = {
  id: string;
  requestId: string;
  createdAt: string;
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

type SpanRow = {
  id: string;
  name: string;
  startedAt: string;
  durationMs: number | null;
  ok: boolean;
  errorCode: string | null;
};

type DiagTab = "health" | "events" | "registry" | "workflows" | "proposals";

type RegistryNav = { href: string; label: string; permission: string | null };

type RegistryModule = {
  code: string;
  severity: string;
  owner: string;
  recoveryHint: string;
  nav: RegistryNav[];
  apiRoutes: string[];
  tables: string[];
};

type RegistryData = {
  generatedAt: string;
  modules: RegistryModule[];
  unmatchedNav: Array<{ href: string; label: string }>;
  unmatchedApiRoutes: string[];
  unmatchedTables: string[];
};

type WorkflowStep = {
  id: string;
  name: string;
  kind: string;
};

type WorkflowContract = {
  id: string;
  module: string;
  title: string;
  summary: string;
  userBlocker: boolean;
  steps: WorkflowStep[];
  dependencies: string[];
  expectedStatus: number[];
  failureClasses: string[];
  notes: string[];
};

type WorkflowGraph = {
  nodes: Array<{ id: string; kind: string; label: string }>;
  edges: Array<{ from: string; to: string; reason: string }>;
};

type WorkflowsData = {
  workflows: WorkflowContract[];
  graph: WorkflowGraph;
};

type DiagnosisRecord = {
  id: string;
  requestId: string | null;
  createdAt: string;
  summary: string;
  likelyCause: string;
  confidence: number;
  alternatives: unknown[];
  evidence: Record<string, unknown>;
  recommendedAction: string;
  modelId: string | null;
  createdBy: string;
};

type RuntimeActionCode =
  | "db.circuit_reset"
  | "db.pool_recycle"
  | "health.recheck"
  | "job.requeue"
  | "cache.flush";

type RepairActionRecord = {
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

const RUNTIME_ACTION_OPTIONS: Array<{
  code: RuntimeActionCode;
  label: string;
  hint: string;
}> = [
  {
    code: "db.circuit_reset",
    label: "Reset DB circuit",
    hint: "prepareDbRetry when the in-process circuit is open",
  },
  {
    code: "db.pool_recycle",
    label: "Recycle DB pool",
    hint: "Drop cached Postgres client (in-flight queries may fail)",
  },
  {
    code: "health.recheck",
    label: "Recheck health",
    hint: "Always available. Re-runs the ops health snapshot",
  },
  {
    code: "job.requeue",
    label: "Requeue AI job",
    hint: "Failed or running → pending by job id",
  },
  {
    code: "cache.flush",
    label: "Flush auth caches",
    hint: "In-process auth/RBAC hot caches only",
  },
];

function pillClass(ok: boolean, durationMs?: number): "ok" | "warn" | "bad" {
  if (!ok) return "bad";
  if ((durationMs ?? 0) > 2000) return "warn";
  return "ok";
}

function severityPill(severity: string): "ok" | "warn" | "bad" {
  if (severity === "cosmetic") return "ok";
  if (severity === "degraded") return "warn";
  return "bad";
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function workflowSuggestionsForEvent(e: EventRow) {
  return suggestWorkflows({
    route: e.route,
    module: e.module,
    method: e.httpMethod,
  });
}

export function OpsDiagnostics() {
  const [tab, setTab] = useState<DiagTab>("health");
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [requestId, setRequestId] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [hours, setHours] = useState("24");
  const [copied, setCopied] = useState(false);

  const [list, setList] = useState<EventRow[]>([]);
  const [timeline, setTimeline] = useState<{
    requestId: string;
    events: EventRow[];
    spans: SpanRow[];
  } | null>(null);
  const [searching, setSearching] = useState(false);

  const [registry, setRegistry] = useState<RegistryData | null>(null);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryQuery, setRegistryQuery] = useState("");

  const [workflows, setWorkflows] = useState<WorkflowsData | null>(null);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  const [diagnosis, setDiagnosis] = useState<DiagnosisRecord | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [includeAi, setIncludeAi] = useState(false);

  const [runtimeAction, setRuntimeAction] =
    useState<RuntimeActionCode>("health.recheck");
  const [runtimeJobId, setRuntimeJobId] = useState("");
  const [proposedRepair, setProposedRepair] = useState<RepairActionRecord | null>(
    null,
  );
  const [lastRepair, setLastRepair] = useState<RepairActionRecord | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeNote, setRuntimeNote] = useState<string | null>(null);

  const [proposals, setProposals] = useState<RepairActionRecord[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [proposalMarkdown, setProposalMarkdown] = useState<string | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalFiles, setProposalFiles] = useState("");
  const [proposalRationale, setProposalRationale] = useState("");
  const [proposalTestPlan, setProposalTestPlan] = useState(
    "npx tsc --noEmit; npm run diagnostics:ui-anomalies; spot-check /ops/diagnostics Health",
  );
  const [proposalVerifyNote, setProposalVerifyNote] = useState<string | null>(null);

  const openWorkflow = useCallback((id: string) => {
    setSelectedWorkflowId(id);
    setTab("workflows");
  }, []);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/diagnostics/health", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: HealthData;
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(
          body.error?.message ??
            "Ops access denied. Sign in as a platform admin (and check OPS_IP_ALLOWLIST).",
        );
        setHealth(null);
        return;
      }
      setHealth(body.data);
    } catch {
      setError("Could not load diagnostics health.");
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const search = useCallback(async (overrideId?: string) => {
    setSearching(true);
    setError(null);
    setCopied(false);
    try {
      const params = new URLSearchParams();
      const id = (overrideId ?? requestId).trim();
      if (id) params.set("requestId", id);
      if (moduleFilter.trim()) params.set("module", moduleFilter.trim());
      if (levelFilter.trim()) params.set("level", levelFilter.trim());
      params.set("hours", hours);
      params.set("limit", "80");

      const res = await fetch(`/api/ops/diagnostics/events?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          requestId?: string;
          events?: EventRow[];
          spans?: SpanRow[];
          items?: EventRow[];
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load events.");
        setList([]);
        setTimeline(null);
        return;
      }
      if (body.data.events) {
        setTimeline({
          requestId: body.data.requestId ?? id,
          events: body.data.events,
          spans: body.data.spans ?? [],
        });
        setList([]);
      } else {
        setTimeline(null);
        setDiagnosis(null);
        setList(body.data.items ?? []);
      }
    } catch {
      setError("Could not load events.");
    } finally {
      setSearching(false);
    }
  }, [hours, levelFilter, moduleFilter, requestId]);

  const loadRegistry = useCallback(async () => {
    setRegistryLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/diagnostics/registry", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: RegistryData;
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load module registry.");
        setRegistry(null);
        return;
      }
      setRegistry(body.data);
    } catch {
      setError("Could not load module registry.");
    } finally {
      setRegistryLoading(false);
    }
  }, []);

  const loadWorkflows = useCallback(async () => {
    setWorkflowsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/diagnostics/workflows", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: WorkflowsData;
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load workflows.");
        setWorkflows(null);
        return;
      }
      setWorkflows(body.data);
      setSelectedWorkflowId((prev) => prev ?? body.data!.workflows[0]?.id ?? null);
    } catch {
      setError("Could not load workflows.");
    } finally {
      setWorkflowsLoading(false);
    }
  }, []);

  const loadDiagnosis = useCallback(async (id: string) => {
    try {
      const res = await fetch(
        `/api/ops/diagnostics/diagnose?requestId=${encodeURIComponent(id)}`,
        { credentials: "include" },
      );
      const body = (await res.json()) as {
        ok: boolean;
        data?: { diagnosis?: DiagnosisRecord | null };
      };
      if (res.ok && body.ok) {
        setDiagnosis(body.data?.diagnosis ?? null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const runDiagnose = useCallback(async () => {
    const id = (timeline?.requestId || requestId).trim();
    if (!id) {
      setError("Paste a request id before diagnosing.");
      return;
    }
    setDiagnosing(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/diagnostics/diagnose", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, includeAi }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { diagnosis?: DiagnosisRecord };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.diagnosis) {
        setError(body.error?.message ?? "Diagnosis failed.");
        return;
      }
      setDiagnosis(body.data.diagnosis);
    } catch {
      setError("Diagnosis failed.");
    } finally {
      setDiagnosing(false);
    }
  }, [includeAi, requestId, timeline?.requestId]);

  const loadRecentRepairs = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/diagnostics/repair/runtime", {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items?: RepairActionRecord[] };
      };
      if (res.ok && body.ok && body.data?.items?.length) {
        setLastRepair(body.data.items[0] ?? null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const runtimeHealUnlocked =
    diagnosis?.recommendedAction === "runtime_heal" ||
    runtimeAction === "health.recheck";

  const runRuntimeHeal = useCallback(
    async (confirm: boolean) => {
      if (!runtimeHealUnlocked) {
        setError(
          "Runtime heal is disabled until a diagnosis recommends runtime_heal (health.recheck is always allowed).",
        );
        return;
      }
      if (runtimeAction === "job.requeue" && confirm && !runtimeJobId.trim()) {
        setError("job_id is required to execute job.requeue.");
        return;
      }
      setRuntimeBusy(true);
      setError(null);
      setRuntimeNote(null);
      try {
        const res = await fetch("/api/ops/diagnostics/repair/runtime", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action_code: runtimeAction,
            diagnosis_id: diagnosis?.id ?? undefined,
            job_id:
              runtimeAction === "job.requeue"
                ? runtimeJobId.trim() || undefined
                : undefined,
            repair_id: confirm ? proposedRepair?.id : undefined,
            confirm,
          }),
        });
        const body = (await res.json()) as {
          ok: boolean;
          data?: {
            repair?: RepairActionRecord;
            executed?: boolean;
            needsConfirm?: boolean;
            followUpRequestId?: string;
            healthOk?: boolean;
            note?: string;
          };
          error?: { message: string };
        };
        if (!res.ok || !body.ok || !body.data?.repair) {
          setError(body.error?.message ?? "Runtime heal failed.");
          return;
        }
        const repair = body.data.repair;
        if (body.data.executed) {
          setLastRepair(repair);
          setProposedRepair(null);
          setRuntimeNote(
            [
              repair.resultSafe ?? "Executed.",
              body.data.followUpRequestId
                ? `Follow-up requestId: ${body.data.followUpRequestId}`
                : null,
              typeof body.data.healthOk === "boolean"
                ? `Health after action: ${body.data.healthOk ? "ok" : "degraded"}`
                : null,
            ]
              .filter(Boolean)
              .join(" "),
          );
          void loadHealth();
        } else {
          setProposedRepair(repair);
          setRuntimeNote(
            `Proposed ${repair.actionCode}. Confirm to execute. Trust and fee ledgers are never touched.`,
          );
        }
      } catch {
        setError("Runtime heal request failed.");
      } finally {
        setRuntimeBusy(false);
      }
    },
    [
      diagnosis?.id,
      loadHealth,
      proposedRepair?.id,
      runtimeAction,
      runtimeHealUnlocked,
      runtimeJobId,
    ],
  );

  const loadProposals = useCallback(async () => {
    setProposalsLoading(true);
    try {
      const res = await fetch("/api/ops/diagnostics/repair/propose", {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items?: RepairActionRecord[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load proposals.");
        return;
      }
      setProposals(body.data?.items ?? []);
    } catch {
      setError("Could not load proposals.");
    } finally {
      setProposalsLoading(false);
    }
  }, []);

  const loadProposalDetail = useCallback(async (id: string) => {
    setSelectedProposalId(id);
    setProposalMarkdown(null);
    try {
      const res = await fetch(
        `/api/ops/diagnostics/repair/propose?id=${encodeURIComponent(id)}`,
        { credentials: "include" },
      );
      const body = (await res.json()) as {
        ok: boolean;
        data?: { repair?: RepairActionRecord; markdown?: string | null };
      };
      if (res.ok && body.ok) {
        setProposalMarkdown(body.data?.markdown ?? "(markdown file missing on this host)");
      }
    } catch {
      setProposalMarkdown("(failed to load markdown)");
    }
  }, []);

  const createProposalFromForm = useCallback(async () => {
    if (diagnosis?.recommendedAction !== "propose_patch" && !proposalTitle.trim()) {
      setError("Enter a title (or diagnose with recommended_action propose_patch).");
      return;
    }
    setProposalBusy(true);
    setError(null);
    setProposalVerifyNote(null);
    try {
      const files = proposalFiles
        .split(/[\n,]/)
        .map((f) => f.trim())
        .filter(Boolean);
      const res = await fetch("/api/ops/diagnostics/repair/propose", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:
            proposalTitle.trim() ||
            diagnosis?.summary?.slice(0, 160) ||
            "Diagnostic patch proposal",
          files,
          rationale:
            proposalRationale.trim() ||
            [
              diagnosis?.summary,
              diagnosis?.likelyCause ? `Likely cause: ${diagnosis.likelyCause}` : null,
            ]
              .filter(Boolean)
              .join("\n") ||
            "See linked request timeline.",
          requestId: diagnosis?.requestId || requestId.trim() || undefined,
          test_plan: proposalTestPlan.trim(),
          diagnosis_id: diagnosis?.id,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { repair?: RepairActionRecord; proposalPath?: string };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.repair) {
        setError(body.error?.message ?? "Could not create proposal.");
        return;
      }
      setTab("proposals");
      await loadProposals();
      await loadProposalDetail(body.data.repair.id);
      setProposalVerifyNote(
        `Created ${body.data.proposalPath ?? body.data.repair.proposalPath}. Human applies via PR. No src/ write.`,
      );
    } catch {
      setError("Could not create proposal.");
    } finally {
      setProposalBusy(false);
    }
  }, [
    diagnosis,
    loadProposalDetail,
    loadProposals,
    proposalFiles,
    proposalRationale,
    proposalTestPlan,
    proposalTitle,
    requestId,
  ]);

  const setProposalStatus = useCallback(
    async (id: string, status: "approved" | "rejected" | "succeeded" | "rolled_back") => {
      setProposalBusy(true);
      setError(null);
      setProposalVerifyNote(null);
      try {
        const res = await fetch("/api/ops/diagnostics/repair/propose", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status }),
        });
        const body = (await res.json()) as {
          ok: boolean;
          data?: {
            repair?: RepairActionRecord;
            verify?: { ok: boolean; log: string; healthOk?: boolean };
          };
          error?: { message: string };
        };
        if (!res.ok || !body.ok || !body.data?.repair) {
          setError(body.error?.message ?? "Status update failed.");
          return;
        }
        if (body.data.verify) {
          setProposalVerifyNote(
            `Verify ${body.data.verify.ok ? "ok" : "issues"}: ${body.data.verify.log}` +
              (typeof body.data.verify.healthOk === "boolean"
                ? ` | health ${body.data.verify.healthOk ? "ok" : "degraded"}`
                : ""),
          );
          void loadHealth();
        } else {
          setProposalVerifyNote(`Status → ${body.data.repair.status}`);
        }
        await loadProposals();
        await loadProposalDetail(id);
      } catch {
        setError("Status update failed.");
      } finally {
        setProposalBusy(false);
      }
    },
    [loadHealth, loadProposalDetail, loadProposals],
  );

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("requestId")?.trim() ?? "";
    if (fromUrl) {
      setRequestId(fromUrl);
      setTab("events");
    }
    void loadHealth();
    void loadRecentRepairs();
    if (fromUrl) void search(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL bootstrap once
  }, [loadHealth, loadRecentRepairs]);

  useEffect(() => {
    if (tab === "registry" && !registry && !registryLoading) void loadRegistry();
  }, [tab, registry, registryLoading, loadRegistry]);

  useEffect(() => {
    if (tab === "workflows" && !workflows && !workflowsLoading) void loadWorkflows();
  }, [tab, workflows, workflowsLoading, loadWorkflows]);

  useEffect(() => {
    if (tab === "proposals" && proposals.length === 0 && !proposalsLoading) {
      void loadProposals();
    }
  }, [tab, proposals.length, proposalsLoading, loadProposals]);

  useEffect(() => {
    if (timeline?.requestId) void loadDiagnosis(timeline.requestId);
  }, [timeline?.requestId, loadDiagnosis]);

  useEffect(() => {
    if (!diagnosis) return;
    if (diagnosis.recommendedAction === "propose_patch") {
      setProposalTitle((prev) => prev || diagnosis.summary.slice(0, 160));
      setProposalRationale(
        (prev) =>
          prev ||
          [diagnosis.summary, `Likely cause: ${diagnosis.likelyCause}`].join("\n"),
      );
    }
  }, [diagnosis]);

  const failing = useMemo(
    () => health?.checks.filter((c) => !c.ok).map((c) => c.name) ?? [],
    [health],
  );

  const registryFiltered = useMemo(() => {
    if (!registry) return [];
    const q = registryQuery.trim().toLowerCase();
    if (!q) return registry.modules;
    return registry.modules.filter((m) => {
      const hay = [
        m.code,
        m.owner,
        m.severity,
        m.recoveryHint,
        ...m.nav.map((n) => `${n.href} ${n.label}`),
        ...m.apiRoutes,
        ...m.tables,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [registry, registryQuery]);

  const selectedWorkflow = useMemo(
    () => workflows?.workflows.find((w) => w.id === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId],
  );

  const timelineSuggestions = useMemo(() => {
    if (!timeline) return [] as Array<{ event: EventRow; ids: string[] }>;
    return timeline.events
      .filter((e) => e.level === "error" || e.level === "warn" || (e.httpStatus ?? 0) >= 400)
      .map((event) => ({
        event,
        ids: workflowSuggestionsForEvent(event).map((w) => w.id),
      }))
      .filter((row) => row.ids.length > 0);
  }, [timeline]);

  return (
    <>
      <section className="ops-card">
        <h2>System diagnostics</h2>
        <p className="ops-muted" style={{ margin: 0 }}>
          Platform operators only. Redacted technical timelines. No matter titles, KYC, or amounts.
        </p>
        {error ? (
          <p style={{ color: "#b42318", margin: "0.75rem 0 0" }}>{error}</p>
        ) : null}
        <div className="ops-tabs" role="tablist" aria-label="Diagnostics sections" style={{ marginTop: "0.85rem" }}>
          <button
            type="button"
            className="ops-tab"
            role="tab"
            aria-selected={tab === "health"}
            onClick={() => setTab("health")}
          >
            Health
          </button>
          <button
            type="button"
            className="ops-tab"
            role="tab"
            aria-selected={tab === "events"}
            onClick={() => setTab("events")}
          >
            Events
          </button>
          <button
            type="button"
            className="ops-tab"
            role="tab"
            aria-selected={tab === "registry"}
            onClick={() => setTab("registry")}
          >
            Registry
          </button>
          <button
            type="button"
            className="ops-tab"
            role="tab"
            aria-selected={tab === "workflows"}
            onClick={() => setTab("workflows")}
          >
            Workflows
          </button>
          <button
            type="button"
            className="ops-tab"
            role="tab"
            aria-selected={tab === "proposals"}
            onClick={() => setTab("proposals")}
          >
            Proposals
          </button>
        </div>
      </section>

      {tab === "health" ? (
        <section className="ops-card">
          <div className="ops-strip">
            <h2 style={{ margin: 0 }}>Health board</h2>
            {health ? (
              <span className={`ops-pill ${health.ok ? "ok" : "bad"}`}>
                {health.ok ? "Healthy" : "Degraded"}
              </span>
            ) : null}
            <button
              type="button"
              className="ops-btn outline"
              disabled={healthLoading}
              onClick={() => void loadHealth()}
            >
              {healthLoading ? "Loading…" : "Refresh health"}
            </button>
          </div>
          {healthLoading && !health ? <p className="ops-muted">Loading checks…</p> : null}
          {health ? (
            <div className="ops-check-grid" style={{ marginTop: "0.75rem" }}>
              {failing.length > 0 ? (
                <p className="ops-muted" style={{ margin: 0 }}>
                  Failing: {failing.join(", ")}
                </p>
              ) : null}
              {health.checks.map((c) => (
                <div className="ops-check-row" key={c.name}>
                  <div>
                    <span className={`ops-pill ${pillClass(c.ok, c.durationMs)}`}>
                      {c.ok ? "ok" : "fail"}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="ops-muted">{c.safeDetail}</div>
                  </div>
                  <div className="ops-muted">{c.durationMs} ms</div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "events" ? (
        <>
          <section className="ops-card">
            <h2>Event search</h2>
            <div className="ops-form" style={{ maxWidth: "100%" }}>
              <label>
                Request id
                <input
                  className="ops-mono"
                  value={requestId}
                  onChange={(e) => setRequestId(e.target.value)}
                  placeholder="Paste reference from a staff error"
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 8rem", gap: "0.5rem" }}>
                <label>
                  Module
                  <input
                    value={moduleFilter}
                    onChange={(e) => setModuleFilter(e.target.value)}
                    placeholder="auth, db, finance.trust"
                  />
                </label>
                <label>
                  Level
                  <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
                    <option value="">any</option>
                    <option value="error">error</option>
                    <option value="warn">warn</option>
                    <option value="info">info</option>
                  </select>
                </label>
                <label>
                  Window
                  <select value={hours} onChange={(e) => setHours(e.target.value)}>
                    <option value="1">1 hour</option>
                    <option value="24">24 hours</option>
                    <option value="72">3 days</option>
                    <option value="168">7 days</option>
                  </select>
                </label>
              </div>
              <div className="ops-actions">
                <button
                  type="button"
                  className="ops-btn"
                  disabled={searching}
                  onClick={() => void search()}
                >
                  {searching ? "Searching…" : "Search"}
                </button>
                {requestId.trim() ? (
                  <button
                    type="button"
                    className="ops-btn outline"
                    onClick={async () => {
                      const ok = await copyText(requestId.trim());
                      setCopied(ok);
                    }}
                  >
                    {copied ? "Copied" : "Copy request id"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ops-btn outline"
                  disabled={diagnosing || !requestId.trim()}
                  onClick={() => void runDiagnose()}
                >
                  {diagnosing ? "Diagnosing…" : "Diagnose"}
                </button>
                <label className="ops-muted" style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={includeAi}
                    onChange={(e) => setIncludeAi(e.target.checked)}
                  />
                  Force AI
                </label>
              </div>
            </div>
          </section>

          {diagnosis && tab === "events" ? (
            <section className="ops-card">
              <div className="ops-strip">
                <h2 style={{ margin: 0 }}>Diagnosis</h2>
                <span className={`ops-pill ${diagnosis.confidence >= 80 ? "ok" : diagnosis.confidence >= 50 ? "warn" : "bad"}`}>
                  {diagnosis.confidence}% confidence
                </span>
                <span className="ops-muted">
                  {diagnosis.modelId ? `AI ${diagnosis.modelId}` : "Rules only"}
                </span>
              </div>
              <p style={{ margin: "0.5rem 0 0.25rem" }}>{diagnosis.summary}</p>
              <p className="ops-muted" style={{ margin: "0 0 0.5rem" }}>
                Likely cause: {diagnosis.likelyCause}
              </p>
              <p style={{ margin: "0 0 0.35rem" }}>
                Recommended action: <span className="ops-mono">{diagnosis.recommendedAction}</span>
              </p>
              {Array.isArray(diagnosis.alternatives) && diagnosis.alternatives.length > 0 ? (
                <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.2rem" }}>
                  {diagnosis.alternatives.map((a) => (
                    <li key={String(a)} className="ops-muted">
                      {String(a)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="ops-muted" style={{ margin: "0.65rem 0 0", fontSize: "0.78rem" }}>
                Diagnosis only. There is no Apply fix that writes production code. Use Runtime actions
                for allowlisted heals, or Proposals for markdown patch plans.
              </p>
              {diagnosis.recommendedAction === "propose_patch" ? (
                <div className="ops-actions" style={{ marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    className="ops-btn"
                    disabled={proposalBusy}
                    onClick={() => {
                      setTab("proposals");
                      void createProposalFromForm();
                    }}
                  >
                    {proposalBusy ? "Creating…" : "Create patch proposal"}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === "events" ? (
            <section className="ops-card">
              <div className="ops-strip">
                <h2 style={{ margin: 0 }}>Runtime actions</h2>
                <span className={`ops-pill ${runtimeHealUnlocked ? "ok" : "warn"}`}>
                  {runtimeHealUnlocked ? "Unlocked" : "Locked"}
                </span>
              </div>
              <p className="ops-muted" style={{ margin: "0.5rem 0" }}>
                Allowlisted runtime heal only. Two-step propose then confirm. No trust or fee posting,
                no source edits, no arbitrary SQL.
              </p>
              {!runtimeHealUnlocked ? (
                <p className="ops-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.78rem" }}>
                  Disabled until a diagnosis recommends <span className="ops-mono">runtime_heal</span>
                  . <span className="ops-mono">health.recheck</span> stays available.
                </p>
              ) : null}
              <div className="ops-filters" style={{ marginBottom: "0.75rem" }}>
                <label>
                  Action
                  <select
                    value={runtimeAction}
                    onChange={(e) => {
                      setRuntimeAction(e.target.value as RuntimeActionCode);
                      setProposedRepair(null);
                      setRuntimeNote(null);
                    }}
                  >
                    {RUNTIME_ACTION_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                {runtimeAction === "job.requeue" ? (
                  <label>
                    AI job id
                    <input
                      value={runtimeJobId}
                      onChange={(e) => setRuntimeJobId(e.target.value)}
                      placeholder="uuid"
                      className="ops-mono"
                    />
                  </label>
                ) : null}
              </div>
              <p className="ops-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.78rem" }}>
                {RUNTIME_ACTION_OPTIONS.find((o) => o.code === runtimeAction)?.hint}
              </p>
              <div className="ops-actions">
                <button
                  type="button"
                  className="ops-btn outline"
                  disabled={runtimeBusy || !runtimeHealUnlocked}
                  onClick={() => void runRuntimeHeal(false)}
                >
                  {runtimeBusy && !proposedRepair ? "Proposing…" : "Propose"}
                </button>
                <button
                  type="button"
                  className="ops-btn"
                  disabled={
                    runtimeBusy ||
                    !runtimeHealUnlocked ||
                    !proposedRepair ||
                    proposedRepair.actionCode !== runtimeAction
                  }
                  onClick={() => void runRuntimeHeal(true)}
                >
                  {runtimeBusy && proposedRepair ? "Executing…" : "Confirm execute"}
                </button>
              </div>
              {proposedRepair ? (
                <p style={{ margin: "0.75rem 0 0" }}>
                  Proposed repair <span className="ops-mono">{proposedRepair.id}</span> (
                  {proposedRepair.actionCode}, {proposedRepair.status}). Confirm to run.
                </p>
              ) : null}
              {runtimeNote ? (
                <p className="ops-muted" style={{ margin: "0.5rem 0 0" }}>
                  {runtimeNote}
                </p>
              ) : null}
              {lastRepair ? (
                <div style={{ marginTop: "0.85rem" }}>
                  <div className="ops-muted">Last result</div>
                  <p style={{ margin: "0.25rem 0 0" }}>
                    <span className="ops-mono">{lastRepair.actionCode}</span>{" "}
                    <span className={`ops-pill ${lastRepair.status === "succeeded" ? "ok" : lastRepair.status === "failed" ? "bad" : "warn"}`}>
                      {lastRepair.status}
                    </span>
                  </p>
                  {lastRepair.resultSafe ? (
                    <p className="ops-muted" style={{ margin: "0.25rem 0 0" }}>
                      {lastRepair.resultSafe}
                    </p>
                  ) : null}
                  <p className="ops-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>
                    {lastRepair.executedAt ?? lastRepair.createdAt}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          {timeline ? (
            <section className="ops-card">
              <div className="ops-strip">
                <h2 style={{ margin: 0 }}>Timeline</h2>
                <span className="ops-mono">{timeline.requestId}</span>
                <button
                  type="button"
                  className="ops-btn outline"
                  onClick={async () => {
                    const ok = await copyText(timeline.requestId);
                    setCopied(ok);
                  }}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="ops-btn"
                  disabled={diagnosing}
                  onClick={() => void runDiagnose()}
                >
                  {diagnosing ? "Diagnosing…" : "Diagnose"}
                </button>
                <label className="ops-muted" style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={includeAi}
                    onChange={(e) => setIncludeAi(e.target.checked)}
                  />
                  Force AI opinion
                </label>
              </div>
              {timelineSuggestions.length > 0 ? (
                <div style={{ marginTop: "0.75rem" }}>
                  <div className="ops-muted">Suggested workflows from failed or warn events</div>
                  <div className="ops-chip-list" style={{ marginTop: "0.35rem" }}>
                    {[...new Set(timelineSuggestions.flatMap((s) => s.ids))].map((id) => (
                      <button
                        type="button"
                        key={id}
                        className="ops-btn outline"
                        style={{ fontSize: "0.75rem" }}
                        onClick={() => openWorkflow(id)}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {timeline.events.length === 0 ? (
                <p className="ops-muted">
                  No events stored for this id yet. Confirm migration 0025 is applied.
                </p>
              ) : (
                <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Level</th>
                        <th>Module</th>
                        <th>Code</th>
                        <th>Message</th>
                        <th>Workflow</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.events.map((e) => {
                        const suggested = workflowSuggestionsForEvent(e);
                        return (
                          <tr key={e.id}>
                            <td className="ops-muted">
                              {e.createdAt.replace("T", " ").slice(0, 19)}
                            </td>
                            <td>
                              <span
                                className={`ops-pill ${e.level === "error" ? "bad" : e.level === "warn" ? "warn" : "ok"}`}
                              >
                                {e.level}
                              </span>
                            </td>
                            <td>
                              {e.module}
                              <div className="ops-muted">
                                {e.httpMethod ?? ""} {e.route ?? ""}
                              </div>
                            </td>
                            <td className="ops-mono">
                              {e.errorCode ?? "—"}
                              {e.sqlstate ? ` · ${e.sqlstate}` : ""}
                            </td>
                            <td>{e.messageSafe}</td>
                            <td>
                              {suggested.length === 0 ? (
                                <span className="ops-muted">—</span>
                              ) : (
                                <div className="ops-actions">
                                  {suggested.map((w) => (
                                    <button
                                      type="button"
                                      key={w.id}
                                      className="ops-btn outline"
                                      style={{ fontSize: "0.72rem" }}
                                      onClick={() => openWorkflow(w.id)}
                                    >
                                      {w.id}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {timeline.spans.length > 0 ? (
                <div style={{ marginTop: "1rem" }}>
                  <h3 style={{ fontSize: "0.95rem" }}>Spans</h3>
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Ok</th>
                        <th>ms</th>
                        <th>Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.spans.map((s) => (
                        <tr key={s.id}>
                          <td className="ops-mono">{s.name}</td>
                          <td>{s.ok ? "yes" : "no"}</td>
                          <td>{s.durationMs ?? "—"}</td>
                          <td>{s.errorCode ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="ops-card">
              <h2>Recent events</h2>
              {list.length === 0 ? (
                <p className="ops-muted">Search to list recent redacted events (no request id).</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Request id</th>
                        <th>Level</th>
                        <th>Module</th>
                        <th>Message</th>
                        <th>Workflow</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((e) => {
                        const suggested = workflowSuggestionsForEvent(e);
                        return (
                          <tr key={e.id}>
                            <td className="ops-muted">
                              {e.createdAt.replace("T", " ").slice(0, 19)}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="ops-btn outline"
                                style={{ fontSize: "0.75rem" }}
                                onClick={() => {
                                  setRequestId(e.requestId);
                                  void search(e.requestId);
                                }}
                              >
                                Use
                              </button>
                              <div className="ops-mono">{e.requestId}</div>
                            </td>
                            <td>{e.level}</td>
                            <td>{e.module}</td>
                            <td>{e.messageSafe}</td>
                            <td>
                              {suggested.length === 0 ? (
                                <span className="ops-muted">—</span>
                              ) : (
                                <div className="ops-actions">
                                  {suggested.map((w) => (
                                    <button
                                      type="button"
                                      key={w.id}
                                      className="ops-btn outline"
                                      style={{ fontSize: "0.72rem" }}
                                      onClick={() => openWorkflow(w.id)}
                                    >
                                      {w.id}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      ) : null}

      {tab === "registry" ? (
        <section className="ops-card">
          <div className="ops-strip">
            <h2 style={{ margin: 0 }}>Module registry</h2>
            <button
              type="button"
              className="ops-btn outline"
              disabled={registryLoading}
              onClick={() => void loadRegistry()}
            >
              {registryLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
          <p className="ops-muted">
            Generated from nav, API routes, and Drizzle tables, plus a hand overlay for severity and
            recovery. Workflow steps are not encoded here.
          </p>
          <div className="ops-form" style={{ maxWidth: "100%" }}>
            <label>
              Search modules, routes, or tables
              <input
                value={registryQuery}
                onChange={(e) => setRegistryQuery(e.target.value)}
                placeholder="finance.trust, /api/invoices, clients"
              />
            </label>
          </div>
          {registryLoading && !registry ? <p className="ops-muted">Loading registry…</p> : null}
          {registry ? (
            <p className="ops-muted">
              Snapshot {registry.generatedAt.replace("T", " ").slice(0, 19)} UTC. Showing{" "}
              {registryFiltered.length} of {registry.modules.length} modules.
            </p>
          ) : null}
          {registryFiltered.map((m) => (
            <div
              key={m.code}
              style={{
                marginTop: "1rem",
                paddingTop: "0.85rem",
                borderTop: "1px solid rgba(20, 32, 51, 0.08)",
              }}
            >
              <div className="ops-strip">
                <strong className="ops-mono">{m.code}</strong>
                <span className={`ops-pill ${severityPill(m.severity)}`}>{m.severity}</span>
                <span className="ops-muted">{m.owner}</span>
              </div>
              <p style={{ margin: "0.4rem 0 0.6rem" }}>{m.recoveryHint}</p>
              {m.nav.length > 0 ? (
                <div style={{ marginBottom: "0.4rem" }}>
                  <div className="ops-muted">Nav</div>
                  <div className="ops-chip-list">
                    {m.nav.map((n) => (
                      <span className="ops-chip" key={n.href}>
                        {n.href}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {m.apiRoutes.length > 0 ? (
                <div style={{ marginBottom: "0.4rem" }}>
                  <div className="ops-muted">API ({m.apiRoutes.length})</div>
                  <div className="ops-chip-list">
                    {m.apiRoutes.slice(0, 24).map((r) => (
                      <span className="ops-chip" key={r}>
                        {r}
                      </span>
                    ))}
                    {m.apiRoutes.length > 24 ? (
                      <span className="ops-muted">+{m.apiRoutes.length - 24} more</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {m.tables.length > 0 ? (
                <div>
                  <div className="ops-muted">Tables</div>
                  <div className="ops-chip-list">
                    {m.tables.map((t) => (
                      <span className="ops-chip" key={t}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {registry &&
          (registry.unmatchedNav.length > 0 ||
            registry.unmatchedApiRoutes.length > 0 ||
            registry.unmatchedTables.length > 0) ? (
            <div
              style={{
                marginTop: "1.25rem",
                paddingTop: "0.85rem",
                borderTop: "1px solid rgba(20, 32, 51, 0.08)",
              }}
            >
              <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.4rem" }}>
                Unmatched (no overlay prefix or table map)
              </h3>
              {registry.unmatchedNav.length > 0 ? (
                <p className="ops-muted">
                  Nav: {registry.unmatchedNav.map((n) => n.href).join(", ")}
                </p>
              ) : null}
              {registry.unmatchedApiRoutes.length > 0 ? (
                <p className="ops-muted">API: {registry.unmatchedApiRoutes.join(", ")}</p>
              ) : null}
              {registry.unmatchedTables.length > 0 ? (
                <p className="ops-muted">Tables: {registry.unmatchedTables.join(", ")}</p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "workflows" ? (
        <section className="ops-card">
          <div className="ops-strip">
            <h2 style={{ margin: 0 }}>Workflow contracts</h2>
            <button
              type="button"
              className="ops-btn outline"
              disabled={workflowsLoading}
              onClick={() => void loadWorkflows()}
            >
              {workflowsLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
          <p className="ops-muted">
            Seven LexZim v1 paths. Trust receipt is never a fee payment. Invoice create depends on GL
            posting (`postInvoiceSentGl` when sent).
          </p>
          {workflowsLoading && !workflows ? <p className="ops-muted">Loading workflows…</p> : null}
          {workflows ? (
            <>
              <div className="ops-chip-list" style={{ marginTop: "0.5rem" }}>
                {workflows.workflows.map((w) => (
                  <button
                    type="button"
                    key={w.id}
                    className="ops-tab"
                    aria-selected={selectedWorkflowId === w.id}
                    onClick={() => setSelectedWorkflowId(w.id)}
                  >
                    {w.id}
                  </button>
                ))}
              </div>
              {selectedWorkflow ? (
                <div style={{ marginTop: "1rem" }}>
                  <div className="ops-strip">
                    <strong>{selectedWorkflow.title}</strong>
                    <span className="ops-mono">{selectedWorkflow.id}</span>
                    <span className="ops-muted">{selectedWorkflow.module}</span>
                    {selectedWorkflow.userBlocker ? (
                      <span className="ops-pill bad">user blocker</span>
                    ) : (
                      <span className="ops-pill warn">not user blocker</span>
                    )}
                  </div>
                  <p>{selectedWorkflow.summary}</p>
                  <p className="ops-muted">
                    Expected HTTP {selectedWorkflow.expectedStatus.join(", ")}. Dependencies:{" "}
                    {selectedWorkflow.dependencies.join(", ") || "none"}.
                  </p>
                  <p className="ops-muted">
                    Failure classes: {selectedWorkflow.failureClasses.join(", ")}.
                  </p>
                  <h3 style={{ fontSize: "0.95rem" }}>Steps</h3>
                  <ol style={{ margin: "0.35rem 0 0.75rem", paddingLeft: "1.2rem" }}>
                    {selectedWorkflow.steps.map((s) => (
                      <li key={s.id}>
                        <span className="ops-mono">{s.name}</span>
                        <span className="ops-muted"> ({s.kind})</span>
                      </li>
                    ))}
                  </ol>
                  {selectedWorkflow.notes.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                      {selectedWorkflow.notes.map((n) => (
                        <li key={n} className="ops-muted">
                          {n}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <div
                style={{
                  marginTop: "1.25rem",
                  paddingTop: "0.85rem",
                  borderTop: "1px solid rgba(20, 32, 51, 0.08)",
                }}
              >
                <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.4rem" }}>Dependency edges</h3>
                <div style={{ overflowX: "auto" }}>
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>From</th>
                        <th>To</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workflows.graph.edges.map((e) => (
                        <tr key={`${e.from}->${e.to}:${e.reason}`}>
                          <td className="ops-mono">{e.from}</td>
                          <td className="ops-mono">{e.to}</td>
                          <td>{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="ops-muted" style={{ marginTop: "0.75rem" }}>
                  Mermaid diagram: docs/PHASE8_WORKFLOWS.md. No edge between fee payment and trust
                  receipt.
                </p>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "proposals" ? (
        <section className="ops-card">
          <div className="ops-strip">
            <h2 style={{ margin: 0 }}>Patch proposals</h2>
            <button
              type="button"
              className="ops-btn outline"
              disabled={proposalsLoading}
              onClick={() => void loadProposals()}
            >
              {proposalsLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
          <p className="ops-muted">
            Markdown under <span className="ops-mono">docs/diagnostics/proposals/</span>. Humans apply
            via PR. There is no button that writes production source.
          </p>

          <div className="ops-filters" style={{ marginTop: "0.75rem" }}>
            <label>
              Title
              <input
                value={proposalTitle}
                onChange={(e) => setProposalTitle(e.target.value)}
                placeholder="Short redacted title"
              />
            </label>
            <label>
              Files (comma or newline)
              <input
                value={proposalFiles}
                onChange={(e) => setProposalFiles(e.target.value)}
                placeholder="styles/tpfigu.css, components/…"
                className="ops-mono"
              />
            </label>
          </div>
          <label style={{ display: "block", marginTop: "0.5rem" }}>
            Rationale
            <textarea
              value={proposalRationale}
              onChange={(e) => setProposalRationale(e.target.value)}
              rows={3}
              style={{ width: "100%", marginTop: "0.25rem" }}
            />
          </label>
          <label style={{ display: "block", marginTop: "0.5rem" }}>
            Test plan
            <textarea
              value={proposalTestPlan}
              onChange={(e) => setProposalTestPlan(e.target.value)}
              rows={2}
              style={{ width: "100%", marginTop: "0.25rem" }}
            />
          </label>
          <div className="ops-actions" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="ops-btn"
              disabled={proposalBusy || !proposalTitle.trim()}
              onClick={() => void createProposalFromForm()}
            >
              {proposalBusy ? "Working…" : "Create proposal"}
            </button>
          </div>
          {proposalVerifyNote ? (
            <p className="ops-muted" style={{ marginTop: "0.65rem" }}>
              {proposalVerifyNote}
            </p>
          ) : null}

          {proposalsLoading && proposals.length === 0 ? (
            <p className="ops-muted">Loading proposals…</p>
          ) : null}
          {proposals.length === 0 && !proposalsLoading ? (
            <p className="ops-muted" style={{ marginTop: "0.75rem" }}>
              No proposals yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: "0.85rem" }}>
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Status</th>
                    <th>Path</th>
                    <th>Title / result</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((p) => (
                    <tr key={p.id}>
                      <td className="ops-mono" style={{ whiteSpace: "nowrap" }}>
                        {p.createdAt.slice(0, 19)}
                      </td>
                      <td>
                        <span
                          className={`ops-pill ${
                            p.status === "succeeded"
                              ? "ok"
                              : p.status === "rejected" || p.status === "failed"
                                ? "bad"
                                : "warn"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="ops-mono">{p.proposalPath ?? "—"}</td>
                      <td>{p.resultSafe ?? "—"}</td>
                      <td>
                        <button
                          type="button"
                          className="ops-btn outline"
                          style={{ fontSize: "0.75rem" }}
                          onClick={() => void loadProposalDetail(p.id)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedProposalId ? (
            <div style={{ marginTop: "1rem" }}>
              <div className="ops-strip">
                <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Proposal detail</h3>
                <span className="ops-mono">{selectedProposalId}</span>
              </div>
              <div className="ops-actions" style={{ margin: "0.65rem 0" }}>
                <button
                  type="button"
                  className="ops-btn outline"
                  disabled={proposalBusy}
                  onClick={() => void setProposalStatus(selectedProposalId, "approved")}
                >
                  Approve plan
                </button>
                <button
                  type="button"
                  className="ops-btn outline"
                  disabled={proposalBusy}
                  onClick={() => void setProposalStatus(selectedProposalId, "rejected")}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="ops-btn"
                  disabled={proposalBusy}
                  onClick={() => void setProposalStatus(selectedProposalId, "succeeded")}
                >
                  Mark applied
                </button>
                <button
                  type="button"
                  className="ops-btn outline"
                  disabled={proposalBusy}
                  onClick={() => void setProposalStatus(selectedProposalId, "rolled_back")}
                >
                  Mark rolled back
                </button>
              </div>
              <pre
                className="ops-mono"
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: "0.75rem",
                  maxHeight: "28rem",
                  overflow: "auto",
                  margin: 0,
                  padding: "0.75rem",
                  background: "rgba(20, 32, 51, 0.04)",
                }}
              >
                {proposalMarkdown ?? "Loading…"}
              </pre>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
