"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format/dates";

/** Backup & export panel body (used inside SettingsView). */
export function BackupExportPanel() {
  const { toast } = useToast();
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [firmSlug, setFirmSlug] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [deactivating, setDeactivating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [exportRes, meRes] = await Promise.all([
        fetch("/api/export", { credentials: "include" }),
        fetch("/api/auth/me", { credentials: "include" }),
      ]);
      const body = (await exportRes.json()) as {
        ok: boolean;
        data?: { lastExportAt: string | null; warnings: string[] };
        error?: { message: string };
      };
      if (!exportRes.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load export status.");
        return;
      }
      setLastExportAt(body.data?.lastExportAt ?? null);
      setWarnings(body.data?.warnings ?? []);
      if (meRes.ok) {
        const meBody = (await meRes.json()) as {
          ok?: boolean;
          data?: { user?: { firm?: { slug?: string } } };
        };
        setFirmSlug(meBody.data?.user?.firm?.slug ?? "");
      }
    } catch {
      setError("Could not load export status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onExport() {
    if (!confirmed) {
      setError("Confirm that you understand this archive contains confidential firm data.");
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message: string };
        } | null;
        setError(body?.error?.message ?? "Export failed.");
        return;
      }

      const blob = await res.blob();
      const headerName = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1];
      const exportAt = res.headers.get("X-Lexzim-Export-At");
      const fileName = headerName ?? `lexzim-export-${Date.now()}.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      if (exportAt) setLastExportAt(exportAt);
      setConfirmed(false);
      toast("Firm export downloaded.");
    } catch {
      setError("Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function onDeactivate() {
    if (!firmSlug || confirmSlug.trim() !== firmSlug) {
      setError(`Type your firm slug (${firmSlug || "…"}) to confirm deactivation.`);
      return;
    }
    if (!window.confirm("Suspend this firm? Staff will be unable to sign in.")) return;
    setDeactivating(true);
    setError(null);
    try {
      const res = await fetch("/api/firm/deactivate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmSlug }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { message?: string };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Deactivation failed.");
        return;
      }
      toast(body.data?.message ?? "Firm suspended.");
      setConfirmSlug("");
    } catch {
      setError("Deactivation failed.");
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div className="settings-form">
      <div className="settings-form-head">
        {loading ? <span className="muted">Loading…</span> : null}
        {error ? (
          <p style={{ color: "var(--danger)", margin: 0 }} role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <section className="settings-section">
        <h3 className="settings-section-title">Firm data export</h3>
        <div className="settings-summary">
          <div className="settings-summary-row">
            <span className="settings-label">Last export</span>
            <span className="settings-value">{formatDateTime(lastExportAt)}</span>
          </div>
        </div>

        <div className="settings-callout danger">
          <strong>Confidential data warning</strong>
          This download includes client names, matter details, timeline notes, and storage paths.
          Keep the ZIP offline or in an encrypted store. Do not email it without encryption. LexZim
          does not put API keys into the archive.
        </div>

        {warnings.length > 0 ? (
          <ul className="muted" style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <label className="settings-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            I understand this archive contains confidential firm data and I will store it securely.
          </span>
        </label>

        <div className="settings-actions">
          <Button
            variant="gold"
            onClick={() => void onExport()}
            disabled={exporting || loading || !confirmed}
          >
            {exporting ? "Preparing export…" : "Download firm export"}
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading || exporting}>
            Refresh status
          </Button>
        </div>

        <p className="settings-hint">
          This download is a copy of the firm's own records. It is separate from the platform's own backups.
        </p>
      </section>

      <div className="settings-danger-zone">
        <strong className="settings-section-title">Deactivate firm (suspend)</strong>
        <p className="settings-hint">
          Suspending the firm blocks staff login. Download an export first. This does not delete
          clients, matters, or money.
        </p>
        <label className="settings-field">
          <span>Type firm slug to confirm{firmSlug ? ` (${firmSlug})` : ""}</span>
          <input
            className="input"
            value={confirmSlug}
            onChange={(e) => setConfirmSlug(e.target.value)}
            disabled={deactivating || !firmSlug}
          />
        </label>
        <div className="settings-actions">
          <Button
            variant="outline"
            onClick={() => void onDeactivate()}
            disabled={deactivating || loading || !firmSlug}
          >
            {deactivating ? "Suspending…" : "Suspend firm access"}
          </Button>
        </div>
      </div>
    </div>
  );
}
