import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { hasAnyPermission, hasPermission } from "@/lib/rbac/permissions";

export default async function FinanceIndexPage() {
  const session = await requireSession();
  if (
    hasAnyPermission(session, ["billing.view", "billing.my_clients.view"])
  ) {
    redirect("/finance/invoicing");
  }
  if (hasPermission(session, "finance.payments.view")) {
    redirect("/finance/payments");
  }
  if (hasPermission(session, "trust.view")) redirect("/finance/trust");
  if (hasPermission(session, "finance.view")) {
    redirect("/finance/client-accounts");
  }
  if (hasPermission(session, "finance.requisitions.view")) {
    redirect("/finance/requisitions");
  }
  redirect("/dashboard");
}
