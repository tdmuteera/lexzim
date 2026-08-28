/**
 * Platform-only purge of a single client and related operational/financial rows.
 * Firm Managing Partner product UI must never call this.
 */
import "server-only";

import { and, count, eq, inArray } from "drizzle-orm";
import { writeAuditLog } from "@/lib/auth/audit";
import { AuthError } from "@/lib/auth/types";
import { clientDisplayName } from "@/lib/clients/display";
import { getDb } from "@/lib/db";
import {
  clients,
  documents,
  feePayments,
  invoiceLines,
  invoices,
  matters,
  quotationLines,
  quotations,
  trustLedgerEntries,
} from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform/admin";

export const CLIENT_PURGE_CONFIRM_PHRASE = "DELETE CLIENT";

export type ClientPurgePreview = {
  firmId: string;
  clientId: string;
  clientNumber: string | null;
  displayName: string;
  archivedAt: string | null;
  counts: {
    matters: number;
    invoices: number;
    invoiceLines: number;
    feePayments: number;
    quotations: number;
    documents: number;
    trustLedgerEntries: number;
  };
};

async function loadClient(firmId: string, clientId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.firmId, firmId), eq(clients.id, clientId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AuthError("not_found", "Client not found in that firm.");
  return row;
}

async function collectInvoiceIds(
  firmId: string,
  clientId: string,
  matterIds: string[],
): Promise<string[]> {
  const db = getDb();
  const byClient = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.firmId, firmId), eq(invoices.clientId, clientId)));
  const byMatter =
    matterIds.length > 0
      ? await db
          .select({ id: invoices.id })
          .from(invoices)
          .where(and(eq(invoices.firmId, firmId), inArray(invoices.matterId, matterIds)))
      : [];
  return [...new Set([...byClient, ...byMatter].map((r) => r.id))];
}

export async function previewClientPurge(
  firmId: string,
  clientId: string,
): Promise<ClientPurgePreview> {
  await requirePlatformAdmin();
  const db = getDb();
  const client = await loadClient(firmId, clientId);

  const matterIds = (
    await db
      .select({ id: matters.id })
      .from(matters)
      .where(and(eq(matters.firmId, firmId), eq(matters.clientId, clientId)))
  ).map((m) => m.id);

  const allInvoiceIds = await collectInvoiceIds(firmId, clientId, matterIds);

  const [mattersCount] = await db
    .select({ n: count() })
    .from(matters)
    .where(and(eq(matters.firmId, firmId), eq(matters.clientId, clientId)));

  const [invCount] = allInvoiceIds.length
    ? await db
        .select({ n: count() })
        .from(invoices)
        .where(and(eq(invoices.firmId, firmId), inArray(invoices.id, allInvoiceIds)))
    : [{ n: 0 }];

  const [lineCount] = allInvoiceIds.length
    ? await db
        .select({ n: count() })
        .from(invoiceLines)
        .where(
          and(eq(invoiceLines.firmId, firmId), inArray(invoiceLines.invoiceId, allInvoiceIds)),
        )
    : [{ n: 0 }];

  const [payCount] = allInvoiceIds.length
    ? await db
        .select({ n: count() })
        .from(feePayments)
        .where(
          and(eq(feePayments.firmId, firmId), inArray(feePayments.invoiceId, allInvoiceIds)),
        )
    : [{ n: 0 }];

  const [quoteCount] = await db
    .select({ n: count() })
    .from(quotations)
    .where(and(eq(quotations.firmId, firmId), eq(quotations.clientId, clientId)));

  const [docCount] = await db
    .select({ n: count() })
    .from(documents)
    .where(and(eq(documents.firmId, firmId), eq(documents.clientId, clientId)));

  const [trustLedgers] = await db
    .select({ n: count() })
    .from(trustLedgerEntries)
    .where(
      and(eq(trustLedgerEntries.firmId, firmId), eq(trustLedgerEntries.clientId, clientId)),
    );

  return {
    firmId,
    clientId: client.id,
    clientNumber: client.clientNumber,
    displayName: clientDisplayName(client),
    archivedAt: client.archivedAt?.toISOString() ?? null,
    counts: {
      matters: Number(mattersCount?.n ?? 0),
      invoices: Number(invCount?.n ?? 0),
      invoiceLines: Number(lineCount?.n ?? 0),
      feePayments: Number(payCount?.n ?? 0),
      quotations: Number(quoteCount?.n ?? 0),
      documents: Number(docCount?.n ?? 0),
      trustLedgerEntries: Number(trustLedgers?.n ?? 0),
    },
  };
}

/**
 * Irreversible client purge (test/dummy cleanup). Removes finance so KPIs drop.
 */
export async function platformPurgeClient(input: {
  firmId: string;
  clientId: string;
  confirmClientNumber: string;
  confirmPhrase: string;
  ipOrUserAgent?: string | null;
}) {
  const admin = await requirePlatformAdmin();
  if (input.confirmPhrase.trim() !== CLIENT_PURGE_CONFIRM_PHRASE) {
    throw new AuthError(
      "validation",
      `confirmPhrase must be exactly "${CLIENT_PURGE_CONFIRM_PHRASE}".`,
    );
  }

  const preview = await previewClientPurge(input.firmId, input.clientId);
  const expectedNumber = (preview.clientNumber ?? "").trim();
  if (!expectedNumber || input.confirmClientNumber.trim() !== expectedNumber) {
    throw new AuthError(
      "validation",
      "confirmClientNumber must match the client number exactly.",
    );
  }

  const db = getDb();
  const firmId = input.firmId;
  const clientId = input.clientId;

  await writeAuditLog({
    action: "platform.client_purge_started",
    firmId,
    userId: admin.id,
    entityType: "client",
    entityId: clientId,
    metadata: {
      clientNumber: preview.clientNumber,
      displayName: preview.displayName,
      counts: preview.counts,
    },
    ipOrUserAgent: input.ipOrUserAgent ?? null,
  });

  await db.transaction(async (tx) => {
    const matterIds = (
      await tx
        .select({ id: matters.id })
        .from(matters)
        .where(and(eq(matters.firmId, firmId), eq(matters.clientId, clientId)))
    ).map((m) => m.id);

    const byClient = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.firmId, firmId), eq(invoices.clientId, clientId)));
    const byMatter =
      matterIds.length > 0
        ? await tx
            .select({ id: invoices.id })
            .from(invoices)
            .where(and(eq(invoices.firmId, firmId), inArray(invoices.matterId, matterIds)))
        : [];
    const allInvoiceIds = [...new Set([...byClient, ...byMatter].map((r) => r.id))];

    const quoteIds = (
      await tx
        .select({ id: quotations.id })
        .from(quotations)
        .where(and(eq(quotations.firmId, firmId), eq(quotations.clientId, clientId)))
    ).map((q) => q.id);

    // Quotations RESTRICT client delete; remove first.
    if (quoteIds.length > 0) {
      await tx
        .delete(quotationLines)
        .where(
          and(eq(quotationLines.firmId, firmId), inArray(quotationLines.quotationId, quoteIds)),
        );
      await tx
        .delete(quotations)
        .where(and(eq(quotations.firmId, firmId), inArray(quotations.id, quoteIds)));
    }

    if (allInvoiceIds.length > 0) {
      await tx
        .delete(feePayments)
        .where(
          and(eq(feePayments.firmId, firmId), inArray(feePayments.invoiceId, allInvoiceIds)),
        );
      await tx
        .delete(invoiceLines)
        .where(
          and(eq(invoiceLines.firmId, firmId), inArray(invoiceLines.invoiceId, allInvoiceIds)),
        );
      await tx
        .delete(invoices)
        .where(and(eq(invoices.firmId, firmId), inArray(invoices.id, allInvoiceIds)));
    }

    // Trust ledger SET NULL on client delete leaves balances in reports; wipe entries.
    await tx
      .delete(trustLedgerEntries)
      .where(
        and(eq(trustLedgerEntries.firmId, firmId), eq(trustLedgerEntries.clientId, clientId)),
      );

    // Client cascade removes matters and remaining client-scoped children.
    await tx.delete(clients).where(and(eq(clients.firmId, firmId), eq(clients.id, clientId)));
  });

  await writeAuditLog({
    action: "platform.client_purged",
    firmId,
    userId: admin.id,
    entityType: "client",
    entityId: clientId,
    metadata: {
      clientNumber: preview.clientNumber,
      displayName: preview.displayName,
      counts: preview.counts,
    },
    ipOrUserAgent: input.ipOrUserAgent ?? null,
  });

  return {
    firmId,
    clientId,
    clientNumber: preview.clientNumber,
    displayName: preview.displayName,
    counts: preview.counts,
  };
}
