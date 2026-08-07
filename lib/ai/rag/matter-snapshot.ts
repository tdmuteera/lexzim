import "server-only";

import { composeMatterSummaryText } from "@/lib/ai/firm-memory/build-text";
import { getMatterById } from "@/lib/repos/matters";
import { listMatterEvents } from "@/lib/repos/timeline";
import { listProceduresForMatter } from "@/lib/repos/procedures";
import { listDocumentsForMatter } from "@/lib/repos/documents";

export type MatterAssistSnapshot = {
  matterId: string;
  header: {
    title: string;
    matterNumber: string | null;
    status: string;
    areaOfLaw: string;
    clientDisplayName: string;
    courtName: string | null;
    caseNumber: string | null;
  };
  summaryText: string;
  pendingProceduresText: string;
  recentNotesText: string;
  documentsText: string;
  combinedText: string;
  hasContent: boolean;
};

/**
 * Permissioned live matter facts for Matter Assist (read-only).
 * Never includes other matters.
 */
export async function buildMatterAssistSnapshot(
  firmId: string,
  matterId: string,
): Promise<MatterAssistSnapshot | null> {
  const matter = await getMatterById(firmId, matterId);
  if (!matter) return null;

  const summaryText = composeMatterSummaryText({
    title: matter.title,
    description: matter.description,
    areaOfLaw: matter.areaOfLaw,
    status: matter.status,
    matterNumber: matter.matterNumber,
    fileRef: matter.fileRef,
    courtName: matter.courtName,
    caseNumber: matter.caseNumber,
    priority: matter.priority,
    clientDisplayName: matter.clientDisplayName,
  });

  const procedures = await listProceduresForMatter(firmId, matterId);
  const pending = procedures.filter((p) => p.status === "todo");
  const pendingProceduresText =
    pending.length === 0
      ? "No pending procedures on this matter."
      : pending
          .slice(0, 20)
          .map((p) => {
            const due = p.dueAt ? p.dueAt.toISOString().slice(0, 10) : "no due date";
            return `- [${p.status}] ${p.title} (due: ${due})`;
          })
          .join("\n");

  const events = await listMatterEvents(firmId, matterId, { sortDir: "desc" });
  const recentNotesText =
    events.length === 0
      ? "No timeline notes on this matter."
      : events
          .slice(0, 12)
          .map((e) => {
            const when = e.eventAt.toISOString().slice(0, 10);
            const body = e.body ? ` ${e.body.slice(0, 280)}` : "";
            return `- ${when} [${e.eventType}] ${e.title}.${body}`;
          })
          .join("\n");

  const docs = await listDocumentsForMatter(firmId, matterId);
  const documentsText =
    docs.length === 0
      ? "No documents listed on this matter."
      : docs
          .slice(0, 15)
          .map((d) => `- ${d.title} (${d.fileName})`)
          .join("\n");

  const combinedText = [
    "MATTER SUMMARY",
    summaryText,
    "",
    "PENDING PROCEDURES",
    pendingProceduresText,
    "",
    "RECENT TIMELINE NOTES",
    recentNotesText,
    "",
    "DOCUMENTS (metadata)",
    documentsText,
  ].join("\n");

  return {
    matterId,
    header: {
      title: matter.title,
      matterNumber: matter.matterNumber,
      status: matter.status,
      areaOfLaw: matter.areaOfLaw,
      clientDisplayName: matter.clientDisplayName,
      courtName: matter.courtName,
      caseNumber: matter.caseNumber,
    },
    summaryText,
    pendingProceduresText,
    recentNotesText,
    documentsText,
    combinedText,
    hasContent: Boolean(
      matter.description ||
        pending.length > 0 ||
        events.length > 0 ||
        docs.length > 0 ||
        matter.title,
    ),
  };
}
