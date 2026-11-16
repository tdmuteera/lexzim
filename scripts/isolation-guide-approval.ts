/**
 * Isolation only. One task given to a colleague, and one bill waiting for approval.
 * Does not post the ledger and does not send mail.
 *
 *   npx tsx scripts/isolation-guide-approval.ts
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { config } from "dotenv";

const require = createRequire(import.meta.url);
const so = require.resolve("server-only");
require.cache[so] = { id: so, filename: so, loaded: true, exports: {} };
config({ path: resolve(process.cwd(), ".env.local") });

const NOTE = "Guide film approval. Hearing bundle for Ncube v Dube.";
const TASK = "Confirm the hearing bundle for Ncube v Dube";

async function main() {
  const { and, eq } = await import("drizzle-orm");
  const { getDb } = await import("../lib/db");
  const { firms, firmTasks, invoices, matters, users } = await import("../lib/db/schema");
  const { allocateInvoiceNumber } = await import("../lib/repos/firm-settings");

  const db = getDb();
  const firm = (await db.select().from(firms).where(eq(firms.slug, "isolation-test-firm")).limit(1))[0];
  if (!firm) throw new Error("Isolation Test Firm was not found. Nothing was written.");

  const guide = (await db.select().from(users).where(eq(users.email, "guide.tester@lexzim.local")).limit(1))[0];
  const partner = (
    await db.select().from(users).where(and(eq(users.firmId, firm.id), eq(users.fullName, "Isolation Managing Partner"))).limit(1)
  )[0];
  if (!guide || guide.firmId !== firm.id || !partner) {
    throw new Error("Guide Tester or the managing partner was not found. Nothing was written.");
  }

  const matter = (
    await db.select().from(matters).where(and(eq(matters.firmId, firm.id), eq(matters.title, "Ncube v Dube"))).limit(1)
  )[0];
  if (!matter) throw new Error("Ncube v Dube was not found. Nothing was written.");

  const existingTask = (
    await db.select().from(firmTasks).where(and(eq(firmTasks.firmId, firm.id), eq(firmTasks.title, TASK))).limit(1)
  )[0];
  if (existingTask) {
    await db.update(firmTasks).set({
      description: "Check the brief is on the file before 30 October.",
      assigneeUserId: partner.id,
      assignerUserId: guide.id,
    }).where(eq(firmTasks.id, existingTask.id));
  } else {
    await db.insert(firmTasks).values({
      firmId: firm.id,
      title: TASK,
      description: "Check the brief is on the file before 30 October.",
      assigneeUserId: partner.id,
      assignerUserId: guide.id,
      dueAt: new Date("2026-10-20T09:00:00.000Z"),
      priority: "normal",
      status: "pending",
    });
  }

  const existingBill = (
    await db.select().from(invoices).where(and(eq(invoices.firmId, firm.id), eq(invoices.notes, NOTE))).limit(1)
  )[0];
  let number = existingBill?.invoiceNumber ?? "";
  if (!existingBill) {
    number = await allocateInvoiceNumber(firm.id);
    await db.insert(invoices).values({
      firmId: firm.id,
      matterId: matter.id,
      clientId: matter.clientId,
      invoiceNumber: number,
      status: "draft",
      approvalState: "pending",
      submittedAt: new Date(),
      submittedBy: guide.id,
      currency: "USD",
      subtotalCents: 8000,
      taxCents: 0,
      totalCents: 8000,
      notes: NOTE,
      subject: "Hearing bundle",
      createdBy: guide.id,
    });
  }

  console.log(JSON.stringify({ firm: firm.name, task: !existingTask, invoice: number || "already there" }));
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
