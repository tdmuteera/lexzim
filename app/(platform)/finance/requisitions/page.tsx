import { Suspense } from "react";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { RequisitionsView } from "@/components/finance/RequisitionsView";
import { getRouteAccessStatus } from "@/lib/rbac/route-access";

export default async function FinanceRequisitionsPage() {
  const access = await getRouteAccessStatus("/finance/requisitions");
  if (!access.allowed) {
    return <AccessDenied permission={access.permission} />;
  }
  return (
    <Suspense fallback={<p className="muted">Loading requisitions…</p>}>
      <RequisitionsView />
    </Suspense>
  );
}
