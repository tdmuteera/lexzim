"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format/dates";

type ProviderId = "gemini" | "claude" | "openai";
type RoutingMode = "auto" | "manual";

type KeyInfo = {
  source: string;
  status: "missing" | "present";
  byoAvailable: boolean;
  byoNote: string;
  providers?: Record<
    ProviderId,
    { status: "missing" | "present"; source: string }
  >;
};

type SettingsData = {
  providerDefault: string;
  modelDefault: string;
  embeddingsModel: string;
  webLookupEnabled: boolean;
  routingMode: RoutingMode;
  monthlySoftBudget: number | null;
  maxOutputTokens: number;
  matterContextEnabled: boolean;
  keyMode: "direct" | "proxy";
  disclaimerAlwaysOn: boolean;
  updatedAt: string | null;
};

type ProxyStatus = {
  configured: boolean;
  status: string | null;
  tokenPrefix: string | null;
  monthlyQuota: number;
  callsThisMonth: number;
  periodYm: string;
  remaining: number;
};

type UsageData = {
  year: number;
  month: number;
  periodStartIso: string;
  callsThisMonth: number;
  successCalls: number;
  failedCalls: number;
  softBudget: number | null;
  softBudgetUnlimited: boolean;
  remaining: number | null;
  warnAt80: boolean;
  exceeded: boolean;
  byMode: Record<string, number>;
  byProvider: Record<string, number>;
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

const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: "Gemini",
  claude: "Claude",
  openai: "OpenAI",
};

export function AiSettingsPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [key, setKey] = useState<KeyInfo | null>(null);
  const [help, setHelp] = useState<{
    testing: string;
    production: string;
    byo: string;
    embeddings?: string;
    routing?: string;
    safety?: string;
    keyMode?: string;
  } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(null);
  const [lastTestMessage, setLastTestMessage] = useState<string | null>(null);
  const [providerDefault, setProviderDefault] = useState<ProviderId>("gemini");
  const [modelDefault, setModelDefault] = useState("gemini-2.0-flash");
  const [embeddingsModel, setEmbeddingsModel] = useState("text-embedding-004");
  const [webLookupEnabled, setWebLookupEnabled] = useState(false);
  const [routingMode, setRoutingMode] = useState<RoutingMode>("auto");
  const [keyMode, setKeyMode] = useState<"direct" | "proxy">("direct");
  const [monthlySoftBudget, setMonthlySoftBudget] = useState("500");
  const [budgetUnlimited, setBudgetUnlimited] = useState(false);
  const [maxOutputTokens, setMaxOutputTokens] = useState("1200");
  const [matterContextEnabled, setMatterContextEnabled] = useState(true);
  const [byoGemini, setByoGemini] = useState("");
  const [byoClaude, setByoClaude] = useState("");
  const [byoOpenAi, setByoOpenAi] = useState("");
  const [proxyEligible, setProxyEligible] = useState(false);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [proxyBusy, setProxyBusy] = useState(false);
  const [retentionDays, setRetentionDays] = useState(90);
  const [expiringCount, setExpiringCount] = useState(0);
  const [purgingAi, setPurgingAi] = useState(false);
  const [models, setModels] = useState<Record<
    ProviderId,
    { chat: string; embeddings: string }
  > | null>(null);

  const loadProxy = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/proxy/token", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { eligible: boolean; proxy: ProxyStatus };
      };
      if (res.ok && body.ok && body.data) {
        setProxyEligible(body.data.eligible);
        setProxyStatus(body.data.proxy);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/usage", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { usage: UsageData };
      };
      if (res.ok && body.ok && body.data?.usage) {
        setUsage(body.data.usage);
      }
    } catch {
      /* ignore; main settings still load */
    }
  }, []);

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
          models?: Record<ProviderId, { chat: string; embeddings: string }>;
          help: {
            testing: string;
            production: string;
            byo: string;
            embeddings?: string;
            routing?: string;
            safety?: string;
            keyMode?: string;
          };
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
      setModels(body.data.models ?? null);
      const p = (body.data.settings.providerDefault || "gemini") as ProviderId;
      setProviderDefault(p === "claude" || p === "openai" ? p : "gemini");
      setModelDefault(body.data.settings.modelDefault);
      setEmbeddingsModel(body.data.settings.embeddingsModel);
      setWebLookupEnabled(body.data.settings.webLookupEnabled);
      setRoutingMode(body.data.settings.routingMode === "manual" ? "manual" : "auto");
      setKeyMode(body.data.settings.keyMode === "proxy" ? "proxy" : "direct");
      const budget = body.data.settings.monthlySoftBudget;
      if (budget === null) {
        setBudgetUnlimited(true);
        setMonthlySoftBudget("");
      } else {
        setBudgetUnlimited(false);
        setMonthlySoftBudget(String(budget));
      }
      setMaxOutputTokens(String(body.data.settings.maxOutputTokens ?? 1200));
      setMatterContextEnabled(body.data.settings.matterContextEnabled !== false);
      if (body.data.key.status === "missing") {
        setConnectionStatus("missing");
      }
      await loadUsage();
      await loadProxy();
      try {
        const rRes = await fetch("/api/ai/retention", { credentials: "include" });
        const rBody = (await rRes.json()) as {
          ok?: boolean;
          data?: { olderThanDays: number; expiringCount: number };
        };
        if (rRes.ok && rBody.ok && rBody.data) {
          setRetentionDays(rBody.data.olderThanDays);
          setExpiringCount(rBody.data.expiringCount);
        }
      } catch {
        /* optional */
      }
    } catch {
      setError("Could not load AI settings.");
    } finally {
      setLoading(false);
    }
  }, [loadUsage, loadProxy]);

  useEffect(() => {
    void load();
  }, [load]);

  function onProviderChange(next: ProviderId) {
    setProviderDefault(next);
    if (models?.[next]) {
      setModelDefault(models[next].chat);
      setEmbeddingsModel(models[next].embeddings);
    }
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const byoKeys: Partial<Record<ProviderId, string | null>> = {};
      if (byoGemini.trim()) byoKeys.gemini = byoGemini.trim();
      if (byoClaude.trim()) byoKeys.claude = byoClaude.trim();
      if (byoOpenAi.trim()) byoKeys.openai = byoOpenAi.trim();

      let budgetValue: number | null = null;
      if (!budgetUnlimited) {
        const n = Number(monthlySoftBudget);
        if (!Number.isInteger(n) || n < 1) {
          setError("Monthly soft budget must be a positive integer, or mark unlimited.");
          setSaving(false);
          return;
        }
        budgetValue = n;
      }

      const tokens = Number(maxOutputTokens);
      if (!Number.isInteger(tokens) || tokens < 256 || tokens > 4096) {
        setError("Max output tokens must be an integer from 256 to 4096.");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/ai/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerDefault,
          modelDefault,
          embeddingsModel,
          webLookupEnabled,
          routingMode,
          monthlySoftBudget: budgetValue,
          maxOutputTokens: tokens,
          matterContextEnabled,
          keyMode,
          ...(Object.keys(byoKeys).length ? { byoKeys } : {}),
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { settings: SettingsData; key?: KeyInfo };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not save AI settings.");
        return;
      }
      setSettings(body.data.settings);
      if (body.data.key) setKey(body.data.key);
      setByoGemini("");
      setByoClaude("");
      setByoOpenAi("");
      toast("AI settings saved.");
      await loadUsage();
    } catch {
      setError("Could not save AI settings.");
    } finally {
      setSaving(false);
    }
  }

  async function onPurgeAi() {
    if (
      !window.confirm(
        `Delete AI conversations unused for ${retentionDays}+ days? (${expiringCount} match now)`,
      )
    ) {
      return;
    }
    setPurgingAi(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/retention", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { deleted: number; olderThanDays: number };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Purge failed.");
        return;
      }
      toast(`Purged ${body.data.deleted} AI conversation(s).`);
      setExpiringCount(0);
      await load();
    } catch {
      setError("Purge failed.");
    } finally {
      setPurgingAi(false);
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
      if (!res.ok || !body.ok) {
        setConnectionStatus("invalid");
        setLastTestMessage(body.error?.message ?? body.data?.message ?? "Ping failed.");
        return;
      }
      setConnectionStatus("connected");
      setLastTestMessage(
        `Ping ok (${body.data?.provider ?? "provider"} / ${body.data?.model ?? "model"}): ${body.data?.reply ?? "ok"} · ${body.data?.latencyMs ?? "?"}ms`,
      );
      toast("AI ping succeeded.");
    } catch {
      setConnectionStatus("invalid");
      setLastTestMessage("Ping failed.");
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelDefault }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          ok?: boolean;
          status?: ConnectionStatus;
          message?: string;
          latencyMs?: number;
          provider?: string;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setConnectionStatus("invalid");
        setLastTestMessage(body.error?.message ?? "Test failed.");
        return;
      }
      const status = (body.data?.status as ConnectionStatus) ?? (body.data?.ok ? "connected" : "invalid");
      setConnectionStatus(status);
      setLastTestMessage(
        body.data?.message ??
          `${statusLabel(status)}${body.data?.latencyMs ? ` · ${body.data.latencyMs}ms` : ""}`,
      );
      if (status === "connected") toast("AI connection OK.");
    } catch {
      setConnectionStatus("invalid");
      setLastTestMessage("Test failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Can permission="ai.manage_settings">
      <div style={{ display: "grid", gap: "1rem", maxWidth: "42rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>AI</h2>
          <Badge tone={statusTone(connectionStatus)}>{statusLabel(connectionStatus)}</Badge>
        </div>

        {error ? (
          <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.9rem" }}>{error}</p>
        ) : null}

        {loading ? <p className="muted">Loading…</p> : null}

        <div style={{ display: "grid", gap: "0.75rem" }}>
          <label>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Routing
            </div>
            <select
              value={routingMode}
              onChange={(e) => setRoutingMode(e.target.value as RoutingMode)}
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.55rem 0.7rem",
                border: "1px solid var(--border-2)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-1)",
                color: "var(--text)",
              }}
            >
              <option value="auto">Auto (legal research prefers Claude)</option>
              <option value="manual">Manual (always use selected provider)</option>
            </select>
          </label>
          {help?.routing ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              {help.routing}
            </p>
          ) : null}

          <label>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Key mode
            </div>
            <select
              value={keyMode}
              onChange={(e) => setKeyMode(e.target.value as "direct" | "proxy")}
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.55rem 0.7rem",
                border: "1px solid var(--border-2)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-1)",
                color: "var(--text)",
              }}
            >
              <option value="direct">Direct (BYO or managed server keys)</option>
              <option value="proxy" disabled={!proxyEligible}>
                LexZim Proxy {proxyEligible ? "" : "(Firm edition required)"}
              </option>
            </select>
          </label>
          {help?.keyMode ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              {help.keyMode}
            </p>
          ) : null}

          <label>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Default provider
            </div>
            <select
              value={providerDefault}
              onChange={(e) => onProviderChange(e.target.value as ProviderId)}
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.55rem 0.7rem",
                border: "1px solid var(--border-2)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-1)",
                color: "var(--text)",
              }}
            >
              {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((id) => (
                <option key={id} value={id}>
                  {PROVIDER_LABELS[id]}
                </option>
              ))}
            </select>
          </label>
          <label>
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
          </label>
          <label>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Embeddings model
            </div>
            <input
              value={embeddingsModel}
              onChange={(e) => setEmbeddingsModel(e.target.value)}
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
          </label>
          <label>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Max output tokens (256 to 4096)
            </div>
            <input
              type="number"
              min={256}
              max={4096}
              value={maxOutputTokens}
              onChange={(e) => setMaxOutputTokens(e.target.value)}
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
          </label>
        </div>

        <div className="muted" style={{ fontSize: "0.8rem" }}>
          Key status: Gemini {key?.providers?.gemini?.status ?? "n/a"} (
          {key?.providers?.gemini?.source ?? "n/a"}) · Claude{" "}
          {key?.providers?.claude?.status ?? "n/a"} (
          {key?.providers?.claude?.source ?? "n/a"}) · OpenAI{" "}
          {key?.providers?.openai?.status ?? "n/a"} (
          {key?.providers?.openai?.source ?? "n/a"})
        </div>

        {help?.embeddings ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
            {help.embeddings}
          </p>
        ) : null}

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
            labelled <strong>[UNVERIFIED]</strong>. Local knowledge-base RAG still runs first. Default
            is off.
          </span>
        </label>

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
            checked={matterContextEnabled}
            onChange={(e) => setMatterContextEnabled(e.target.checked)}
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            Allow Matter Assist to use matter-file context (live snapshot + firm memory). When off,
            Matter Assist is blocked firm-wide.
          </span>
        </label>

        <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
          Disclaimer is always appended to AI answers and cannot be disabled.
          {help?.safety ? ` ${help.safety}` : ""}
        </p>

        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--bg-1)",
            fontSize: "0.85rem",
            color: "var(--text-2)",
            lineHeight: 1.45,
            display: "grid",
            gap: "0.65rem",
          }}
        >
          <strong style={{ color: "var(--text)" }}>Usage (this UTC month)</strong>
          {usage ? (
            <>
              <div>
                Calls: {usage.callsThisMonth}
                {usage.softBudgetUnlimited
                  ? " (no soft budget)"
                  : ` / ${usage.softBudget} soft budget`}
                {usage.warnAt80 && !usage.exceeded ? " · approaching limit" : ""}
                {usage.exceeded ? " · limit reached (new LLM calls soft-blocked)" : ""}
              </div>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                Success {usage.successCalls} · Failed {usage.failedCalls}
                {usage.remaining !== null ? ` · Remaining ${usage.remaining}` : ""}
              </div>
            </>
          ) : (
            <div className="muted">Usage not loaded yet.</div>
          )}
          <label
            style={{
              display: "flex",
              gap: "0.55rem",
              alignItems: "center",
              fontSize: "0.85rem",
            }}
          >
            <input
              type="checkbox"
              checked={budgetUnlimited}
              onChange={(e) => setBudgetUnlimited(e.target.checked)}
            />
            Unlimited monthly soft budget
          </label>
          {!budgetUnlimited ? (
            <label>
              Monthly soft budget (LLM call events)
              <input
                type="number"
                min={1}
                value={monthlySoftBudget}
                onChange={(e) => setMonthlySoftBudget(e.target.value)}
                style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
              />
            </label>
          ) : null}
        </div>

        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--bg-1)",
            fontSize: "0.85rem",
            color: "var(--text-2)",
            lineHeight: 1.45,
            display: "grid",
            gap: "0.65rem",
          }}
        >
          <strong style={{ color: "var(--text)" }}>LexZim AI Proxy</strong>
          {!proxyEligible ? (
            <div className="muted">
              Not available on this edition. Firm edition includes `ai_proxy`.
            </div>
          ) : (
            <>
              <div>
                Status: {proxyStatus?.configured ? proxyStatus.status : "no token"} · Quota{" "}
                {proxyStatus
                  ? `${proxyStatus.callsThisMonth}/${proxyStatus.monthlyQuota}`
                  : "n/a"}
                {proxyStatus?.tokenPrefix ? ` · Prefix ${proxyStatus.tokenPrefix}…` : ""}
              </div>
              {issuedToken ? (
                <p style={{ margin: 0, color: "var(--danger)", wordBreak: "break-all" }}>
                  New token (copy once): {issuedToken}
                </p>
              ) : null}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <Button
                  variant="outline"
                  disabled={proxyBusy}
                  onClick={() => {
                    void (async () => {
                      setProxyBusy(true);
                      setError(null);
                      try {
                        const res = await fetch("/api/ai/proxy/token", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "issue" }),
                        });
                        const body = (await res.json()) as {
                          ok: boolean;
                          data?: { token?: string; proxy?: ProxyStatus };
                          error?: { message: string };
                        };
                        if (!res.ok || !body.ok) {
                          setError(body.error?.message ?? "Could not issue proxy token.");
                          return;
                        }
                        setIssuedToken(body.data?.token ?? null);
                        if (body.data?.proxy) setProxyStatus(body.data.proxy);
                        toast("Proxy token issued. Copy it now.");
                      } catch {
                        setError("Could not issue proxy token.");
                      } finally {
                        setProxyBusy(false);
                      }
                    })();
                  }}
                >
                  {proxyBusy ? "Working…" : "Issue / rotate token"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={proxyBusy || !proxyStatus?.configured}
                  onClick={() => {
                    void (async () => {
                      setProxyBusy(true);
                      try {
                        const res = await fetch("/api/ai/proxy/token", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "revoke" }),
                        });
                        const body = (await res.json()) as {
                          ok: boolean;
                          data?: { proxy?: ProxyStatus };
                          error?: { message: string };
                        };
                        if (!res.ok || !body.ok) {
                          setError(body.error?.message ?? "Could not revoke token.");
                          return;
                        }
                        setIssuedToken(null);
                        if (body.data?.proxy) setProxyStatus(body.data.proxy);
                        toast("Proxy token revoked.");
                      } catch {
                        setError("Could not revoke token.");
                      } finally {
                        setProxyBusy(false);
                      }
                    })();
                  }}
                >
                  Revoke
                </Button>
              </div>
            </>
          )}
        </div>

        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--bg-1)",
            fontSize: "0.85rem",
            color: "var(--text-2)",
            lineHeight: 1.45,
            display: "grid",
            gap: "0.65rem",
          }}
        >
          <strong style={{ color: "var(--text)" }}>Firm BYO API keys (optional)</strong>
          <div>{key?.byoNote ?? "Encrypted per firm. Leave blank to keep existing / use env."}</div>
          <label>
            Gemini BYO
            <input
              type="password"
              autoComplete="off"
              value={byoGemini}
              onChange={(e) => setByoGemini(e.target.value)}
              placeholder="Leave blank to keep"
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
            />
          </label>
          <label>
            Claude BYO
            <input
              type="password"
              autoComplete="off"
              value={byoClaude}
              onChange={(e) => setByoClaude(e.target.value)}
              placeholder="Leave blank to keep"
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
            />
          </label>
          <label>
            OpenAI BYO
            <input
              type="password"
              autoComplete="off"
              value={byoOpenAi}
              onChange={(e) => setByoOpenAi(e.target.value)}
              placeholder="Leave blank to keep"
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
            />
          </label>
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

        <div
          style={{
            display: "grid",
            gap: "0.45rem",
            padding: "0.75rem 0",
            borderTop: "1px solid var(--border)",
          }}
        >
          <strong style={{ fontSize: "0.9rem" }}>Conversation retention</strong>
          <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
            Minimize stored AI chat after {retentionDays} days (default). {expiringCount} conversation(s)
            currently eligible. See docs/cloud/PRIVACY.md.
          </p>
          <Button
            variant="outline"
            onClick={() => void onPurgeAi()}
            disabled={purgingAi || loading}
          >
            {purgingAi ? "Purging…" : "Purge old AI conversations"}
          </Button>
        </div>

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
