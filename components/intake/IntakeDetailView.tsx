"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { IntakeConvertPanel } from "@/components/intake/IntakeConvertPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type Intake = {
  id: string;
  prospectName: string;
  status: string;
  statusNormalized: string;
  statusLabel: string;
  contactEmail: string | null;
  contactPhone: string | null;
  areaOfLaw: string | null;
  matterSummary: string | null;
  opposingParty: string | null;
  assigneeName: string | null;
  convertedClientId: string | null;
  convertedMatterId: string | null;
  editable: boolean;
  updatedAt: string;
  createdAt: string;
};

type ConflictCheck = {
  id: string;
  query: string;
  result: string;
  notes: string | null;
  checkedAt: string | null;
  hitCount?: number | null;
  hasPartnerOverride?: boolean;
};

type ConflictHit = {
  source: string;
  id: string;
  label: string;
  field: string;
  matchedValue: string;
  strength: string;
  href: string;
};

type ConversionGate = {
  allowed: boolean;
  reason: string;
};

type IntakeDetailViewProps = {
  intakeId: string;
};

export function IntakeDetailView({ intakeId }: IntakeDetailViewProps) {
  const [intake, setIntake] = useState<Intake | null>(null);
  const [checks, setChecks] = useState<ConflictCheck[]>([]);
  const [hits, setHits] = useState<ConflictHit[]>([]);
  const [disclaimer, setDisclaimer] = useState("");
  const [conflictNote, setConflictNote] = useState("");
  const [conversion, setConversion] = useState<ConversionGate | null>(null);
  const [canPartnerOverride, setCanPartnerOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/intakes/${intakeId}`, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          intake: Intake;
          conflictChecks: ConflictCheck[];
          latestHits?: ConflictHit[];
          disclaimer?: string;
          conversion?: ConversionGate;
          canPartnerOverride?: boolean;
          conflictPanelNote?: string;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load intake.");
        setIntake(null);
        return;
      }
      setIntake(body.data.intake);
      setChecks(body.data.conflictChecks);
      setHits(body.data.latestHits ?? []);
      setDisclaimer(body.data.disclaimer ?? "");
      setConversion(body.data.conversion ?? null);
      setCanPartnerOverride(Boolean(body.data.canPartnerOverride));
      setConflictNote(body.data.conflictPanelNote ?? "");
    } catch {
      setError("Could not load intake.");
      setIntake(null);
    } finally {
      setLoading(false);
    }
  }, [intakeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(status: "open" | "declined" | "archived") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/intakes/${intakeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update status.");
        return;
      }
      await load();
    } catch {
      setError("Could not update status.");
    } finally {
      setBusy(false);
    }
  }

  async function runConflictCheck() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/intakes/${intakeId}/conflicts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          search: { hits: ConflictHit[]; disclaimer: string; result: string };
          conversion: ConversionGate;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Conflict check failed.");
        return;
      }
      setHits(body.data.search.hits);
      setDisclaimer(body.data.search.disclaimer);
      setConversion(body.data.conversion);
      await load();
    } catch {
      setError("Conflict check failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOverride() {
    const latest = checks[0];
    if (!latest) {
      setError("Run a conflict check first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/intakes/${intakeId}/conflicts/override`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkId: latest.id, reason: overrideReason }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { conversion: ConversionGate };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Override failed.");
        return;
      }
      setConversion(body.data.conversion);
      setOverrideReason("");
      await load();
    } catch {
      setError("Override failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !intake) {
    return (
      <section className="view active scrollable">
        <p className="muted">Loading intake…</p>
      </section>
    );
  }

  if (!intake) {
    return (
      <section className="view active scrollable">
        <p role="alert" style={{ color: "var(--danger)" }}>
          {error ?? "Intake not found."}
        </p>
        <Link href="/intake" className="btn btn-outline btn-sm">
          Back
        </Link>
      </section>
    );
  }

  const latest = checks[0] ?? null;
  const needsOverride =
    latest &&
    (latest.result === "conflict" || latest.result === "possible") &&
    !latest.hasPartnerOverride;

  return (
    <section className="view active scrollable" aria-label="Intake detail">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>{intake.prospectName}</h3>
            <Badge>{intake.statusLabel}</Badge>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <Can permission="intake.manage">
              {intake.editable ? (
                <Link href={`/intake/${intake.id}/edit`} className="btn btn-outline btn-sm">
                  Edit
                </Link>
              ) : null}
              {intake.statusNormalized === "open" ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void setStatus("declined")}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void setStatus("archived")}
                  >
                    Archive
                  </Button>
                </>
              ) : null}
              {intake.statusNormalized === "declined" ||
              intake.statusNormalized === "archived" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void setStatus("open")}
                >
                  Reopen
                </Button>
              ) : null}
            </Can>
            <Link href="/intake" className="btn btn-outline btn-sm">
              Back
            </Link>
          </div>
        </div>
        <div className="panel-body">
          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          <div className="grid-2" style={{ fontSize: "0.85rem" }}>
            <div>
              <strong>Email:</strong> {intake.contactEmail ?? "n/a"}
            </div>
            <div>
              <strong>Phone:</strong> {intake.contactPhone ?? "n/a"}
            </div>
            <div>
              <strong>Area of law:</strong> {intake.areaOfLaw ?? "n/a"}
            </div>
            <div>
              <strong>Assignee:</strong> {intake.assigneeName ?? "Unassigned"}
            </div>
            <div>
              <strong>Opposing party:</strong> {intake.opposingParty ?? "n/a"}
            </div>
            <div>
              <strong>Updated:</strong> {new Date(intake.updatedAt).toLocaleString()}
            </div>
          </div>
          {intake.matterSummary ? (
            <p style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
              <strong>Summary:</strong> {intake.matterSummary}
            </p>
          ) : null}

          {intake.convertedClientId ? (
            <p style={{ marginTop: "1rem" }}>
              Converted client:{" "}
              <Link href={`/clients/${intake.convertedClientId}`}>Open client</Link>
              {intake.convertedMatterId ? (
                <>
                  {" · "}
                  <Link href={`/matters/${intake.convertedMatterId}`}>Open matter</Link>
                </>
              ) : null}
            </p>
          ) : (
            <Can permission="intake.manage">
              <IntakeConvertPanel
                intakeId={intake.id}
                prospectName={intake.prospectName}
                matterSummary={intake.matterSummary}
                areaOfLaw={intake.areaOfLaw}
                opposingParty={intake.opposingParty}
                allowed={Boolean(conversion?.allowed)}
                reason={
                  conversion?.reason ??
                  "Run a conflict check before converting this intake."
                }
              />
            </Can>
          )}

          <div className="panel" style={{ marginTop: "1.25rem" }}>
            <div className="panel-head">
              <h3>Conflict check</h3>
              <Can permission="intake.manage">
                <Button
                  size="sm"
                  disabled={busy || intake.statusNormalized === "converted"}
                  onClick={() => void runConflictCheck()}
                >
                  Run check
                </Button>
              </Can>
            </div>
            <div className="panel-body">
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: 0 }}>
                {conflictNote}
              </p>
              {disclaimer ? (
                <p className="muted" style={{ fontSize: "0.75rem" }}>
                  {disclaimer}
                </p>
              ) : null}

              {latest ? (
                <p style={{ fontSize: "0.85rem" }}>
                  Latest result: <Badge>{latest.result}</Badge>
                  {latest.hasPartnerOverride ? (
                    <>
                      {" "}
                      <Badge>partner override</Badge>
                    </>
                  ) : null}
                </p>
              ) : null}

              {hits.length ? (
                <table className="data" style={{ marginTop: "0.75rem" }}>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Match</th>
                      <th>Field</th>
                      <th>Strength</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hits.map((h) => (
                      <tr key={`${h.source}-${h.id}-${h.field}-${h.matchedValue}`}>
                        <td>{h.source}</td>
                        <td>
                          <Link href={h.href}>{h.label}</Link>
                          <div className="muted" style={{ fontSize: "0.75rem" }}>
                            {h.matchedValue}
                          </div>
                        </td>
                        <td>{h.field}</td>
                        <td>{h.strength}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : latest?.result === "clear" ? (
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  No matches in this firm for the prospect / opposing party terms.
                </p>
              ) : null}

              {needsOverride && canPartnerOverride ? (
                <div style={{ marginTop: "1rem" }}>
                  <label
                    htmlFor="override-reason"
                    style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.35rem" }}
                  >
                    Managing Partner override reason
                  </label>
                  <textarea
                    id="override-reason"
                    rows={3}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    style={{ width: "100%", fontSize: "0.85rem" }}
                    placeholder="Document why conversion may proceed despite this flag…"
                  />
                  <Button
                    size="sm"
                    style={{ marginTop: "0.5rem" }}
                    disabled={busy || overrideReason.trim().length < 8}
                    onClick={() => void submitOverride()}
                  >
                    Record audited override
                  </Button>
                </div>
              ) : needsOverride && !canPartnerOverride ? (
                <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.75rem" }}>
                  A Managing Partner must record an audited override before conversion.
                </p>
              ) : null}

              {!checks.length ? (
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  No conflict checks recorded yet.
                </p>
              ) : (
                <table className="data" style={{ marginTop: "1rem" }}>
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th>Result</th>
                      <th>Hits</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((c) => (
                      <tr key={c.id}>
                        <td>{c.query}</td>
                        <td>
                          {c.result}
                          {c.hasPartnerOverride ? " (override)" : ""}
                        </td>
                        <td>{c.hitCount ?? "n/a"}</td>
                        <td>
                          {c.checkedAt
                            ? new Date(c.checkedAt).toLocaleString()
                            : "n/a"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
