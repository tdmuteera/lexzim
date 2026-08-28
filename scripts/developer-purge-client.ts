/**
 * Developer unlock: hard-purge one client and related finance in a firm.
 * Does not touch other clients (e.g. keep Loice / MAT-0001 when purging a dummy).
 *
 * Usage:
 *   npm run developer:purge-client -- --firm "Pfigu" --client "Tadiwanashe Matekenya" --dry-run
 *   npm run developer:purge-client -- --firm "Pfigu" --client "Tadiwanashe Matekenya" --execute --password "…"
 *
 * Or set DEVELOPER_UNLOCK_PASSWORD in .env.local and pass --execute after chat confirmation.
 */
import { config } from "dotenv";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { assertDeveloperUnlock } from "../lib/developer/unlock";
import {
  auditLogs,
  calendarEvents,
  clients,
  conflictChecks,
  debtorCommunications,
  documents,
  feePayments,
  firms,
  invoiceLines,
  invoices,
  matters,
  quotationLines,
  quotations,
  trustLedgerEntries,
} from "../lib/db/schema";

config({ path: ".env.local" });

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const firmQuery = argValue("--firm");
  const clientQuery = argValue("--client");
  const clientNumber = argValue("--client-number");
  const password = argValue("--password");
  const dryRun = hasFlag("--dry-run") || !hasFlag("--execute");

  if (!firmQuery || (!clientQuery && !clientNumber)) {
    console.error(
      `Usage:
  npm run developer:purge-client -- --firm "Pfigu" --client "Tadiwanashe Matekenya" --dry-run
  npm run developer:purge-client -- --firm "Pfigu" --client "Tadiwanashe Matekenya" --execute --password "…"`,
    );
    process.exit(1);
  }

  if (!dryRun) {
    assertDeveloperUnlock(password);
  }

  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL missing");
  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sql);

  try {
    const firmRows = await db
      .select({ id: firms.id, name: firms.name })
      .from(firms)
      .where(ilike(firms.name, `%${firmQuery}%`))
      .limit(5);

    if (firmRows.length === 0) {
      throw new Error(`No firm matching "${firmQuery}".`);
    }
    if (firmRows.length > 1) {
      console.error(
        "Multiple firms matched:",
        firmRows.map((f) => f.name).join(" | "),
      );
      throw new Error("Narrow --firm until one match remains.");
    }
    const firm = firmRows[0]!;
    console.log(`Firm: ${firm.name} (${firm.id})`);

    const nameParts = (clientQuery ?? "").trim().split(/\s+/).filter(Boolean);

    const clientConditions = [eq(clients.firmId, firm.id)];
    if (clientNumber) {
      clientConditions.push(eq(clients.clientNumber, clientNumber.trim()));
    } else if (nameParts.length) {
      clientConditions.push(
        or(
          and(...nameParts.map((p) => ilike(clients.fullName, `%${p}%`))),
          and(...nameParts.map((p) => ilike(clients.legalName, `%${p}%`))),
          and(...nameParts.map((p) => ilike(clients.tradingName, `%${p}%`))),
        )!,
      );
    }

    const clientRows = await db
      .select({
        id: clients.id,
        clientNumber: clients.clientNumber,
        fullName: clients.fullName,
        legalName: clients.legalName,
        tradingName: clients.tradingName,
      })
      .from(clients)
      .where(and(...clientConditions))
      .limit(10);

    if (clientRows.length === 0) {
      throw new Error(`No client matching "${clientQuery ?? clientNumber}" in that firm.`);
    }
    if (clientRows.length > 1) {
      console.error(
        "Multiple clients matched:",
        clientRows.map((c) => `${c.clientNumber} ${c.fullName ?? c.legalName}`).join(" | "),
      );
      throw new Error("Narrow --client or pass --client-number.");
    }

    const client = clientRows[0]!;
    const display =
      client.fullName ?? client.legalName ?? client.tradingName ?? client.id;
    console.log(`Client: ${client.clientNumber ?? "?"} ${display} (${client.id})`);

    const matterRows = await db
      .select({
        id: matters.id,
        matterNumber: matters.matterNumber,
        title: matters.title,
        status: matters.status,
      })
      .from(matters)
      .where(and(eq(matters.firmId, firm.id), eq(matters.clientId, client.id)));

    const matterIds = matterRows.map((m) => m.id);
    console.log(
      `Matters (${matterRows.length}):`,
      matterRows.map((m) => `${m.matterNumber} ${m.title} [${m.status}]`).join("; ") ||
        "(none)",
    );

    const invByClient = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        totalCents: invoices.totalCents,
      })
      .from(invoices)
      .where(and(eq(invoices.firmId, firm.id), eq(invoices.clientId, client.id)));

    const invByMatter =
      matterIds.length > 0
        ? await db
            .select({
              id: invoices.id,
              invoiceNumber: invoices.invoiceNumber,
              status: invoices.status,
              totalCents: invoices.totalCents,
            })
            .from(invoices)
            .where(and(eq(invoices.firmId, firm.id), inArray(invoices.matterId, matterIds)))
        : [];

    const invoiceMap = new Map<string, (typeof invByClient)[0]>();
    for (const row of [...invByClient, ...invByMatter]) invoiceMap.set(row.id, row);
    const invoiceRows = [...invoiceMap.values()];
    const invoiceIds = invoiceRows.map((i) => i.id);
    console.log(
      `Invoices (${invoiceRows.length}):`,
      invoiceRows
        .map((i) => `${i.invoiceNumber} ${i.status} ${(i.totalCents / 100).toFixed(2)}`)
        .join("; ") || "(none)",
    );

    // Safety: refuse if Loice / MAT-0001 somehow matched
    const blocked = invoiceRows.some((i) =>
      ["INV-0004", "INV-0005"].includes((i.invoiceNumber ?? "").trim()),
    );
    if (blocked) {
      throw new Error(
        "Refusing purge: matched invoices include INV-0004 or INV-0005 (authentic Loice records).",
      );
    }

    if (dryRun) {
      console.log("\nDRY RUN only. Re-run with --execute (and unlock) to delete.");
      return;
    }

    await db.insert(auditLogs).values({
      action: "developer.client_purge_started",
      firmId: firm.id,
      userId: null,
      entityType: "client",
      entityId: client.id,
      metadataJson: {
        clientNumber: client.clientNumber,
        displayName: display,
        matterIds,
        invoiceNumbers: invoiceRows.map((i) => i.invoiceNumber),
        via: "developer-purge-client",
      },
    });

    await db.transaction(async (tx) => {
      await tx
        .delete(debtorCommunications)
        .where(
          and(
            eq(debtorCommunications.firmId, firm.id),
            eq(debtorCommunications.clientId, client.id),
          ),
        );

      await tx
        .delete(conflictChecks)
        .where(
          and(eq(conflictChecks.firmId, firm.id), eq(conflictChecks.clientId, client.id)),
        );

      await tx
        .delete(calendarEvents)
        .where(
          and(eq(calendarEvents.firmId, firm.id), eq(calendarEvents.clientId, client.id)),
        );

      const quoteIds = (
        await tx
          .select({ id: quotations.id })
          .from(quotations)
          .where(and(eq(quotations.firmId, firm.id), eq(quotations.clientId, client.id)))
      ).map((q) => q.id);

      if (quoteIds.length > 0) {
        await tx
          .delete(quotationLines)
          .where(
            and(
              eq(quotationLines.firmId, firm.id),
              inArray(quotationLines.quotationId, quoteIds),
            ),
          );
        await tx
          .delete(quotations)
          .where(and(eq(quotations.firmId, firm.id), inArray(quotations.id, quoteIds)));
      }

      if (invoiceIds.length > 0) {
        await tx
          .delete(feePayments)
          .where(
            and(eq(feePayments.firmId, firm.id), inArray(feePayments.invoiceId, invoiceIds)),
          );
        await tx
          .delete(invoiceLines)
          .where(
            and(eq(invoiceLines.firmId, firm.id), inArray(invoiceLines.invoiceId, invoiceIds)),
          );
        await tx
          .delete(invoices)
          .where(and(eq(invoices.firmId, firm.id), inArray(invoices.id, invoiceIds)));
      }

      await tx
        .delete(trustLedgerEntries)
        .where(
          and(
            eq(trustLedgerEntries.firmId, firm.id),
            eq(trustLedgerEntries.clientId, client.id),
          ),
        );

      await tx
        .delete(documents)
        .where(and(eq(documents.firmId, firm.id), eq(documents.clientId, client.id)));

      await tx
        .delete(clients)
        .where(and(eq(clients.firmId, firm.id), eq(clients.id, client.id)));
    });

    await db.insert(auditLogs).values({
      action: "developer.client_purged",
      firmId: firm.id,
      userId: null,
      entityType: "client",
      entityId: client.id,
      metadataJson: {
        clientNumber: client.clientNumber,
        displayName: display,
        mattersRemoved: matterRows.length,
        invoicesRemoved: invoiceRows.map((i) => i.invoiceNumber),
      },
    });

    console.log("\nPURGED client and related records.");
    console.log("Other firm clients (e.g. Loice / MAT-0001) were not targeted.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
