import { centsToDisplay } from "@/lib/billing/money";
import type { DebtorsRow } from "@/lib/repos/debtors";

export function draftInvoiceReminderMessage(input: {
  firmName: string;
  clientName: string;
  rows: DebtorsRow[];
}): { subject: string; message: string } {
  const { firmName, clientName, rows } = input;
  if (!rows.length) {
    return {
      subject: `Payment reminder — ${firmName}`,
      message: `Dear ${clientName},\n\nThis is a courtesy reminder regarding outstanding fees.\n\nKind regards,\n${firmName}`,
    };
  }
  const currency = rows[0]!.currency;
  const total = rows.reduce((s, r) => s + r.balanceCents, 0);
  const lines = rows
    .map((r) => {
      const due = r.dueDate ?? "n/a";
      const overdue =
        r.daysPastDue > 0 ? ` (${r.daysPastDue} day${r.daysPastDue === 1 ? "" : "s"} overdue)` : "";
      return `• Invoice ${r.invoiceNumber} — due ${due}${overdue} — ${centsToDisplay(r.balanceCents, r.currency)}`;
    })
    .join("\n");

  const subject =
    rows.length === 1
      ? `Payment reminder: Invoice ${rows[0]!.invoiceNumber} — ${firmName}`
      : `Payment reminder: ${rows.length} invoices — ${firmName}`;

  const message = `Dear ${clientName},

This is a courtesy reminder that the following fee invoice${rows.length === 1 ? " is" : "s are"} outstanding with ${firmName}:

${lines}

Total outstanding: ${centsToDisplay(total, currency)}

Please arrange payment at your earliest convenience, or contact us if you have already paid or need a copy of the invoice.

Kind regards,
${firmName}`;

  return { subject, message };
}
