"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type LicenceSummary = {
  edition: string;
  status: string;
  seats: number;
  expiresAt: string | null;
  isExpired?: boolean;
};

type FirmRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isDemo: boolean;
  activeUsers: number;
  licence: LicenceSummary | null;
};

type HealthPayload = {
  version: string;
  firmsByStatus: Record<string, number>;
  activeUsers: number;
  aiJobs: { pending: number; running: number };
  env: Record<string, boolean>;
  note?: string;
};

export function OpsConsole() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [firms, setFirms] = useState<FirmRow[]>([]);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  const [licenceFirmId, setLicenceFirmId] = useState("");
  const [edition, setEdition] = useState("trial");
  const [seats, setSeats] = useState("3");
  const [days, setDays] = useState("30");
  const [purgeFirmId, setPurgeFirmId] = useState("");
  const [purgeSlug, setPurgeSlug] = useState("");
  const [purgePhrase, setPurgePhrase] = useState("");
  const [diagOk, setDiagOk] = useState<boolean | null>(null);
  const [diagFailing, setDiagFailing] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [firmsRes, healthRes, diagRes] = await Promise.all([
        fetch("/api/platform/firms", { credentials: "include" }),
        fetch("/api/platform/health", { credentials: "include" }),
        fetch("/api/ops/diagnostics/health", { credentials: "include" }),
      ]);
      const firmsBody = (await firmsRes.json()) as {
        ok: boolean;
        data?: {
          admin?: { email: string };
          items: FirmRow[];
        };
        error?: { message: string };
      };
      const healthBody = (await healthRes.json()) as {
        ok: boolean;
        data?: HealthPayload;
        error?: { message: string };
      };

      if (!firmsRes.ok || !firmsBody.ok || !firmsBody.data) {
        setError(
          firmsBody.error?.message ??
            "Ops access denied. Sign in as a platform admin (and check OPS_IP_ALLOWLIST).",
        );
        setFirms([]);
        setHealth(null);
        return;
      }
      setFirms(firmsBody.data.items);
      setAdminEmail(firmsBody.data.admin?.email ?? null);
      if (!licenceFirmId && firmsBody.data.items[0]) {
        setLicenceFirmId(firmsBody.data.items[0].id);
      }
      if (healthRes.ok && healthBody.ok && healthBody.data) {
        setHealth(healthBody.data);
      }
      try {
        const diagBody = (await diagRes.json()) as {
          ok: boolean;
          data?: { ok?: boolean; checks?: Array<{ name: string; ok: boolean }> };
        };
        if (diagRes.ok && diagBody.ok && diagBody.data) {
          setDiagOk(Boolean(diagBody.data.ok));
          setDiagFailing(
            (diagBody.data.checks ?? []).filter((c) => !c.ok).map((c) => c.name),
          );
        } else {
          setDiagOk(null);
          setDiagFailing([]);
        }
      } catch {
        setDiagOk(null);
      }
    } catch {
      setError("Could not load ops console.");
    } finally {
      setLoading(false);
    }
  }, [licenceFirmId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  async function setStatus(firmId: string, status: string) {
    if (!window.confirm(`Set firm status to ${status}?`)) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/platform/firms", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firmId, status }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update firm.");
        return;
      }
      setOkMsg(`Firm status → ${status}`);
      await load();
    } catch {
      setError("Could not update firm.");
    } finally {
      setBusy(false);
    }
  }

  async function issueLicence() {
    if (!licenceFirmId) {
      setError("Choose a firm.");
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/platform/licences", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmId: licenceFirmId,
          edition,
          seats: Number(seats) || undefined,
          days: Number(days) || undefined,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not issue licence.");
        return;
      }
      setOkMsg("Licence issued.");
      await load();
    } catch {
      setError("Could not issue licence.");
    } finally {
      setBusy(false);
    }
  }

  async function purgeFirm() {
    if (!purgeFirmId) {
      setError("Choose a suspended firm to purge.");
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/platform/firms", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmId: purgeFirmId,
          confirmSlug: purgeSlug,
          confirmPhrase: purgePhrase,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { storageRemoved?: number };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Purge failed.");
        return;
      }
      setOkMsg(
        `Firm purged. Storage objects removed: ${body.data?.storageRemoved ?? 0}.`,
      );
      setPurgeSlug("");
      setPurgePhrase("");
      setPurgeFirmId("");
      await load();
    } catch {
      setError("Purge failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="ops-card">
        <h2>Platform console</h2>
        <p className="ops-muted" style={{ margin: 0 }}>
          LexZim operator tools. Lists firms, licences, and health only. Does not open matter
          files or client PII by default.
          {adminEmail ? ` Signed in as ${adminEmail}.` : ""}
        </p>
        {error ? (
          <p style={{ color: "#b42318", margin: "0.75rem 0 0" }}>{error}</p>
        ) : null}
        {okMsg ? (
          <p style={{ color: "#067647", margin: "0.75rem 0 0" }}>{okMsg}</p>
        ) : null}
        <div style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="ops-btn outline"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
      </section>

      <section className="ops-card">
        <h2>Diagnostics</h2>
        <div className="ops-strip">
          {diagOk == null ? (
            <span className="ops-muted">System diagnostics not loaded.</span>
          ) : (
            <span className={`ops-pill ${diagOk ? "ok" : "bad"}`}>
              {diagOk ? "Health checks passing" : `Degraded: ${diagFailing.join(", ") || "see page"}`}
            </span>
          )}
          <Link href="/ops/diagnostics" className="ops-btn outline" style={{ textDecoration: "none" }}>
            Open diagnostics
          </Link>
        </div>
      </section>

      <section className="ops-card">
        <h2>Aggregate health</h2>
        {loading && !health ? <p className="ops-muted">Loading…</p> : null}
        {health ? (
          <div style={{ display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
            <div>Version: {health.version}</div>
            <div>Active users (all firms): {health.activeUsers}</div>
            <div>
              Firms by status:{" "}
              {Object.entries(health.firmsByStatus)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ") || "none"}
            </div>
            <div>
              AI jobs: pending={health.aiJobs.pending}, running={health.aiJobs.running}
            </div>
            <div className="ops-muted">
              Env: supabase={String(health.env.supabaseUrl)} db={String(health.env.databaseUrl)}{" "}
              ipAllowlist={String(health.env.opsIpAllowlist)}
            </div>
          </div>
        ) : null}
      </section>

      <section className="ops-card">
        <h2>Issue licence</h2>
        <div className="ops-form">
          <label>
            Firm
            <select
              value={licenceFirmId}
              onChange={(e) => setLicenceFirmId(e.target.value)}
              disabled={busy}
            >
              {firms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.slug})
                </option>
              ))}
            </select>
          </label>
          <label>
            Edition
            <select value={edition} onChange={(e) => setEdition(e.target.value)} disabled={busy}>
              <option value="trial">trial</option>
              <option value="solo">solo</option>
              <option value="firm">firm</option>
            </select>
          </label>
          <label>
            Seats
            <input value={seats} onChange={(e) => setSeats(e.target.value)} disabled={busy} />
          </label>
          <label>
            Days until expiry
            <input value={days} onChange={(e) => setDays(e.target.value)} disabled={busy} />
          </label>
          <button
            type="button"
            className="ops-btn"
            disabled={busy || !licenceFirmId}
            onClick={() => void issueLicence()}
          >
            Issue / renew licence
          </button>
        </div>
      </section>

      <section className="ops-card">
        <h2>Hard purge (irreversible)</h2>
        <p className="ops-muted" style={{ marginTop: 0 }}>
          Suspend first. Export if needed. Then type the firm slug and phrase DELETE FIRM. Removes
          app rows, storage under firms/{"{id}"}, and staff Auth users. Hosted backups/PITR may
          retain copies per provider plan.
        </p>
        <div className="ops-form">
          <label>
            Suspended / archived firm
            <select
              value={purgeFirmId}
              onChange={(e) => {
                setPurgeFirmId(e.target.value);
                const f = firms.find((x) => x.id === e.target.value);
                setPurgeSlug(f?.slug ?? "");
              }}
              disabled={busy}
            >
              <option value="">Select…</option>
              {firms
                .filter((f) => f.status === "suspended" || f.status === "archived")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.slug}) · {f.status}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Confirm slug
            <input
              value={purgeSlug}
              onChange={(e) => setPurgeSlug(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Confirm phrase
            <input
              value={purgePhrase}
              onChange={(e) => setPurgePhrase(e.target.value)}
              placeholder="DELETE FIRM"
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="ops-btn"
            disabled={busy || !purgeFirmId}
            onClick={() => void purgeFirm()}
          >
            Purge firm permanently
          </button>
        </div>
      </section>

      <section className="ops-card">
        <h2>Firms</h2>
        {loading ? <p className="ops-muted">Loading firms…</p> : null}
        {!loading && firms.length === 0 ? (
          <p className="ops-muted">No firms (or no access).</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Firm</th>
                  <th>Status</th>
                  <th>Users</th>
                  <th>Licence</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {firms.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{f.name}</div>
                      <div className="ops-muted">
                        {f.slug}
                        {f.isDemo ? " · demo" : ""}
                      </div>
                    </td>
                    <td>{f.status}</td>
                    <td>{f.activeUsers}</td>
                    <td>
                      {f.licence
                        ? `${f.licence.edition} · ${f.licence.status}` +
                          (f.licence.expiresAt
                            ? ` · exp ${f.licence.expiresAt.slice(0, 10)}`
                            : "")
                        : "—"}
                    </td>
                    <td>
                      <div className="ops-actions">
                        {f.status !== "suspended" ? (
                          <button
                            type="button"
                            className="ops-btn outline"
                            disabled={busy}
                            onClick={() => void setStatus(f.id, "suspended")}
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ops-btn outline"
                            disabled={busy}
                            onClick={() => void setStatus(f.id, "active")}
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
