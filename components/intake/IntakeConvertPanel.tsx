"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AREA_OF_LAW_OPTIONS } from "@/lib/db/mvp-types";
import { Button } from "@/components/ui/Button";

type ConvertPanelProps = {
  intakeId: string;
  prospectName: string;
  matterSummary: string | null;
  areaOfLaw: string | null;
  opposingParty: string | null;
  allowed: boolean;
  reason: string;
};

export function IntakeConvertPanel({
  intakeId,
  prospectName,
  matterSummary,
  areaOfLaw,
  opposingParty,
  allowed,
  reason,
}: ConvertPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientType, setClientType] = useState<"individual" | "company">("individual");
  const [fullName, setFullName] = useState(prospectName);
  const [legalName, setLegalName] = useState(prospectName);
  const [title, setTitle] = useState(
    matterSummary?.trim() || `Matter: ${prospectName}`,
  );
  const [law, setLaw] = useState(() => {
    if (areaOfLaw && AREA_OF_LAW_OPTIONS.includes(areaOfLaw as (typeof AREA_OF_LAW_OPTIONS)[number])) {
      return areaOfLaw;
    }
    return "Civil";
  });
  const [opposing, setOpposing] = useState(opposingParty ?? "");
  const [matterStatus, setMatterStatus] = useState("open");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(prospectName);
    setLegalName(prospectName);
    setTitle(matterSummary?.trim() || `Matter: ${prospectName}`);
    setOpposing(opposingParty ?? "");
  }, [prospectName, matterSummary, opposingParty]);

  async function convert() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/intakes/${intakeId}/convert`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientType,
          fullName: clientType === "individual" ? fullName : null,
          legalName: clientType === "company" ? legalName : null,
          title,
          areaOfLaw: law,
          matterStatus,
          matterDescription: matterSummary,
          opposingPartyName: opposing || null,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { redirectTo: string };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Conversion failed.");
        return;
      }
      router.push(body.data.redirectTo);
    } catch {
      setError("Conversion failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: "1rem" }}>
      <div className="panel-head">
        <h3>Convert to client + matter</h3>
        {allowed ? (
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide wizard" : "Open wizard"}
          </Button>
        ) : null}
      </div>
      <div className="panel-body">
        <p
          style={{
            marginTop: 0,
            fontSize: "0.85rem",
            color: allowed ? "var(--success, #1a7f4b)" : "var(--danger)",
          }}
        >
          {allowed ? "Ready: " : "Blocked: "}
          {reason}
        </p>

        {allowed && open ? (
          <div className="grid-2" style={{ gap: "0.75rem", fontSize: "0.85rem" }}>
            <label className="form-group">
              <span>Client type</span>
              <select
                value={clientType}
                onChange={(e) =>
                  setClientType(e.target.value === "company" ? "company" : "individual")
                }
              >
                <option value="individual">Individual</option>
                <option value="company">Company</option>
              </select>
            </label>
            {clientType === "individual" ? (
              <label className="form-group">
                <span>Full name</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </label>
            ) : (
              <label className="form-group">
                <span>Legal name</span>
                <input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  required
                />
              </label>
            )}
            <label className="form-group" style={{ gridColumn: "1 / -1" }}>
              <span>Matter title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label className="form-group">
              <span>Area of law</span>
              <select value={law} onChange={(e) => setLaw(e.target.value)}>
                {AREA_OF_LAW_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-group">
              <span>Matter status</span>
              <select
                value={matterStatus}
                onChange={(e) => setMatterStatus(e.target.value)}
              >
                <option value="open">Open</option>
                <option value="prospective">Prospective</option>
              </select>
            </label>
            <label className="form-group" style={{ gridColumn: "1 / -1" }}>
              <span>Opposing party (optional)</span>
              <input
                value={opposing}
                onChange={(e) => setOpposing(e.target.value)}
                placeholder="Creates a related party on the matter"
              />
            </label>
            {error ? (
              <p role="alert" style={{ color: "var(--danger)", gridColumn: "1 / -1" }}>
                {error}
              </p>
            ) : null}
            <div style={{ gridColumn: "1 / -1" }}>
              <Button size="sm" disabled={busy} onClick={() => void convert()}>
                {busy ? "Converting…" : "Convert and open matter"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
