"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MatterDeadlinesPanel } from "@/components/matters/MatterDeadlinesPanel";
import { MatterDisbursementsPanel } from "@/components/matters/MatterDisbursementsPanel";
import { MatterTimePanel } from "@/components/matters/MatterTimePanel";
import { MatterProceduresPanel } from "@/components/matters/MatterProceduresPanel";
import { MatterTimelinePanel } from "@/components/matters/MatterTimelinePanel";
import { MatterDocumentsPanel } from "@/components/matters/MatterDocumentsPanel";
import { MatterPortalPanel } from "@/components/matters/MatterPortalPanel";
import { RelatedPartiesPanel } from "@/components/parties/RelatedPartiesPanel";
import { MATTER_STATUSES, statusLabel } from "@/lib/matters/validation";
import { toMatterFormValues } from "@/lib/matters/form-values";
import type { MatterStatus } from "@/lib/db/mvp-types";

export { toMatterFormValues };

type MatterDetail = {
  id: string;
  clientId: string;
  title: string;
  description: string | null;
  areaOfLaw: string;
  status: string;
  statusLabel: string;
  matterNumber: string | null;
  fileRef: string | null;
  courtName: string | null;
  caseNumber: string | null;
  responsibleLawyerId: string | null;
  responsibleLawyerName: string | null;
  clientDisplayName: string | null;
  openedAt: string | null;
  closedAt: string | null;
  nextHearingAt: string | null;
  priority: string | null;
  createdAt: string;
  updatedAt: string;
};

type MatterEvent = {
  id: string;
  eventType: string;
  eventTypeLabel: string;
  title: string;
  body: string | null;
  eventAt: string;
  createdByName: string | null;
};

type TabId =
  | "overview"
  | "procedures"
  | "deadlines"
  | "time"
  | "costs"
  | "timeline"
  | "documents"
  | "portal"
  | "parties";

type MatterDetailViewProps = {
  matter: MatterDetail;
  events: MatterEvent[];
};

function statusTone(status: string): "open" | "pending" | "closed" | "danger" | "default" {
  switch (status) {
    case "open":
      return "open";
    case "prospective":
    case "on_hold":
      return "pending";
    case "closed":
    case "archived":
      return "closed";
    default:
      return "default";
  }
}

export function MatterDetailView({ matter, events }: MatterDetailViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("overview");
  const [status, setStatus] = useState(matter.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onStatusChange(next: string) {
    if (next === status) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/matters/${matter.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: next }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update status.");
        return;
      }
      setStatus(next);
      router.refresh();
    } catch {
      setError("Could not update status.");
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "procedures", label: "Procedures" },
    { id: "deadlines", label: "Deadlines" },
    { id: "time", label: "Time" },
    { id: "costs", label: "Costs" },
    { id: "timeline", label: "Timeline" },
    { id: "documents", label: "Documents" },
    { id: "portal", label: "Portal" },
    { id: "parties", label: "Parties" },
  ];

  return (
    <section className="view active scrollable" aria-label="Matter detail">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>{matter.title}</h3>
            <p className="muted" style={{ marginTop: "0.25rem" }}>
              {matter.clientDisplayName ? (
                <>
                  Client:{" "}
                  <Link href={`/clients/${matter.clientId}`}>{matter.clientDisplayName}</Link>
                </>
              ) : (
                "Matter hub"
              )}
              {matter.matterNumber ? ` · ${matter.matterNumber}` : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
            <Can permission="matters.edit">
              <select
                className="filter-select"
                value={status}
                disabled={loading}
                onChange={(e) => onStatusChange(e.target.value)}
                aria-label="Change status"
              >
                {MATTER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
              <Link href={`/matters/${matter.id}/edit`} className="btn btn-outline btn-sm">
                Edit
              </Link>
            </Can>
          </div>
        </div>
        <p className="muted" style={{ margin: "0 1rem 0.75rem", fontSize: "0.85rem" }}>
          Closing or archiving a matter keeps fee invoices and payments for revenue history.
          Permanent client/finance wipe is LexZim development/ops only.
        </p>
        <div className="panel-body">
          {error ? (
            <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</p>
          ) : null}

          <div className="toolbar" style={{ marginBottom: "1rem" }}>
            {tabs.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={tab === t.id ? "primary" : "outline"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          {tab === "overview" ? (
            <>
              <div className="grid-2">
                <DetailField label="Area of law" value={matter.areaOfLaw} />
                <DetailField label="Priority" value={matter.priority} />
                <DetailField label="File reference" value={matter.fileRef} />
                <DetailField label="Court" value={matter.courtName} />
                <DetailField label="Case number" value={matter.caseNumber} />
                <DetailField label="Responsible lawyer" value={matter.responsibleLawyerName} />
                <DetailField
                  label="Next hearing"
                  value={
                    matter.nextHearingAt
                      ? new Date(matter.nextHearingAt).toLocaleString()
                      : null
                  }
                />
                <DetailField
                  label="Opened"
                  value={matter.openedAt ? new Date(matter.openedAt).toLocaleString() : null}
                />
                <DetailField
                  label="Closed"
                  value={matter.closedAt ? new Date(matter.closedAt).toLocaleString() : null}
                />
              </div>
              <DetailField label="Description" value={matter.description} block />
              <p className="muted" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
                Created {new Date(matter.createdAt).toLocaleString()} · Updated{" "}
                {new Date(matter.updatedAt).toLocaleString()}
              </p>
            </>
          ) : null}

          {tab === "timeline" ? (
            <MatterTimelinePanel matterId={matter.id} initialEvents={events} />
          ) : null}

          {tab === "procedures" ? <MatterProceduresPanel matterId={matter.id} /> : null}
          {tab === "deadlines" ? <MatterDeadlinesPanel matterId={matter.id} /> : null}
          {tab === "time" ? <MatterTimePanel matterId={matter.id} /> : null}
          {tab === "costs" ? <MatterDisbursementsPanel matterId={matter.id} /> : null}
          {tab === "documents" ? <MatterDocumentsPanel matterId={matter.id} /> : null}
          {tab === "portal" ? (
            <MatterPortalPanel
              matterId={matter.id}
              clientId={matter.clientId}
              clientDisplayName={matter.clientDisplayName}
            />
          ) : null}
          {tab === "parties" ? (
            <RelatedPartiesPanel scope="matter" scopeId={matter.id} />
          ) : null}

          <div style={{ marginTop: "1.5rem" }}>
            <Link href="/matters" className="btn btn-outline btn-sm">
              Back to matters
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailField({
  label,
  value,
  block = false,
}: {
  label: string;
  value: string | null | undefined;
  block?: boolean;
}) {
  return (
    <div className="form-group" style={block ? { gridColumn: "1 / -1" } : undefined}>
      <label>{label}</label>
      <div>{value?.trim() ? value : "—"}</div>
    </div>
  );
}

