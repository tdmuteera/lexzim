"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";

type FieldPreview = { field: string; token: string; value: string };
type TemplateOption = {
  id: string;
  title: string;
  areaOfLaw: string;
  isApproved: boolean;
  version: number;
};

type MatterGeneratePanelProps = {
  matterId: string;
  onGenerated?: () => void;
};

export function MatterGeneratePanel({ matterId, onGenerated }: MatterGeneratePanelProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [fields, setFields] = useState<FieldPreview[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [plainText, setPlainText] = useState("");
  const [aiAssisted, setAiAssisted] = useState(false);
  const [step, setStep] = useState<"fields" | "preview">("fields");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/matters/${matterId}/generate`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          fields: FieldPreview[];
          templates: TemplateOption[];
          values: Record<string, string>;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load merge preview.");
        return;
      }
      setFields(body.data?.fields ?? []);
      setTemplates(body.data?.templates ?? []);
      setOverrides(body.data?.values ?? {});
      if (!templateId && body.data?.templates?.[0]) {
        setTemplateId(body.data.templates[0].id);
      }
    } catch {
      setError("Could not load merge preview.");
    } finally {
      setLoading(false);
    }
  }, [matterId, templateId]);

  useEffect(() => {
    if (open) loadPreview();
  }, [open, loadPreview]);

  function resetAndClose() {
    setOpen(false);
    setStep("fields");
    setPlainText("");
    setAiAssisted(false);
    setError(null);
  }

  async function onBuildPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId) {
      setError("Select a template from the firm library.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/matters/${matterId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "preview",
          templateId,
          title: title.trim() || undefined,
          overrides,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          title: string;
          plainText: string;
          merge: { leftoverTokens: string[]; unresolvedFields: string[] };
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not build draft preview.");
        return;
      }
      setTitle(body.data.title);
      setPlainText(body.data.plainText);
      setAiAssisted(false);
      setStep("preview");
      const leftover = body.data.merge.leftoverTokens ?? [];
      if (leftover.length) {
        setInfo(`Merge preview ready. Tokens left unchanged: ${leftover.join(", ")}`);
      } else {
        setInfo("Merge preview ready. Review the text before saving.");
      }
    } catch {
      setError("Could not build draft preview.");
    } finally {
      setBusy(false);
    }
  }

  async function onPolish() {
    if (!plainText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/matters/${matterId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "polish",
          plainText,
          title: title.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          plainText: string;
          polished: boolean;
          message?: string | null;
          errorCode?: string | null;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "AI polish failed.");
        return;
      }
      setPlainText(body.data.plainText);
      if (body.data.polished) {
        setAiAssisted(true);
        setInfo("AI polish applied. Review carefully before filing or service.");
      } else {
        setInfo(
          body.data.message ||
            "AI polish unavailable; merge-only draft kept. You can still edit and save.",
        );
      }
    } catch {
      setError("AI polish failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!plainText.trim()) {
      setError("Draft text is empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/matters/${matterId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "save",
          templateId: templateId || undefined,
          title: title.trim() || undefined,
          plainText,
          aiAssisted,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { document: { title: string } };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not save draft.");
        return;
      }
      setInfo(`Saved “${body.data.document.title}” to matter documents.`);
      resetAndClose();
      onGenerated?.();
    } catch {
      setError("Could not save draft.");
    } finally {
      setBusy(false);
    }
  }

  /** Fast path: original merge-only generate (no text review). */
  async function onGenerateDirect() {
    if (!templateId) {
      setError("Select a template.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/matters/${matterId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          templateId,
          title: title.trim() || undefined,
          overrides,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { document: { title: string } };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Generation failed.");
        return;
      }
      setInfo(`Generated “${body.data?.document.title}” (merge-only, no AI).`);
      resetAndClose();
      onGenerated?.();
    } catch {
      setError("Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: "1rem" }}>
      <Can permission="documents.manage">
        {!open ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Generate from template
          </Button>
        ) : null}
      </Can>

      {info && !open ? (
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          {info}
        </p>
      ) : null}

      {open ? (
        <div className="panel" style={{ padding: "1rem", marginTop: "0.75rem" }}>
          <h4 style={{ marginTop: 0 }}>Draft from template</h4>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            Merge firm library templates only (no invented forms). Optional AI polish, then review
            and save. No auto-send.
          </p>

          {error ? (
            <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }} role="alert">
              {error}
            </p>
          ) : null}
          {info && open ? (
            <p className="muted" style={{ marginBottom: "0.75rem" }}>
              {info}
            </p>
          ) : null}

          {loading ? (
            <p className="muted">Loading templates…</p>
          ) : step === "fields" ? (
            <form onSubmit={(e) => void onBuildPreview(e)}>
              <div className="form-group">
                <label htmlFor="gen-template">Template (firm library)</label>
                <select
                  id="gen-template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  required
                >
                  <option value="">Select template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.areaOfLaw}: {t.title} (v{t.version}
                      {t.isApproved ? ", approved" : ""})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="gen-title">Output title (optional)</label>
                <input
                  id="gen-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Defaults to template — matter title"
                />
              </div>

              <div className="table-wrap" style={{ marginBottom: "0.75rem" }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => (
                      <tr key={f.field}>
                        <td>
                          <code>{f.token}</code>
                        </td>
                        <td>
                          <input
                            value={overrides[f.field] ?? ""}
                            onChange={(e) =>
                              setOverrides((prev) => ({
                                ...prev,
                                [f.field]: e.target.value,
                              }))
                            }
                            style={{ width: "100%" }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <Button type="submit" size="sm" disabled={busy || !templateId}>
                  {busy ? "Merging…" : "Build preview"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !templateId}
                  onClick={() => void onGenerateDirect()}
                >
                  Merge-only .docx
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={resetAndClose}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div>
              <div
                style={{
                  marginBottom: "0.75rem",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid rgba(168, 83, 69, 0.35)",
                  background: "var(--danger-bg)",
                  color: "var(--text)",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                }}
                role="status"
              >
                AI draft — review before filing or service
              </div>

              <div className="form-group">
                <label htmlFor="draft-title">Document title</label>
                <input
                  id="draft-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="draft-body">Editable preview</label>
                <textarea
                  id="draft-body"
                  value={plainText}
                  onChange={(e) => setPlainText(e.target.value)}
                  rows={16}
                  style={{
                    width: "100%",
                    fontFamily: "ui-monospace, Consolas, monospace",
                    fontSize: "0.85rem",
                    lineHeight: 1.45,
                  }}
                />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <Can permission="ai.use">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !plainText.trim()}
                    onClick={() => void onPolish()}
                  >
                    {busy ? "Working…" : "Polish with AI"}
                  </Button>
                </Can>
                <Button
                  type="button"
                  size="sm"
                  variant="gold"
                  disabled={busy || !plainText.trim()}
                  onClick={() => void onSave()}
                >
                  {busy ? "Saving…" : "Save to matter"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setStep("fields");
                    setPlainText("");
                    setAiAssisted(false);
                  }}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={resetAndClose}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
