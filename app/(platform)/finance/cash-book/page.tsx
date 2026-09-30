import { AccessDenied } from "@/components/shell/AccessDenied";
import { BusinessCashBookView } from "@/components/finance/BusinessCashBookView";
import { getRouteAccessStatus } from "@/lib/rbac/route-access";

export default async function FinanceCashBookPage() {
  const access = await getRouteAccessStatus("/finance/cash-book");
  if (!access.allowed) {
    return <AccessDenied permission={access.permission} />;
  }
  return <BusinessCashBookView />;
}
