import { AccessDenied } from "@/components/shell/AccessDenied";
import { FundsTransferView } from "@/components/finance/FundsTransferView";
import { getRouteAccessStatus } from "@/lib/rbac/route-access";

export default async function FinanceTransfersPage() {
  const access = await getRouteAccessStatus("/finance/transfers");
  if (!access.allowed) {
    return <AccessDenied permission={access.permission} />;
  }
  return <FundsTransferView />;
}
