import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { BillingListView } from "@/components/billing/BillingListView";

export default function BillingPage() {
  return (
    <ProtectedModulePage path="/billing">
      <BillingListView />
    </ProtectedModulePage>
  );
}
