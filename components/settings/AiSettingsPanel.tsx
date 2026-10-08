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

type ChatModelOption = { id: string; label: string };

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
  claude: "Claude (Anthropic)",
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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(null);
  const [lastTestMessage, setLastTestMessage] = useState<string | null>(null);
  const [providerDefault, setProviderDefault] = useState<ProviderId>("claude");
  const [modelDefault, setModelDefault] = useState("claude-sonnet-4-5");
  const [embeddingsModel, setEmbeddingsModel] = useState("gemini-embedding-001");
  const [webLookupEnabled, setWebLookupEnabled] = useState(true);
  const [routingMode, setRoutingMode] = useState<RoutingMode>("manual");
  const [keyMode, setKeyMode] = useState<"direct" | "proxy">("direct");
  const [monthlySoftBudget, setMonthlySoftBudget] = useState("500");
  const [budgetUnlimited, setBudgetUnlimited] = useState(false);
  const [maxOutputTokens, setMaxOutputTokens] = useState("2200");
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
  const [chatModelCatalog, setChatModelCatalog] = useState<
    Record<ProviderId, ChatModelOption[]> | null
  >(null);
  const [modelPickerMode, setModelPickerMode] = useState<"catalog" | "custom">("catalog");

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
          chatModelCatalog?: Record<ProviderId, ChatModelOption[]>;
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
      setModels(body.data.models ?? null);
      setChatModelCatalog(body.data.chatModelCatalog ?? null);
      applySettingsToForm(body.data.settings, body.data.chatModelCatalog);
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
    const catalog = chatModelCatalog?.[next];
    if (catalog?.[0]?.id) {
      setModelDefault(catalog[0].id);
      setModelPickerMode("catalog");
    } else if (models?.[next]?.chat) {
      setModelDefault(models[next].chat);
    }
  }

  function applyProviderModelDefaults() {
    if (!models?.[providerDefault]) return;
    setModelDefault(models[providerDefault].chat);
    setEmbeddingsModel(models[providerDefault].embeddings);
    const inCatalog = chatModelCatalog?.[providerDefault]?.some(
      (m) => m.id === models[providerDefault].chat,
    );
    setModelPickerMode(inCatalog ? "catalog" : "custom");
  }

  function applySettingsToForm(
    s: SettingsData,
    catalog?: Record<ProviderId, ChatModelOption[]> | null,
  ) {
    const p = (s.providerDefault || "claude") as ProviderId;
    setProviderDefault(p === "claude" || p === "openai" ? p : "gemini");
    setModelDefault(s.modelDefault);
    const cat = catalog ?? chatModelCatalog;
    const inCatalog = cat?.[p]?.some((m) => m.id === s.modelDefault);
    setModelPickerMode(inCatalog ? "catalog" : "custom");
    setEmbeddingsModel(s.embeddingsModel);
    setWebLookupEnabled(s.webLookupEnabled);
    setRoutingMode(s.routingMode === "manual" ? "manual" : "auto");
    setKeyMode(s.keyMode === "proxy" ? "proxy" : "direct");
    const budget = s.monthlySoftBudget;
    if (budget === null) {
      setBudgetUnlimited(true);
      setMonthlySoftBudget("");
    } else {
      setBudgetUnlimited(false);
      setMonthlySoftBudget(String(budget));
    }
    setMaxOutputTokens(String(s.maxOutputTokens ?? 2200));
    setMatterContextEnabled(s.matterContextEnabled !== false);
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
      applySettingsToForm(body.data.settings, chatModelCatalog);
      if (body.data.key) setKey(body.data.key);
      setByoGemini("");
      setByoClaude("");
      setByoOpenAi("");
      toast("AI settings saved.");
      await loadUsage();
      // Re-fetch so the form matches the DB exactly (avoids “did not save” confusion).
      await load();
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
      <div className="settings-form">
        <div className="settings-form-head">
          <Badge tone={statusTone(connectionStatus)}>{statusLabel(connectionStatus)}</Badge>
          {loading ? <span className="muted">Loading…</span> : null}
          {error ? (
            <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.9rem", width: "100%" }}>
              {error}
            </p>
          ) : null}
        </div>

        <section className="settings-section">
          <h3 className="settings-section-title">Which model the firm uses</h3>
          <div className="settings-fields">
            <label className="settings-field">
              <span>Model choice</span>
              <select
                className="input"
                value={routingMode}
                onChange={(e) => setRoutingMode(e.target.value as RoutingMode)}
              >
                <option value="manual">
                  Use the provider and chat model saved here
                </option>
                <option value="auto">
                  Try the saved provider first, then another if its key is missing
                </option>
              </select>
              <p className="settings-hint">
                {routingMode === "manual"
                  ? "The provider and model you save here apply to the whole firm."
                  : "Another provider is used only when the chosen key is missing."}
              </p>
            </label>

            <label className="settings-field">
              <span>Key mode</span>
              <select
                className="input"
                value={keyMode}
                onChange={(e) => setKeyMode(e.target.value as "direct" | "proxy")}
              >
                <option value="direct">Keys saved for this firm, or the server key</option>
                <option value="proxy" disabled={!proxyEligible}>
                  LexZim Proxy {proxyEligible ? "" : "(Firm edition required)"}
                </option>
              </select>
              <p className="settings-hint">
                Keys saved for this firm are used first. Otherwise the server key is used.
              </p>
            </label>

            <label className="settings-field">
              <span>Provider</span>
              <select
                className="input"
                value={providerDefault}
                onChange={(e) => onProviderChange(e.target.value as ProviderId)}
              >
                {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((id) => (
                  <option
                    key={id}
                    value={id}
                    disabled={key != null && key.providers?.[id]?.status !== "present"}
                  >
                    {PROVIDER_LABELS[id]}
                    {key?.providers?.[id]?.status === "present"
                      ? ` (${key.providers[id].source === "server_env" ? "server key" : "saved here"})`
                      : " (no key)"}
                  </option>
                ))}
              </select>
              <p className="settings-hint">
                A key saved below is used for this firm. Otherwise the server key is used.
              </p>
            </label>

            <label className="settings-field">
              <span>Chat model</span>
              <select
                className="input"
                value={modelPickerMode === "catalog" ? modelDefault : "__custom__"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__custom__") {
                    setModelPickerMode("custom");
                    return;
                  }
                  setModelPickerMode("catalog");
                  setModelDefault(v);
                }}
              >
                {(chatModelCatalog?.[providerDefault] ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
                <option value="__custom__">Custom model ID…</option>
              </select>
              {modelPickerMode === "custom" ? (
                <input
                  className="input"
                  style={{ marginTop: "0.5rem" }}
                  value={modelDefault}
                  onChange={(e) => setModelDefault(e.target.value)}
                  placeholder="Paste exact model ID from the provider"
                />
              ) : null}
              <p className="settings-hint">
                Every staff member uses this model until you change it and save. Test connection
                after switching.
              </p>
            </label>

            <label className="settings-field">
              <span>Embeddings model</span>
              <input
                className="input"
                value={embeddingsModel}
                onChange={(e) => setEmbeddingsModel(e.target.value)}
              />
              <p className="settings-hint">
                Leave this as it is unless you have been told to change it. It must match the
                knowledge pack.
              </p>
              <div className="settings-actions" style={{ marginTop: "0.5rem" }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={applyProviderModelDefaults}
                >
                  Reset chat + embeddings to {PROVIDER_LABELS[providerDefault]} defaults
                </Button>
              </div>
            </label>

            <label className="settings-field">
              <span>Longest reply (256 to 4096)</span>
              <input
                className="input"
                type="number"
                min={256}
                max={4096}
                value={maxOutputTokens}
                onChange={(e) => setMaxOutputTokens(e.target.value)}
              />
            </label>
          </div>

          <div className="settings-key-status">
            <div>
              Key status: Gemini {key?.providers?.gemini?.status === "present" ? "ready" : "missing"} (
              {key?.providers?.gemini?.source === "server_env" ? "server key" : key?.providers?.gemini?.source === "byo" ? "saved here" : "none"})
            </div>
            <div>
              Claude {key?.providers?.claude?.status === "present" ? "ready" : "missing"} (
              {key?.providers?.claude?.source === "server_env" ? "server key" : key?.providers?.claude?.source === "byo" ? "saved here" : "none"})
              {" · "}OpenAI {key?.providers?.openai?.status === "present" ? "ready" : "missing"} (
              {key?.providers?.openai?.source === "server_env" ? "server key" : key?.providers?.openai?.source === "byo" ? "saved here" : "none"})
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Features & safety</h3>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={webLookupEnabled}
              onChange={(e) => setWebLookupEnabled(e.target.checked)}
            />
            <span>
              Trusted web lookup stays on unless you turn it off. Extra Zimbabwe links are marked
              unverified. The firm&apos;s own sources are checked first.
            </span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={matterContextEnabled}
              onChange={(e) => setMatterContextEnabled(e.target.checked)}
            />
            <span>
              Let the assistant use the open matter. When this is off, that help is blocked for
              the whole firm.
            </span>
          </label>
          <p className="settings-hint">
            LexZim AI is assistive only. Always verify authorities against primary sources. Answers
            are not guaranteed correct. Disclaimer stays on and cannot be disabled.
          </p>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Usage (this UTC month)</h3>
          {usage ? (
            <>
              <div style={{ fontSize: "0.9rem", color: "var(--text-2)", lineHeight: 1.5 }}>
                Calls: {usage.callsThisMonth}
                {usage.softBudgetUnlimited
                  ? " (no monthly limit)"
                  : ` / ${usage.softBudget} monthly limit`}
                {usage.warnAt80 && !usage.exceeded ? " · approaching the limit" : ""}
                {usage.exceeded ? " · limit reached (new questions are paused)" : ""}
              </div>
              <p className="settings-hint">
                Success {usage.successCalls} · Failed {usage.failedCalls}
                {usage.remaining !== null ? ` · Remaining ${usage.remaining}` : ""}
              </p>
            </>
          ) : (
            <p className="settings-hint">Usage not loaded yet.</p>
          )}
          <label className="settings-check">
            <input
              type="checkbox"
              checked={budgetUnlimited}
              onChange={(e) => setBudgetUnlimited(e.target.checked)}
            />
            <span>No monthly limit</span>
          </label>
          {!budgetUnlimited ? (
            <label className="settings-field">
              <span>Monthly soft budget (LLM call events)</span>
              <input
                className="input"
                type="number"
                min={1}
                value={monthlySoftBudget}
                onChange={(e) => setMonthlySoftBudget(e.target.value)}
              />
            </label>
          ) : null}
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">LexZim AI Proxy</h3>
          {!proxyEligible ? (
            <p className="settings-hint">
              Not available on this edition. Firm edition includes `ai_proxy`.
            </p>
          ) : (
            <>
              <div style={{ fontSize: "0.9rem", color: "var(--text-2)", lineHeight: 1.5 }}>
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
              <div className="settings-actions">
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
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Keys for this firm (optional)</h3>
          <p className="settings-hint">
            {key?.byoNote ?? "Stored for this firm only. Leave a box blank to keep the key already saved."}
          </p>
          <div className="settings-fields">
            <label className="settings-field">
              <span>Gemini key</span>
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={byoGemini}
                onChange={(e) => setByoGemini(e.target.value)}
                placeholder="Leave blank to keep"
              />
            </label>
            <label className="settings-field">
              <span>Claude key</span>
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={byoClaude}
                onChange={(e) => setByoClaude(e.target.value)}
                placeholder="Leave blank to use the server key"
              />
              <p className="settings-hint">
                Must be a real API key starting with <code>sk-ant-</code>, not a workspace name.
                If you pasted the wrong value here, leave blank and Save to clear it.
              </p>
            </label>
            <label className="settings-field">
              <span>OpenAI key</span>
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={byoOpenAi}
                onChange={(e) => setByoOpenAi(e.target.value)}
                placeholder="Leave blank to keep"
              />
            </label>
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Conversation retention</h3>
          <p className="settings-hint">
            Minimize stored AI chat after {retentionDays} days (default). {expiringCount}{" "}
            conversation(s) can be removed. Old chats are not kept forever.
          </p>
          <div className="settings-actions">
            <Button
              variant="outline"
              onClick={() => void onPurgeAi()}
              disabled={purgingAi || loading}
            >
              {purgingAi ? "Purging…" : "Purge old AI conversations"}
            </Button>
          </div>
        </section>

        {lastTestMessage ? <p className="settings-hint">{lastTestMessage}</p> : null}
        {settings?.updatedAt ? (
          <p className="settings-hint">Settings updated {formatDateTime(settings.updatedAt)}</p>
        ) : null}

        <div className="settings-actions">
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
