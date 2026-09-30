import { AccessDenied } from "@/components/shell/AccessDenied";
import { DisbursementsView } from "@/components/finance/DisbursementsView";
import { getRouteAccessStatus } from "@/lib/rbac/route-access";

export default async function FinanceDisbursementsPage() {
  const access = await getRouteAccessStatus("/finance/disbursements");
  if (!access.allowed) {
    return <AccessDenied permission={access.permission} />;
  }
  return <DisbursementsView />;
}
