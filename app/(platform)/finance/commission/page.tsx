import { AccessDenied } from "@/components/shell/AccessDenied";
import { CommissionView } from "@/components/finance/CommissionView";
import { getRouteAccessStatus } from "@/lib/rbac/route-access";

export default async function FinanceCommissionPage() {
  const access = await getRouteAccessStatus("/finance/commission");
  if (!access.allowed) {
    return <AccessDenied permission={access.permission} />;
  }
  return <CommissionView />;
}
