import type { MatterFormValues } from "@/components/matters/MatterForm";
import type { MatterStatus } from "@/lib/db/mvp-types";

/** Shared shape used to hydrate the matter edit form (safe for server or client). */
export type MatterFormSource = {
  clientId: string;
  title: string;
  description: string | null;
  areaOfLaw: string;
  status: string;
  matterNumber: string | null;
  fileRef: string | null;
  courtName: string | null;
  caseNumber: string | null;
  responsibleLawyerId: string | null;
  nextHearingAt: string | null;
  priority: string | null;
};

export function toMatterFormValues(matter: MatterFormSource): MatterFormValues {
  return {
    clientId: matter.clientId,
    title: matter.title,
    description: matter.description ?? "",
    areaOfLaw: matter.areaOfLaw,
    status: matter.status as MatterStatus,
    matterNumber: matter.matterNumber ?? "",
    fileRef: matter.fileRef ?? "",
    courtName: matter.courtName ?? "",
    caseNumber: matter.caseNumber ?? "",
    responsibleLawyerId: matter.responsibleLawyerId ?? "",
    nextHearingAt: matter.nextHearingAt
      ? toDatetimeLocal(matter.nextHearingAt)
      : "",
    priority: matter.priority ?? "normal",
  };
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
