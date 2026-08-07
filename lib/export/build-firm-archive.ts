import "server-only";

import { eq } from "drizzle-orm";
import JSZip from "jszip";
import { getDb } from "@/lib/db";
import {
  clients,
  documents,
  firms,
  matterEvents,
  matterTeam,
  matters,
  pendingProcedures,
  relatedParties,
  templates,
  templateVersions,
  users,
} from "@/lib/db/schema";
import {
  listFirmSettingsForExport,
} from "@/lib/repos/firm-settings";

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
  ]);

  const storageKeys = collectStorageKeys([
    ...documentsRows.map((r) => r.storagePath),
    ...templatesRows.map((r) => r.storagePath),
    ...templateVersionRows.map((r) => r.storagePath),
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
  };

  const manifest = {
    format: "lexzim-firm-export",
    version: 1,
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
      "Binary storage blobs (keys listed only)",
    ],
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
