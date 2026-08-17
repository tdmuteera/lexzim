import { FinanceModuleNav } from "@/components/finance/FinanceModuleNav";
import { BillingListView } from "@/components/billing/BillingListView";

/** Legacy alias for /finance/invoicing (bookmarks preserved). */
export default function BillingPage() {
  return (
    <div className="module-with-tabs">
      <FinanceModuleNav />
      <BillingListView />
    </div>
  );
}
