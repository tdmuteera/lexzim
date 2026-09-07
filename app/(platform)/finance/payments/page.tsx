import { AccessDenied } from "@/components/shell/AccessDenied";
import { PaymentsView } from "@/components/finance/PaymentsView";
import { getRouteAccessStatus } from "@/lib/rbac/route-access";

export default async function FinancePaymentsPage() {
  const access = await getRouteAccessStatus("/finance/payments");
  if (!access.allowed) {
    return <AccessDenied permission={access.permission} />;
  }
  return <PaymentsView />;
}
