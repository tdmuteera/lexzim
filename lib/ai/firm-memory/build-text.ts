import "server-only";

/** Soft cap so a single note/summary stays within embedding token limits. */
export const FIRM_MEMORY_MAX_CHARS = 6000;

export type FirmMemoryUnit = {
  ownerType: "matter_summary" | "matter_note" | "document";
  ownerId: string;
  matterId: string;
  citationLabel: string;
  title: string;
  text: string;
};

function clip(text: string, max = FIRM_MEMORY_MAX_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function composeMatterSummaryText(matter: {
  title: string;
  description: string | null;
  areaOfLaw: string;
  status: string;
  matterNumber: string | null;
  fileRef: string | null;
  courtName: string | null;
  caseNumber: string | null;
  priority: string | null;
  clientDisplayName?: string | null;
}): string {
  const lines = [
    `Matter: ${matter.title}`,
    matter.clientDisplayName ? `Client: ${matter.clientDisplayName}` : null,
    matter.matterNumber ? `Matter number: ${matter.matterNumber}` : null,
    matter.fileRef ? `File ref: ${matter.fileRef}` : null,
    `Area of law: ${matter.areaOfLaw}`,
    `Status: ${matter.status}`,
    matter.priority ? `Priority: ${matter.priority}` : null,
    matter.courtName ? `Court: ${matter.courtName}` : null,
    matter.caseNumber ? `Case number: ${matter.caseNumber}` : null,
    matter.description ? `Description: ${matter.description}` : null,
  ].filter(Boolean);
  return clip(lines.join("\n"));
}

export function composeMatterNoteText(event: {
  title: string;
  body: string | null;
  eventType: string;
  eventAt: Date;
}): string {
  const when = event.eventAt.toISOString().slice(0, 10);
  const lines = [
    `Timeline ${event.eventType}: ${event.title}`,
    `Date: ${when}`,
    event.body ? event.body : null,
  ].filter(Boolean);
  return clip(lines.join("\n"));
}

export function composeDocumentMetaText(doc: {
  title: string;
  fileName: string;
  mimeType: string;
  docType: string;
  sizeBytes: number | null;
}): string {
  const lines = [
    `Document: ${doc.title}`,
    `File name: ${doc.fileName}`,
    `Type: ${doc.docType}`,
    `MIME: ${doc.mimeType}`,
    doc.sizeBytes != null ? `Size bytes: ${doc.sizeBytes}` : null,
    "Note: content text is not extracted yet; metadata only.",
  ].filter(Boolean);
  return clip(lines.join("\n"));
}
