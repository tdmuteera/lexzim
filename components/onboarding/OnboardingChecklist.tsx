"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type Step = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  optional: boolean;
  href: string;
  helpHref: string;
};

type OnboardingData = {
  dismissed: boolean;
  completedCount: number;
  requiredCount: number;
  allRequiredDone: boolean;
  steps: Step[];
  demoSeedAllowed: boolean;
};

async function postAction(action: string) {
  const res = await fetch("/api/onboarding", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const body = (await res.json()) as {
    ok: boolean;
    data?: OnboardingData;
    error?: { message: string };
  };
  if (!res.ok || !body.ok || !body.data) {
    throw new Error(body.error?.message ?? "Onboarding action failed.");
  }
  return body.data;
}

/** Soft post-setup checklist for Managing Partners. Never blocks the app. */
export function OnboardingChecklist() {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: OnboardingData;
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load onboarding.");
        setData(null);
        return;
      }
      setData(body.data);
    } catch {
      setError("Could not load onboarding.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: string) => {
    setBusy(true);
    setError(null);
    try {
      const next = await postAction(action);
      setData(next);
      if (action === "restore") setShowDismissed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;
  if (!data) {
    return error ? (
      <Can permission="settings.manage">
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          {error}
        </p>
      </Can>
    ) : null;
  }

  if (data.dismissed && !showDismissed) {
    return (
      <Can permission="settings.manage">
        <div className="panel" style={{ marginBottom: "1.25rem" }}>
          <div className="panel-body" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <span className="muted" style={{ fontSize: "0.9rem" }}>
              Setup checklist hidden.
            </span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("restore")}>
              Show checklist
            </Button>
            <Link href="/help" className="muted" style={{ fontSize: "0.85rem" }}>
              Help
            </Link>
          </div>
        </div>
      </Can>
    );
  }

  if (data.allRequiredDone && data.dismissed) return null;

  return (
    <Can permission="settings.manage">
      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <div className="panel-body" style={{ display: "grid", gap: "0.85rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Getting started</h2>
              <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.85rem" }}>
                Soft checklist for this firm. You can dismiss anytime. Web lookup and telemetry stay off unless you enable them.
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <Badge tone={data.allRequiredDone ? "open" : "pending"}>
                {data.completedCount}/{data.requiredCount} required
              </Badge>
              <Link href="/help">
                <Button size="sm" variant="outline">
                  Help
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void run("dismiss")}
              >
                Dismiss
              </Button>
            </div>
          </div>

          {error ? (
            <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.85rem" }}>{error}</p>
          ) : null}

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.5rem" }}>
            {data.steps.map((step) => (
              <li
                key={step.id}
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  padding: "0.75rem 0.9rem",
                  borderRadius: "6px",
                  background: step.done ? "transparent" : "var(--surface-2, rgba(0,0,0,0.03))",
                  border: "1px solid var(--border, #e5e5e5)",
                }}
              >
                <span aria-hidden style={{ fontWeight: 600, minWidth: "1.25rem" }}>
                  {step.done ? "✓" : "○"}
                </span>
                <div style={{ flex: "1 1 12rem" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                    {step.title}
                    {step.optional ? (
                      <span className="muted" style={{ fontWeight: 400 }}>
                        {" "}
                        (optional)
                      </span>
                    ) : null}
                  </div>
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    {step.description}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {!step.done ? (
                    <Link href={step.href}>
                      <Button size="sm">{step.id === "demo_data" ? "Open" : "Go"}</Button>
                    </Link>
                  ) : (
                    <Link href={step.href}>
                      <Button size="sm" variant="outline">
                        View
                      </Button>
                    </Link>
                  )}
                  <Link href={step.helpHref}>
                    <Button size="sm" variant="outline">
                      Help
                    </Button>
                  </Link>
                  {step.id === "export_reminder" && !step.done ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void run("acknowledge_export")}
                    >
                      I&apos;ll schedule export
                    </Button>
                  ) : null}
                  {step.id === "demo_data" && data.demoSeedAllowed && !step.done ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void run("load_demo")}
                    >
                      Load sample
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Can>
  );
}
