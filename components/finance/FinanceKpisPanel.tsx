"use client";

import Link from "next/link";
import { centsToDisplay } from "@/lib/billing/money";
import type { FinanceKpis } from "@/lib/repos/finance-kpis";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

type FinanceKpisPanelProps = {
  kpis: FinanceKpis;
  compact?: boolean;
};

function KpiTile({
  label,
  value,
  format,
  hint,
  href,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <div className="trust-overview-card panel finance-kpi-tile">
      <div className="trust-overview-card-label">{label}</div>
      <div className="trust-overview-card-balance">
        <AnimatedNumber value={value} durationMs={900} format={format} />
      </div>
      {hint ? (
        <span className="muted" style={{ fontSize: "0.85rem" }}>{hint}</span>
      ) : null}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="finance-kpi-tile-link">
        {inner}
      </Link>
    );
  }
  return inner;
}

export function FinanceKpisPanel({ kpis, compact = false }: FinanceKpisPanelProps) {
  const c = kpis.currency;
  const money = (n: number) => centsToDisplay(n, c);

  if (compact) {
    return (
      <div className="finance-kpis-strip panel motion-kpis-strip">
        <div className="finance-kpis-strip-head">
          <div>
            <strong>Finance KPIs</strong>
            <span className="muted">
              {kpis.periodLabel}
            </span>
          </div>
          <Link href="/finance/reports" className="muted finance-kpis-strip-link">
            Full finance reports
          </Link>
        </div>
        <div className="trust-overview-cards finance-kpis-strip-cards">
          <KpiTile
            label="Fees collected"
            value={kpis.feesCollectedCents}
            format={money}
            hint={`Billed ${centsToDisplay(kpis.feesBilledCents, c)}`}
            href="/finance/invoicing"
          />
          <KpiTile
            label="Debtors 30+"
            value={kpis.debtorsOver30Cents}
            format={money}
            hint={`${kpis.debtorsOver30Count} invoices`}
            href="/finance/debtors"
          />
          <KpiTile
            label="Business bank"
            value={kpis.businessBankBookCents}
            format={money}
            hint="Book balance"
            href="/finance/expenses"
          />
          <KpiTile
            label="Monthly profit"
            value={kpis.monthlyProfitCents}
            format={money}
            hint={`Expenses ${centsToDisplay(kpis.monthlyExpensesCents, c)}`}
            href="/finance/reports"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="finance-kpis-panel">
      <p className="muted finance-aging-note" style={{ marginBottom: "1rem" }}>
        KPIs for <strong>{kpis.periodLabel}</strong>. Fee income on P&amp;L uses payments
        received; billed fees use invoice issue dates.
      </p>

      <div className="trust-overview-cards" style={{ marginBottom: "1.25rem" }}>
        <KpiTile
          label="Fees billed"
          value={kpis.feesBilledCents}
          format={money}
          hint={`${kpis.feesBilledInvoiceCount} invoice${kpis.feesBilledInvoiceCount === 1 ? "" : "s"}`}
          href="/finance/invoicing"
        />
        <KpiTile
          label="Fees collected"
          value={kpis.feesCollectedCents}
          format={money}
          hint={`${kpis.feesCollectedPaymentCount} payment${kpis.feesCollectedPaymentCount === 1 ? "" : "s"}`}
          href="/finance/invoicing"
        />
        <KpiTile
          label="Monthly expenses"
          value={kpis.monthlyExpensesCents}
          format={money}
          hint={`${kpis.monthlyExpenseCount} posted`}
          href="/finance/expenses"
        />
        <KpiTile
          label="Monthly profit"
          value={kpis.monthlyProfitCents}
          format={money}
          hint="Collected minus expenses"
        />
      </div>

      <h4 style={{ marginBottom: "0.5rem" }}>Debtors ageing (outstanding)</h4>
      <div className="trust-overview-cards" style={{ marginBottom: "1.25rem" }}>
        <KpiTile
          label="Over 30 days"
          value={kpis.debtorsOver30Cents}
          format={money}
          hint={`${kpis.debtorsOver30Count} invoice${kpis.debtorsOver30Count === 1 ? "" : "s"}`}
          href="/finance/debtors"
        />
        <KpiTile
          label="Over 60 days"
          value={kpis.debtorsOver60Cents}
          format={money}
          hint={`${kpis.debtorsOver60Count} invoice${kpis.debtorsOver60Count === 1 ? "" : "s"}`}
          href="/finance/debtors"
        />
        <KpiTile
          label="Over 90 days"
          value={kpis.debtorsOver90Cents}
          format={money}
          hint={`${kpis.debtorsOver90Count} invoice${kpis.debtorsOver90Count === 1 ? "" : "s"}`}
          href="/finance/debtors"
        />
      </div>

      <h4 style={{ marginBottom: "0.5rem" }}>Cash positions</h4>
      <div className="trust-overview-cards" style={{ marginBottom: "1.25rem" }}>
        <KpiTile
          label="Business bank (book)"
          value={kpis.businessBankBookCents}
          format={money}
          hint={
            kpis.businessBankStatementCents != null
              ? `Last stmt ${centsToDisplay(kpis.businessBankStatementCents, c)}`
              : kpis.businessBankLabel
          }
          href="/finance/expenses"
        />
        <KpiTile
          label="Trust vault"
          value={kpis.trustVaultCents}
          format={money}
          hint="Physical trust cash"
          href="/finance/trust"
        />
      </div>

      <h4 style={{ marginBottom: "0.5rem" }}>Matters</h4>
      <div className="trust-overview-cards">
        <KpiTile
          label="Opened this month"
          value={kpis.mattersOpened}
          href="/matters?bucket=open"
        />
        <KpiTile
          label="Closed this month"
          value={kpis.mattersClosed}
          href="/matters?bucket=closed"
        />
      </div>
    </div>
  );
}
