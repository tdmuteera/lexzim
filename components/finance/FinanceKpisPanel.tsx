"use client";

import Link from "next/link";
import { centsToDisplay } from "@/lib/billing/money";
import type { FinanceKpis } from "@/lib/repos/finance-kpis";

type FinanceKpisPanelProps = {
  kpis: FinanceKpis;
  compact?: boolean;
};

function KpiTile({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <div className="trust-overview-card panel finance-kpi-tile">
      <div className="trust-overview-card-label">{label}</div>
      <div className="trust-overview-card-balance">{value}</div>
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

  if (compact) {
    return (
      <div className="finance-kpis-strip panel" style={{ marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginBottom: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong>Finance KPIs</strong>
            <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.9rem" }}>
              {kpis.periodLabel}
            </span>
          </div>
          <Link href="/finance/reports" className="muted" style={{ fontSize: "0.85rem" }}>
            Full finance reports →
          </Link>
        </div>
        <div className="trust-overview-cards finance-kpis-strip-cards">
          <KpiTile
            label="Fees collected"
            value={centsToDisplay(kpis.feesCollectedCents, c)}
            hint={`Billed ${centsToDisplay(kpis.feesBilledCents, c)}`}
            href="/finance/invoicing"
          />
          <KpiTile
            label="Debtors 30+"
            value={centsToDisplay(kpis.debtorsOver30Cents, c)}
            hint={`${kpis.debtorsOver30Count} invoices`}
            href="/finance/debtors"
          />
          <KpiTile
            label="Business bank"
            value={centsToDisplay(kpis.businessBankBookCents, c)}
            hint="Book balance"
            href="/finance/expenses"
          />
          <KpiTile
            label="Monthly profit"
            value={centsToDisplay(kpis.monthlyProfitCents, c)}
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
          value={centsToDisplay(kpis.feesBilledCents, c)}
          hint={`${kpis.feesBilledInvoiceCount} invoice${kpis.feesBilledInvoiceCount === 1 ? "" : "s"}`}
          href="/finance/invoicing"
        />
        <KpiTile
          label="Fees collected"
          value={centsToDisplay(kpis.feesCollectedCents, c)}
          hint={`${kpis.feesCollectedPaymentCount} payment${kpis.feesCollectedPaymentCount === 1 ? "" : "s"}`}
          href="/finance/invoicing"
        />
        <KpiTile
          label="Monthly expenses"
          value={centsToDisplay(kpis.monthlyExpensesCents, c)}
          hint={`${kpis.monthlyExpenseCount} posted`}
          href="/finance/expenses"
        />
        <KpiTile
          label="Monthly profit"
          value={centsToDisplay(kpis.monthlyProfitCents, c)}
          hint="Collected minus expenses"
        />
      </div>

      <h4 style={{ marginBottom: "0.5rem" }}>Debtors ageing (outstanding)</h4>
      <div className="trust-overview-cards" style={{ marginBottom: "1.25rem" }}>
        <KpiTile
          label="Over 30 days"
          value={centsToDisplay(kpis.debtorsOver30Cents, c)}
          hint={`${kpis.debtorsOver30Count} invoice${kpis.debtorsOver30Count === 1 ? "" : "s"}`}
          href="/finance/debtors"
        />
        <KpiTile
          label="Over 60 days"
          value={centsToDisplay(kpis.debtorsOver60Cents, c)}
          hint={`${kpis.debtorsOver60Count} invoice${kpis.debtorsOver60Count === 1 ? "" : "s"}`}
          href="/finance/debtors"
        />
        <KpiTile
          label="Over 90 days"
          value={centsToDisplay(kpis.debtorsOver90Cents, c)}
          hint={`${kpis.debtorsOver90Count} invoice${kpis.debtorsOver90Count === 1 ? "" : "s"}`}
          href="/finance/debtors"
        />
      </div>

      <h4 style={{ marginBottom: "0.5rem" }}>Cash positions</h4>
      <div className="trust-overview-cards" style={{ marginBottom: "1.25rem" }}>
        <KpiTile
          label="Business bank (book)"
          value={centsToDisplay(kpis.businessBankBookCents, c)}
          hint={
            kpis.businessBankStatementCents != null
              ? `Last stmt ${centsToDisplay(kpis.businessBankStatementCents, c)}`
              : kpis.businessBankLabel
          }
          href="/finance/expenses"
        />
        <KpiTile
          label="Trust vault"
          value={centsToDisplay(kpis.trustVaultCents, c)}
          hint="Physical trust cash"
          href="/finance/trust"
        />
      </div>

      <h4 style={{ marginBottom: "0.5rem" }}>Matters</h4>
      <div className="trust-overview-cards">
        <KpiTile
          label="Opened this month"
          value={String(kpis.mattersOpened)}
          href="/matters?bucket=open"
        />
        <KpiTile
          label="Closed this month"
          value={String(kpis.mattersClosed)}
          href="/matters?bucket=closed"
        />
      </div>
    </div>
  );
}
