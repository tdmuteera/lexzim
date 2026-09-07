import { AccessDenied } from "@/components/shell/AccessDenied";
import { ClientAccountsView } from "@/components/finance/ClientAccountsView";
import { getRouteAccessStatus } from "@/lib/rbac/route-access";

export default async function FinanceClientAccountsPage() {
  const access = await getRouteAccessStatus("/finance/client-accounts");
  if (!access.allowed) {
    return <AccessDenied permission={access.permission} />;
  }
  return <ClientAccountsView />;
}
