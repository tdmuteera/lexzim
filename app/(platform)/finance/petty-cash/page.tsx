import { AccessDenied } from "@/components/shell/AccessDenied";
import { PettyCashView } from "@/components/finance/PettyCashView";
import { getRouteAccessStatus } from "@/lib/rbac/route-access";

export default async function FinancePettyCashPage() {
  const access = await getRouteAccessStatus("/finance/petty-cash");
  if (!access.allowed) {
    return <AccessDenied permission={access.permission} />;
  }
  return <PettyCashView />;
}
