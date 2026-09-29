/**
 * Finance integrity checks: ledgers must agree with each other and with GL.
 * Read-only. Each check reports ok plus the figures compared, so a failure is explainable.
 */
import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export type IntegrityCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  rows?: Array<Record<string, unknown>>;
};

export type IntegrityReport = {
  firmId: string;
  checkedAt: string;
  ok: boolean;
  checks: IntegrityCheck[];
};

type Row = Record<string, unknown>;

async function q<T extends Row = Row>(query: ReturnType<typeof sql>): Promise<T[]> {
  const res = await getDb().execute(query);
  return res as unknown as T[];
}

function n(v: unknown): number {
  return Number(v ?? 0) || 0;
}

export async function runFinanceIntegrity(firmId: string): Promise<IntegrityReport> {
  const checks: IntegrityCheck[] = [];

  const gl = await q<{ code: string; dr: number; cr: number }>(sql`
    select a.code, coalesce(sum(l.debit_cents),0)::bigint as dr, coalesce(sum(l.credit_cents),0)::bigint as cr
    from gl_journal_lines l join gl_accounts a on a.id = l.account_id
    where l.firm_id = ${firmId}
    group by a.code`);
  const glBal = (code: string, normal: "debit" | "credit") => {
    const r = gl.find((x) => x.code === code);
    if (!r) return 0;
    return normal === "debit" ? n(r.dr) - n(r.cr) : n(r.cr) - n(r.dr);
  };
  const totalDr = gl.reduce((s, r) => s + n(r.dr), 0);
  const totalCr = gl.reduce((s, r) => s + n(r.cr), 0);
  checks.push({
    id: "gl_balanced",
    label: "General ledger debits equal credits",
    ok: totalDr === totalCr,
    detail: `debits ${totalDr}, credits ${totalCr}`,
  });

  const trustTotals = await q<{ total: number; client_total: number; untagged: number }>(sql`
    select coalesce(sum(amount_cents),0)::bigint as total,
           coalesce(sum(amount_cents) filter (where client_id is not null),0)::bigint as client_total,
           count(*) filter (where client_id is null)::int as untagged
    from trust_ledger_entries where firm_id = ${firmId}`);
  const trustTotal = n(trustTotals[0]?.total);
  const gl1210 = glBal("1210", "debit");
  const gl2100 = glBal("2100", "credit");
  checks.push({
    id: "trust_ledger_vs_gl_1210",
    label: "Trust ledger total equals GL trust bank (1210)",
    ok: trustTotal === gl1210,
    detail: `trust ledger ${trustTotal}, GL 1210 ${gl1210}`,
  });
  checks.push({
    id: "trust_ledger_vs_gl_2100",
    label: "Client trust balances equal GL trust liability (2100)",
    ok: n(trustTotals[0]?.client_total) === gl2100,
    detail: `client balances ${n(trustTotals[0]?.client_total)}, GL 2100 ${gl2100}`,
  });
  checks.push({
    id: "trust_no_orphans",
    label: "Every trust entry is tagged to a client",
    ok: n(trustTotals[0]?.untagged) === 0,
    detail: `${n(trustTotals[0]?.untagged)} untagged entries`,
  });

  const negatives = await q(sql`
    select t.client_id, t.trust_account_id, sum(t.amount_cents)::bigint as balance,
           bool_or(t.authorised_by is not null) as has_authorised_override
    from trust_ledger_entries t
    where t.firm_id = ${firmId} and t.client_id is not null
    group by t.client_id, t.trust_account_id
    having sum(t.amount_cents) < 0`);
  const unauthorisedNeg = negatives.filter((r) => !r.has_authorised_override);
  checks.push({
    id: "trust_no_unauthorised_negative",
    label: "No client trust balance is negative without a Managing Partner override",
    ok: unauthorisedNeg.length === 0,
    detail: `${negatives.length} negative balances, ${unauthorisedNeg.length} without authorisation`,
    rows: negatives,
  });

  const crossClient = await q(sql`
    select t.id, t.client_id, m.client_id as matter_client_id
    from trust_ledger_entries t join matters m on m.id = t.matter_id
    where t.firm_id = ${firmId} and t.client_id is not null and m.client_id <> t.client_id`);
  checks.push({
    id: "trust_matter_client_match",
    label: "Trust entries never sit on another client's matter",
    ok: crossClient.length === 0,
    detail: `${crossClient.length} mismatched entries`,
    rows: crossClient,
  });

  const badReversals = await q(sql`
    select r.id, r.amount_cents, o.amount_cents as original_amount
    from trust_ledger_entries r join trust_ledger_entries o on o.id = r.reversal_of_id
    where r.firm_id = ${firmId} and (r.amount_cents <> -o.amount_cents or o.reversed_by_id is distinct from r.id)`);
  const badFeeReversals = await q(sql`
    select r.id, r.amount_cents, o.amount_cents as original_amount
    from fee_payments r join fee_payments o on o.id = r.reversal_of_id
    where r.firm_id = ${firmId} and (r.amount_cents <> -o.amount_cents or o.reversed_by_id is distinct from r.id)`);
  checks.push({
    id: "reversal_pairs",
    label: "Every reversal exactly offsets its original and is linked both ways",
    ok: badReversals.length === 0 && badFeeReversals.length === 0,
    detail: `${badReversals.length} trust and ${badFeeReversals.length} receipt pairs broken`,
    rows: [...badReversals, ...badFeeReversals],
  });

  const transfers = await q(sql`
    select transfer_group_id, sum(amount_cents)::bigint as net, count(*)::int as legs
    from trust_ledger_entries
    where firm_id = ${firmId} and transfer_group_id is not null
    group by transfer_group_id
    having sum(amount_cents) <> 0 or count(*) <> 2`);
  checks.push({
    id: "transfer_legs_balance",
    label: "Every transfer has two legs that net to zero",
    ok: transfers.length === 0,
    detail: `${transfers.length} unbalanced transfer groups`,
    rows: transfers,
  });

  const invoices = await q<{
    id: string;
    invoice_number: string;
    status: string;
    total_cents: number;
    paid: number;
    retainer_applied_cents: number;
    trust_fee: number;
  }>(sql`
    select i.id, i.invoice_number, i.status, i.total_cents, i.retainer_applied_cents,
      coalesce((select sum(p.amount_cents) from fee_payments p where p.invoice_id = i.id),0)::bigint as paid,
      coalesce((select -sum(t.amount_cents) from trust_ledger_entries t
                where t.invoice_id = i.id and (t.source_type in ('invoice_fee','intake_fee')
                  or (t.source_type = 'reversal' and t.reversal_of_id in (
                    select o.id from trust_ledger_entries o where o.invoice_id = i.id and o.source_type in ('invoice_fee','intake_fee'))))),0)::bigint as trust_fee
    from invoices i where i.firm_id = ${firmId}`);
  const invoiceIssues = invoices.filter((i) => {
    const outstanding = n(i.total_cents) - n(i.paid) - n(i.retainer_applied_cents);
    if (outstanding < 0) return true;
    if (i.status === "paid" && outstanding > 0) return true;
    if ((i.status === "sent" || i.status === "overdue") && outstanding <= 0 && n(i.total_cents) > 0) return true;
    if (i.status === "void" && n(i.paid) + n(i.retainer_applied_cents) !== 0) return true;
    if (n(i.retainer_applied_cents) !== n(i.trust_fee)) return true;
    return false;
  });
  checks.push({
    id: "invoice_balances",
    label: "Invoice status, receipts and trust applied agree (no overpayment, no stale status)",
    ok: invoiceIssues.length === 0,
    detail: `${invoiceIssues.length} of ${invoices.length} invoices inconsistent`,
    rows: invoiceIssues,
  });

  const arOutstanding = invoices
    .filter((i) => i.status !== "draft" && i.status !== "void")
    .reduce((s, i) => s + n(i.total_cents) - n(i.paid) - n(i.retainer_applied_cents), 0);
  const gl1310 = glBal("1310", "debit");
  checks.push({
    id: "ar_vs_gl_1310",
    label: "Invoice balances outstanding equal GL accounts receivable (1310)",
    ok: arOutstanding === gl1310,
    detail: `invoices outstanding ${arOutstanding}, GL 1310 ${gl1310}`,
  });

  const reqLinks = await q(sql`
    select r.id, r.paid_from, r.trust_entry_id, r.disbursement_id
    from finance_requisitions r
    where r.firm_id = ${firmId} and r.status in ('paid','reversed') and r.type = 'disbursement'
      and ((r.paid_from = 'trust' and r.trust_entry_id is null) or r.disbursement_id is null)`);
  checks.push({
    id: "requisition_links",
    label: "Paid disbursement requisitions link to their trust entry and disbursement",
    ok: reqLinks.length === 0,
    detail: `${reqLinks.length} requisitions missing links`,
    rows: reqLinks,
  });

  const orphanJournals = await q(sql`
    select j.id, j.source_type, j.source_id from gl_journal_entries j
    where j.firm_id = ${firmId} and (
      (j.source_type = 'trust' and j.source_id ~ '^[0-9a-f-]{36}$'
        and not exists (select 1 from trust_ledger_entries t where t.id::text = j.source_id)) or
      (j.source_type = 'trust_fee' and j.source_id ~ '^[0-9a-f-]{36}$'
        and not exists (select 1 from trust_ledger_entries t where t.id::text = j.source_id)) or
      (j.source_type = 'payment' and j.source_id ~ '^[0-9a-f-]{36}$'
        and not exists (select 1 from fee_payments p where p.id::text = j.source_id)) or
      (j.source_type = 'invoice' and j.source_id ~ '^[0-9a-f-]{36}$'
        and not exists (select 1 from invoices i where i.id::text = j.source_id))
    )`);
  checks.push({
    id: "journals_traceable",
    label: "Every system journal traces to its source record",
    ok: orphanJournals.length === 0,
    detail: `${orphanJournals.length} journals without a source record`,
    rows: orphanJournals,
  });

  const dupReceipts = await q(sql`
    select receipt_number, count(*)::int c from fee_payments
    where firm_id = ${firmId} and receipt_number is not null
    group by receipt_number having count(*) > 1`);
  checks.push({
    id: "no_duplicate_receipts",
    label: "Receipt numbers are unique",
    ok: dupReceipts.length === 0,
    detail: `${dupReceipts.length} duplicated receipt numbers`,
    rows: dupReceipts,
  });

  return {
    firmId,
    checkedAt: new Date().toISOString(),
    ok: checks.every((c) => c.ok),
    checks,
  };
}
