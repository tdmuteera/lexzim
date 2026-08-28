import { Suspense } from "react";
import { DebtorsView } from "@/components/finance/DebtorsView";

export default function FinanceDebtorsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading debtors…</p>}>
      <DebtorsView />
    </Suspense>
  );
}
