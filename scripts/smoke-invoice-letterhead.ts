/**
 * Smoke: build letterhead PDF/DOCX/XLSX for one invoice (P10-06).
 * Usage: npx tsx scripts/smoke-invoice-letterhead.ts [invoiceId]
 * Without id: uses the most recent invoice in the DB.
 */
import { createRequire } from "node:module";
import { config } from "dotenv";
import { resolve } from "path";
import fs from "fs";
import path from "path";
import { eq, desc } from "drizzle-orm";

/** Allow importing Next server-only modules from a CLI script. */
const require = createRequire(import.meta.url);
{
  const so = require.resolve("server-only");
  require.cache[so] = {
    id: so,
    filename: so,
    loaded: true,
    exports: {},
  } as NodeModule;
}

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { getDb } = await import("@/lib/db");
  const { firms, invoices } = await import("@/lib/db/schema");
  const { getFirmExportBranding } = await import("@/lib/export/branding");
  const { exportInvoiceLetterheadPdf } = await import("@/lib/export/to-invoice-pdf");
  const { exportInvoiceLetterheadDocx } = await import("@/lib/export/to-invoice-docx");
  const { exportInvoiceLetterheadXlsx } = await import("@/lib/export/to-invoice-xlsx");
  const { buildInvoiceLetterheadModel, INVOICE_FOOTER_PT } = await import(
    "@/lib/export/invoice-letterhead-model"
  );

  const db = getDb();
  const argId = process.argv[2]?.trim();

  let firmId: string;
  let invoiceId: string;

  if (argId) {
    const row = await db
      .select({ id: invoices.id, firmId: invoices.firmId })
      .from(invoices)
      .where(eq(invoices.id, argId))
      .limit(1);
    if (!row[0]) throw new Error(`Invoice not found: ${argId}`);
    firmId = row[0].firmId;
    invoiceId = row[0].id;
  } else {
    const row = await db
      .select({ id: invoices.id, firmId: invoices.firmId })
      .from(invoices)
      .orderBy(desc(invoices.createdAt))
      .limit(1);
    if (!row[0]) throw new Error("No invoices in database.");
    firmId = row[0].firmId;
    invoiceId = row[0].id;
  }

  const firm = await db
    .select({ name: firms.name })
    .from(firms)
    .where(eq(firms.id, firmId))
    .limit(1);

  const branding = await getFirmExportBranding(firmId);
  const model = await buildInvoiceLetterheadModel(firmId, invoiceId, branding);

  if (/pro\s*-?\s*forma|contested/i.test(model.paymentNote)) {
    throw new Error(`Payment note still has contested/pro forma clause:\n${model.paymentNote}`);
  }
  if (INVOICE_FOOTER_PT !== 9) {
    throw new Error(`Expected INVOICE_FOOTER_PT=9, got ${INVOICE_FOOTER_PT}`);
  }

  const outDir = path.join(
    process.env.USERPROFILE || process.env.HOME || ".",
    "Desktop",
    "invoices",
  );
  fs.mkdirSync(outDir, { recursive: true });
  const base = `letterhead-smoke-${invoiceId.slice(0, 8)}`;

  const [pdf, docx, xlsx] = await Promise.all([
    exportInvoiceLetterheadPdf(firmId, invoiceId, branding),
    exportInvoiceLetterheadDocx(firmId, invoiceId, branding),
    exportInvoiceLetterheadXlsx(firmId, invoiceId, branding),
  ]);

  fs.writeFileSync(path.join(outDir, `${base}.pdf`), pdf);
  fs.writeFileSync(path.join(outDir, `${base}.docx`), docx);
  fs.writeFileSync(path.join(outDir, `${base}.xlsx`), xlsx);

  console.log("OK firm:", firm[0]?.name ?? firmId);
  console.log("OK invoice:", invoiceId);
  console.log("OK payment note:", model.paymentNote);
  console.log("OK footer pt:", INVOICE_FOOTER_PT);
  console.log("OK wrote:", path.join(outDir, `${base}.{pdf,docx,xlsx}`));
  console.log("OK sizes:", { pdf: pdf.length, docx: docx.length, xlsx: xlsx.length });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
