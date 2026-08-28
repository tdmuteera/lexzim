/**
 * Unified approvals inbox (Phase 10 P10-11).
 * Aggregates leave, salary advances, invoice approval, and password resets.
 */
import "server-only";

import type { AuthSessionUser } from "@/lib/auth/types";
import { invoiceDetailPath } from "@/lib/billing/paths";
import { listPendingApprovalInvoices } from "@/lib/repos/billing";
import { listLeaveRequests } from "@/lib/repos/hr-leave";
import { listSalaryAdvances } from "@/lib/repos/hr-salary-advances";
import { listResetRequests } from "@/lib/repos/security";
import { hasAnyPermission, hasPermission } from "@/lib/rbac/permissions";
import { tenantFirmId } from "@/lib/tenant/scope";

export type ApprovalInboxItem = {
  kind: "leave" | "salary_advance" | "invoice" | "password_reset";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  createdAt: string;
  permissionNeeded: string;
};

const INBOX_CAP = 50;

function clientLabel(row: {
  clientFullName: string | null;
  clientLegalName: string | null;
  clientTradingName: string | null;
  clientNumber: string | null;
}): string {
  return (
    row.clientTradingName ||
    row.clientLegalName ||
    row.clientFullName ||
    row.clientNumber ||
    "Client"
  );
}

export async function listApprovalsInbox(
  session: AuthSessionUser,
): Promise<ApprovalInboxItem[]> {
  const firmId = tenantFirmId(session);
  const items: ApprovalInboxItem[] = [];

  const canLeave = hasAnyPermission(session, ["leave.approve", "hr.manage"]);
  const canAdvance = hasAnyPermission(session, [
    "payroll.advance.approve",
    "hr.manage",
  ]);
  const canInvoice = hasPermission(session, "invoice.approve");
  const canUsers = hasPermission(session, "users.manage");

  if (canLeave) {
    const leaveRows = await listLeaveRequests(firmId, { status: "requested" });
    for (const row of leaveRows) {
      items.push({
        kind: "leave",
        id: row.request.id,
        title: `Leave: ${row.staffName}`,
        subtitle: `${row.leaveTypeName} · ${row.request.fromDate.toISOString().slice(0, 10)} to ${row.request.toDate.toISOString().slice(0, 10)}`,
        href: "/hr/leave",
        createdAt: row.request.createdAt.toISOString(),
        permissionNeeded: "leave.approve",
      });
    }
  }

  if (canAdvance) {
    const advances = await listSalaryAdvances(firmId, {
      statuses: ["submitted", "finance_reviewed"],
    });
    for (const row of advances) {
      const a = row.advance;
      const amount = (a.amountCents / 100).toFixed(2);
      items.push({
        kind: "salary_advance",
        id: a.id,
        title: `Salary advance: ${row.staffName}`,
        subtitle: `$${amount} · ${a.status.replace(/_/g, " ")}`,
        href: "/hr/advances",
        createdAt: a.createdAt.toISOString(),
        permissionNeeded: "payroll.advance.approve",
      });
    }
  }

  if (canInvoice) {
    const invoices = await listPendingApprovalInvoices(firmId, INBOX_CAP);
    for (const row of invoices) {
      const inv = row.invoice;
      items.push({
        kind: "invoice",
        id: inv.id,
        title: `Invoice ${inv.invoiceNumber}`,
        subtitle: `${clientLabel(row)} · ${row.matterNumber ?? row.matterTitle ?? "Matter"}`,
        href: invoiceDetailPath(inv.id),
        createdAt: (inv.submittedAt ?? inv.createdAt).toISOString(),
        permissionNeeded: "invoice.approve",
      });
    }
  }

  if (canUsers) {
    const resets = await listResetRequests(firmId, "pending");
    for (const row of resets) {
      items.push({
        kind: "password_reset",
        id: row.id,
        title: `Password reset: ${row.fullName ?? row.email}`,
        subtitle: row.email,
        href: "/settings",
        createdAt: row.requestedAt,
        permissionNeeded: "users.manage",
      });
    }
  }

  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return items.slice(0, INBOX_CAP);
}
