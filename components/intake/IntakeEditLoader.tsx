"use client";

import { useEffect, useState } from "react";
import { IntakeForm, type IntakeFormValues } from "@/components/intake/IntakeForm";

type IntakeEditLoaderProps = {
  intakeId: string;
};

export function IntakeEditLoader({ intakeId }: IntakeEditLoaderProps) {
  const [initial, setInitial] = useState<Partial<IntakeFormValues> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/intakes/${intakeId}`, { credentials: "include" });
        const body = (await res.json()) as {
          ok: boolean;
          data?: {
            intake: {
              prospectName: string;
              contactEmail: string | null;
              contactPhone: string | null;
              areaOfLaw: string | null;
              matterSummary: string | null;
              opposingParty: string | null;
              assignedTo: string | null;
              statusNormalized: string;
              editable: boolean;
            };
          };
          error?: { message: string };
        };
        if (!res.ok || !body.ok || !body.data) {
          if (!cancelled) setError(body.error?.message ?? "Could not load intake.");
          return;
        }
        if (!body.data.intake.editable) {
          if (!cancelled) setError("This intake cannot be edited.");
          return;
        }
        const i = body.data.intake;
        if (!cancelled) {
          setInitial({
            prospectName: i.prospectName,
            contactEmail: i.contactEmail ?? "",
            contactPhone: i.contactPhone ?? "",
            areaOfLaw: i.areaOfLaw ?? "",
            matterSummary: i.matterSummary ?? "",
            opposingParty: i.opposingParty ?? "",
            assignedTo: i.assignedTo ?? "",
            status:
              i.statusNormalized === "archived"
                ? "archived"
                : i.statusNormalized === "declined"
                  ? "declined"
                  : "open",
          });
        }
      } catch {
        if (!cancelled) setError("Could not load intake.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intakeId]);

  if (error) {
    return (
      <p role="alert" style={{ color: "var(--danger)" }}>
        {error}
      </p>
    );
  }
  if (!initial) {
    return <p className="muted">Loading…</p>;
  }
  return <IntakeForm mode="edit" intakeId={intakeId} initial={initial} />;
}
