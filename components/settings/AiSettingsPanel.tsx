"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format/dates";

type KeyInfo = {
  source: string;
  status: "missing" | "present";
  byoAvailable: boolean;
  byoNote: string;
};

type SettingsData = {
  providerDefault: string;
  modelDefault: string;
  embeddingsModel: string;
  webLookupEnabled: boolean;
  updatedAt: string | null;
};

type ConnectionStatus = "connected" | "missing" | "invalid" | null;

function statusTone(status: ConnectionStatus): "open" | "pending" | "closed" | "danger" {
  if (status === "connected") return "open";
  if (status === "missing") return "pending";
  if (status === "invalid") return "danger";
  return "pending";
}

function statusLabel(status: ConnectionStatus): string {
  if (status === "connected") return "Connected";
  if (status === "missing") return "Missing";
  if (status === "invalid") return "Invalid";
  return "Not tested";
}

export function AiSettingsPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [key, setKey] = useState<KeyInfo | null>(null);
  const [help, setHelp] = useState<{ testing: string; production: string; byo: string } | null>(
    null,
  );
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(null);
  const [lastTestMessage, setLastTestMessage] = useState<string | null>(null);
  const [modelDefault, setModelDefault] = useState("gemini-2.0-flash");
  const [webLookupEnabled, setWebLookupEnabled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/settings", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          settings: SettingsData;
          key: KeyInfo;
          help: { testing: string; production: string; byo: string };
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load AI settings.");
        return;
      }
      setSettings(body.data.settings);
      setKey(body.data.key);
      setHelp(body.data.help);
      setModelDefault(body.data.settings.modelDefault);
      setWebLookupEnabled(body.data.settings.webLookupEnabled);
      if (body.data.key.status === "missing") {
        setConnectionStatus("missing");
      }
    } catch {
      setError("Could not load AI settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerDefault: "gemini",
          modelDefault,
          webLookupEnabled,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { settings: SettingsData };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not save AI settings.");
        return;
      }
      setSettings(body.data.settings);
      toast("AI settings saved.");
    } catch {
      setError("Could not save AI settings.");
    } finally {
      setSaving(false);
    }
  }

  async function onPing() {
    setPinging(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/ping", {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          ok?: boolean;
          reply?: string;
          latencyMs?: number;
          message?: string;
          errorCode?: string;
          provider?: string;
          model?: string;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Dev ping failed.");
        return;
      }
      if (body.data.ok) {
        setLastTestMessage(
          `Dev ping OK via ${body.data.provider}/${body.data.model}: "${body.data.reply}" (${body.data.latencyMs} ms)`,
        );
        toast("Dev ping OK.");
      } else {
        setLastTestMessage(body.data.message ?? body.data.errorCode ?? "Ping failed.");
        setError(body.data.message ?? "Dev ping failed.");
      }
    } catch {
      setError("Dev ping failed.");
    } finally {
      setPinging(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          status: ConnectionStatus;
          message?: string | null;
          latencyMs?: number;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Connection test failed.");
        return;
      }
      setConnectionStatus(body.data.status);
      setLastTestMessage(
        body.data.message
          ? `${body.data.message}${body.data.latencyMs != null ? ` (${body.data.latencyMs} ms)` : ""}`
          : null,
      );
      if (body.data.status === "connected") {
        toast("Gemini connected.");
      }
    } catch {
      setError("Connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Can
      permission="ai.manage_settings"
      fallback={
        <p className="muted">You need AI settings permission to manage the Gemini connection.</p>
      }
    >
      <div className="panel-head">
        <h3>AI provider</h3>
        <Badge tone={statusTone(connectionStatus)}>{statusLabel(connectionStatus)}</Badge>
      </div>
      <div className="panel-body" style={{ display: "grid", gap: "1rem" }}>
        {loading ? <p className="muted">Loading…</p> : null}
        {error ? (
          <p style={{ color: "var(--danger)", margin: 0 }} role="alert">
            {error}
          </p>
        ) : null}

        <p className="muted" style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.45 }}>
          {help?.testing}
          {" "}
          {help?.production}
        </p>

        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          <div>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Provider
            </div>
            <div style={{ fontWeight: 600 }}>Gemini</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Chat model
            </div>
            <input
              value={modelDefault}
              onChange={(e) => setModelDefault(e.target.value)}
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.55rem 0.7rem",
                border: "1px solid var(--border-2)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-1)",
                color: "var(--text)",
              }}
            />
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Embeddings model
            </div>
            <div style={{ fontWeight: 600, marginTop: "0.35rem" }}>
              {settings?.embeddingsModel ?? "text-embedding-004"}
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Server key
            </div>
            <div style={{ fontWeight: 600, marginTop: "0.35rem" }}>
              {key?.status === "present" ? "Present (env)" : "Missing"}
            </div>
          </div>
        </div>

        <label
          style={{
            display: "flex",
            gap: "0.55rem",
            alignItems: "flex-start",
            fontSize: "0.85rem",
            color: "var(--text-2)",
          }}
        >
          <input
            type="checkbox"
            checked={webLookupEnabled}
            onChange={(e) => setWebLookupEnabled(e.target.checked)}
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            Enable optional allowlisted web lookup (ZimLII, Veritas, Parliament). Results are always
            labelled <strong>[UNVERIFIED]</strong>. Local knowledge-base RAG still runs first; web
            never silently overrides grounding. Default is off. Network failure falls back to local
            only.
          </span>
        </label>

        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--bg-1)",
            fontSize: "0.85rem",
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: "var(--text)" }}>Firm BYO API key</strong>
          <div style={{ marginTop: "0.35rem" }}>{key?.byoNote ?? "Coming later."}</div>
        </div>

        {lastTestMessage ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            {lastTestMessage}
          </p>
        ) : null}

        {settings?.updatedAt ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
            Settings updated {formatDateTime(settings.updatedAt)}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Button variant="gold" onClick={() => void onTest()} disabled={testing || loading}>
            {testing ? "Testing…" : "Test connection"}
          </Button>
          <Button variant="outline" onClick={() => void onPing()} disabled={pinging || loading}>
            {pinging ? "Pinging…" : "Dev ping"}
          </Button>
          <Button variant="outline" onClick={() => void onSave()} disabled={saving || loading}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          <Button variant="ghost" onClick={() => void load()} disabled={loading || testing || pinging}>
            Refresh
          </Button>
        </div>
      </div>
    </Can>
  );
}
