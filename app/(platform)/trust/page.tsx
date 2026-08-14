import { FinanceModuleNav } from "@/components/finance/FinanceModuleNav";
import { TrustView } from "@/components/trust/TrustView";

/** Legacy alias for /finance/trust (bookmarks preserved). */
export default function TrustPage() {
  return (
    <div className="module-with-tabs">
      <FinanceModuleNav />
      <TrustView />
    </div>
  );
}
