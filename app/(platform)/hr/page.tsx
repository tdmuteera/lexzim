import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { hasAnyPermission, hasPermission } from "@/lib/rbac/permissions";

export default async function HrIndexPage() {
  const session = await requireSession();
  if (hasPermission(session, "hr.view")) redirect("/hr/staff");
  if (hasAnyPermission(session, ["hr.leave.request"])) redirect("/hr/leave");
  if (hasAnyPermission(session, ["hr.advances.request"])) redirect("/hr/advances");
  redirect("/dashboard");
}
