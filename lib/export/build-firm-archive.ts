import "server-only";

import { eq } from "drizzle-orm";
import JSZip from "jszip";
import { getDb } from "@/lib/db";
import {
  calendarEvents,
  clients,
  conflictChecks,
  deadlineTemplates,
  disbursements,
  documentPortalShares,
  documents,
  feePayments,
  firms,
  firmLicences,
  intakes,
  invoiceLines,
  invoices,
  matterDeadlines,
  matterEvents,
  matterPortalShares,
  matterTeam,
  matters,
  pendingProcedures,
  portalInboxUploads,
  portalUsers,
  relatedParties,
  templates,
  templateVersions,
  timeEntries,
  trustAccounts,
  trustLedgerEntries,
  users,
} from "@/lib/db/schema";
import { listFirmSettingsForExport } from "@/lib/repos/firm-settings";

export type FirmArchiveResult = {
  zipBytes: Uint8Array;
  fileName: string;
  exportedAt: string;
  counts: Record<string, number>;
  storageKeyCount: number;
};

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function collectStorageKeys(
  paths: Array<string | null | undefined>,
): string[] {
  const set = new Set<string>();
  for (const path of paths) {
    if (path && path.startsWith("firms/")) {
      set.add(path);
    }
  }
  return [...set].sort();
}

/**
 * Build a firm data archive (ZIP): manifest + JSON entity dumps + storage key list.
 * Does not embed binary files (paths only). Omits API keys / secrets from firm_settings.
 * Includes Phase 3 practice-ops tables (billing, trust, calendar, intake).
 */
export async function buildFirmArchive(firmId: string): Promise<FirmArchiveResult> {
  const db = getDb();
  const exportedAt = new Date().toISOString();

  const [firm] = await db.select().from(firms).where(eq(firms.id, firmId)).limit(1);
  if (!firm) {
    throw new Error("Firm not found.");
  }

  const [
    clientsRows,
    mattersRows,
    teamRows,
    partiesRows,
    proceduresRows,
    eventsRows,
    documentsRows,
    templatesRows,
    templateVersionRows,
    usersRows,
    settingsRows,
    calendarRows,
    deadlineTemplateRows,
    matterDeadlineRows,
    timeRows,
    disbursementRows,
    invoiceRows,
    invoiceLineRows,
    feePaymentRows,
    trustAccountRows,
    trustLedgerRows,
    intakeRows,
    conflictRows,
  ] = await Promise.all([
    db.select().from(clients).where(eq(clients.firmId, firmId)),
    db.select().from(matters).where(eq(matters.firmId, firmId)),
    db.select().from(matterTeam).where(eq(matterTeam.firmId, firmId)),
    db.select().from(relatedParties).where(eq(relatedParties.firmId, firmId)),
    db.select().from(pendingProcedures).where(eq(pendingProcedures.firmId, firmId)),
    db.select().from(matterEvents).where(eq(matterEvents.firmId, firmId)),
    db.select().from(documents).where(eq(documents.firmId, firmId)),
    db.select().from(templates).where(eq(templates.firmId, firmId)),
    db.select().from(templateVersions).where(eq(templateVersions.firmId, firmId)),
    db
      .select({
        id: users.id,
        firmId: users.firmId,
        email: users.email,
        fullName: users.fullName,
        roleId: users.roleId,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.firmId, firmId)),
    listFirmSettingsForExport(firmId),
    db.select().from(calendarEvents).where(eq(calendarEvents.firmId, firmId)),
    db.select().from(deadlineTemplates).where(eq(deadlineTemplates.firmId, firmId)),
    db.select().from(matterDeadlines).where(eq(matterDeadlines.firmId, firmId)),
    db.select().from(timeEntries).where(eq(timeEntries.firmId, firmId)),
    db.select().from(disbursements).where(eq(disbursements.firmId, firmId)),
    db.select().from(invoices).where(eq(invoices.firmId, firmId)),
    db.select().from(invoiceLines).where(eq(invoiceLines.firmId, firmId)),
    db.select().from(feePayments).where(eq(feePayments.firmId, firmId)),
    db.select().from(trustAccounts).where(eq(trustAccounts.firmId, firmId)),
    db.select().from(trustLedgerEntries).where(eq(trustLedgerEntries.firmId, firmId)),
    db.select().from(intakes).where(eq(intakes.firmId, firmId)),
    db.select().from(conflictChecks).where(eq(conflictChecks.firmId, firmId)),
  ]);

  const licenceRows = await db
    .select()
    .from(firmLicences)
    .where(eq(firmLicences.firmId, firmId));

  const [
    portalUserRows,
    matterShareRows,
    documentShareRows,
    inboxRows,
  ] = await Promise.all([
    db
      .select({
        id: portalUsers.id,
        firmId: portalUsers.firmId,
        clientId: portalUsers.clientId,
        email: portalUsers.email,
        fullName: portalUsers.fullName,
        isActive: portalUsers.isActive,
        invitedAt: portalUsers.invitedAt,
        lastLoginAt: portalUsers.lastLoginAt,
        createdAt: portalUsers.createdAt,
      })
      .from(portalUsers)
      .where(eq(portalUsers.firmId, firmId)),
    db.select().from(matterPortalShares).where(eq(matterPortalShares.firmId, firmId)),
    db.select().from(documentPortalShares).where(eq(documentPortalShares.firmId, firmId)),
    db
      .select({
        id: portalInboxUploads.id,
        firmId: portalInboxUploads.firmId,
        clientId: portalInboxUploads.clientId,
        matterId: portalInboxUploads.matterId,
        portalUserId: portalInboxUploads.portalUserId,
        title: portalInboxUploads.title,
        fileName: portalInboxUploads.fileName,
        mimeType: portalInboxUploads.mimeType,
        storagePath: portalInboxUploads.storagePath,
        sizeBytes: portalInboxUploads.sizeBytes,
        status: portalInboxUploads.status,
        acceptedDocumentId: portalInboxUploads.acceptedDocumentId,
        createdAt: portalInboxUploads.createdAt,
        reviewedAt: portalInboxUploads.reviewedAt,
      })
      .from(portalInboxUploads)
      .where(eq(portalInboxUploads.firmId, firmId)),
  ]);

  const storageKeys = collectStorageKeys([
    ...documentsRows.map((r) => r.storagePath),
    ...templatesRows.map((r) => r.storagePath),
    ...templateVersionRows.map((r) => r.storagePath),
    ...inboxRows.map((r) => r.storagePath),
  ]);

  const counts: Record<string, number> = {
    clients: clientsRows.length,
    matters: mattersRows.length,
    matter_team: teamRows.length,
    related_parties: partiesRows.length,
    pending_procedures: proceduresRows.length,
    matter_events: eventsRows.length,
    documents: documentsRows.length,
    templates: templatesRows.length,
    template_versions: templateVersionRows.length,
    users: usersRows.length,
    firm_settings: settingsRows.length,
    calendar_events: calendarRows.length,
    deadline_templates: deadlineTemplateRows.length,
    matter_deadlines: matterDeadlineRows.length,
    time_entries: timeRows.length,
    disbursements: disbursementRows.length,
    invoices: invoiceRows.length,
    invoice_lines: invoiceLineRows.length,
    fee_payments: feePaymentRows.length,
    trust_accounts: trustAccountRows.length,
    trust_ledger_entries: trustLedgerRows.length,
    intakes: intakeRows.length,
    conflict_checks: conflictRows.length,
    firm_licences: licenceRows.length,
    portal_users: portalUserRows.length,
    matter_portal_shares: matterShareRows.length,
    document_portal_shares: documentShareRows.length,
    portal_inbox_uploads: inboxRows.length,
  };

  const manifest = {
    format: "lexzim-firm-export",
    version: 3,
    exportedAt,
    firm: {
      id: firm.id,
      name: firm.name,
      slug: firm.slug,
      status: firm.status,
      country: firm.country,
      defaultCurrency: firm.defaultCurrency,
    },
    counts,
    storage: {
      note: "Binary files are not embedded. Paths list Supabase Storage object keys under firms/{firm_id}/.",
      objectKeys: storageKeys,
      objectKeyCount: storageKeys.length,
    },
    restore: {
      mvp: "Import is support-assisted / later. Use this archive as a portable snapshot, not a one-click restore wizard.",
    },
    exclusions: [
      "API keys, secrets, tokens, and password-like firm_settings keys",
      "Platform admin accounts",
      "Auth passwords / refresh tokens (not stored in app tables)",
      "Portal password hashes and magic-link token hashes",
      "Binary storage blobs (keys listed only)",
      "AI embeddings / knowledge chunks (re-ingest from Settings)",
    ],
    notes: [
      "fee_payments are fee receipts only; trust_ledger_entries are client money. Keep them separate on restore.",
      "Portal shares and inbox metadata included (Phase 5). Desktop/local wipe is N/A for this SaaS.",
    ],
    retention: "See docs/cloud/RETENTION.md (draft windows for legal review).",
  };

  const zip = new JSZip();
  zip.file("manifest.json", jsonBytes(manifest));
  zip.folder("data");
  zip.file("data/firm.json", jsonBytes(firm));
  zip.file("data/clients.json", jsonBytes(clientsRows));
  zip.file("data/matters.json", jsonBytes(mattersRows));
  zip.file("data/matter_team.json", jsonBytes(teamRows));
  zip.file("data/related_parties.json", jsonBytes(partiesRows));
  zip.file("data/pending_procedures.json", jsonBytes(proceduresRows));
  zip.file("data/matter_events.json", jsonBytes(eventsRows));
  zip.file("data/documents.json", jsonBytes(documentsRows));
  zip.file("data/templates.json", jsonBytes(templatesRows));
  zip.file("data/template_versions.json", jsonBytes(templateVersionRows));
  zip.file("data/users.json", jsonBytes(usersRows));
  zip.file(
    "data/firm_settings.json",
    jsonBytes(
      settingsRows.map((row) => ({
        key: row.key,
        value: row.value,
        updatedAt: row.updatedAt,
      })),
    ),
  );
  zip.file("data/calendar_events.json", jsonBytes(calendarRows));
  zip.file("data/deadline_templates.json", jsonBytes(deadlineTemplateRows));
  zip.file("data/matter_deadlines.json", jsonBytes(matterDeadlineRows));
  zip.file("data/time_entries.json", jsonBytes(timeRows));
  zip.file("data/disbursements.json", jsonBytes(disbursementRows));
  zip.file("data/invoices.json", jsonBytes(invoiceRows));
  zip.file("data/invoice_lines.json", jsonBytes(invoiceLineRows));
  zip.file("data/fee_payments.json", jsonBytes(feePaymentRows));
  zip.file("data/trust_accounts.json", jsonBytes(trustAccountRows));
  zip.file("data/trust_ledger_entries.json", jsonBytes(trustLedgerRows));
  zip.file("data/intakes.json", jsonBytes(intakeRows));
  zip.file("data/conflict_checks.json", jsonBytes(conflictRows));
  zip.file("data/firm_licences.json", jsonBytes(licenceRows));
  zip.file("data/portal_users.json", jsonBytes(portalUserRows));
  zip.file("data/matter_portal_shares.json", jsonBytes(matterShareRows));
  zip.file("data/document_portal_shares.json", jsonBytes(documentShareRows));
  zip.file("data/portal_inbox_uploads.json", jsonBytes(inboxRows));
  zip.file("data/storage_keys.json", jsonBytes({ objectKeys: storageKeys }));

  const zipBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const safeSlug = firm.slug.replace(/[^\w-]+/g, "-") || "firm";
  const stamp = exportedAt.replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `lexzim-export-${safeSlug}-${stamp}.zip`;

  return {
    zipBytes,
    fileName,
    exportedAt,
    counts,
    storageKeyCount: storageKeys.length,
  };
}
