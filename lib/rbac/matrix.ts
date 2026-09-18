/**
 * RBAC seed definitions for P0-06.
 * Managing Partner gets every permission; other roles get a sensible subset.
 */
import type { PermissionCode, RoleCode } from "@/lib/db/types";

export const ROLE_DEFS: {
  code: RoleCode;
  name: string;
  description: string;
}[] = [
  {
    code: "managing_partner",
    name: "Managing Partner",
    description: "Full firm access including users, trust, settings, and audit.",
  },
  {
    code: "senior_associate",
    name: "Senior Associate",
    description: "Broad practice access; limited admin and trust management.",
  },
  {
    code: "junior_associate",
    name: "Junior Associate",
    description: "Assigned-matter focused; no matters.view_all.",
  },
  {
    code: "secretary",
    name: "Secretary / Paralegal",
    description: "Clients, documents, and calendar support.",
  },
  {
    code: "accounts",
    name: "Accounts / Bookkeeper",
    description: "Billing, trust, and reports with limited matter visibility.",
  },
];

export const PERMISSION_DEFS: {
  code: PermissionCode;
  name: string;
  description: string;
  module: string;
}[] = [
  { code: "dashboard.view", name: "View dashboard", description: "See home dashboard", module: "dashboard" },
  { code: "clients.view", name: "View clients", description: "List and open clients", module: "clients" },
  {
    code: "clients.view_all",
    name: "View all clients",
    description: "See all firm clients, not only assigned",
    module: "clients",
  },
  { code: "clients.create", name: "Create clients", description: "Register clients", module: "clients" },
  { code: "clients.edit", name: "Edit clients", description: "Update client records", module: "clients" },
  { code: "clients.delete", name: "Delete/archive clients", description: "Archive clients", module: "clients" },
  {
    code: "clients.kyc.manage",
    name: "Manage client KYC",
    description: "Edit KYC/AML intake fields on client profiles",
    module: "clients",
  },
  { code: "matters.view", name: "View matters", description: "View allowed matters", module: "matters" },
  { code: "matters.create", name: "Create matters", description: "Open new matters", module: "matters" },
  { code: "matters.edit", name: "Edit matters", description: "Update matters", module: "matters" },
  { code: "matters.delete", name: "Delete/archive matters", description: "Close/archive matters", module: "matters" },
  { code: "matters.view_all", name: "View all matters", description: "See all firm matters, not only assigned", module: "matters" },
  { code: "documents.view", name: "View documents", description: "Open matter documents", module: "documents" },
  { code: "documents.manage", name: "Manage documents", description: "Upload/delete documents", module: "documents" },
  { code: "templates.view", name: "View templates", description: "Browse templates", module: "templates" },
  { code: "templates.manage", name: "Manage templates", description: "Edit/approve templates", module: "templates" },
  { code: "calendar.view", name: "View calendar", description: "See diary events", module: "calendar" },
  { code: "calendar.manage", name: "Manage calendar", description: "Create/edit events", module: "calendar" },
  { code: "billing.view", name: "View billing", description: "See invoices and time", module: "billing" },
  { code: "billing.manage", name: "Manage billing", description: "Create invoices and payments", module: "billing" },
  {
    code: "billing.my_clients.view",
    name: "View my clients finance",
    description: "Invoices, payments, and debtors for clients allocated to you",
    module: "billing",
  },
  { code: "trust.view", name: "View trust", description: "See trust balances", module: "trust" },
  { code: "trust.manage", name: "Manage trust", description: "Post trust ledger entries", module: "trust" },
  {
    code: "finance.view",
    name: "View finance desk",
    description: "Debtors, expenses, cashbook, and finance reports",
    module: "finance",
  },
  {
    code: "finance.post",
    name: "Post firm finance",
    description: "Record expenses and business cashbook entries",
    module: "finance",
  },
  {
    code: "finance.reconcile",
    name: "Run reconciliations",
    description: "Trust and business bank reconciliation workflows",
    module: "finance",
  },
  {
    code: "finance.close_month",
    name: "Close finance period",
    description: "Lock accounting periods at month end",
    module: "finance",
  },
  {
    code: "finance.gl.view",
    name: "View general ledger",
    description: "Chart of accounts, journals, trial balance, and financial statements",
    module: "finance",
  },
  {
    code: "finance.gl.post",
    name: "Post journal entries",
    description: "Create manual GL journal entries and edit non-system accounts",
    module: "finance",
  },
  {
    code: "finance.quote.manage",
    name: "Manage quotations",
    description: "Service catalogue and client quotations",
    module: "finance",
  },
  {
    code: "finance.view_all_client_accounts",
    name: "View all client finance accounts",
    description: "Open client trust/fee accounts firm-wide for bookkeeping",
    module: "finance",
  },
  {
    code: "finance.payments.view",
    name: "View payments",
    description: "See Finance Payments register and intakes",
    module: "finance",
  },
  {
    code: "finance.payments.create",
    name: "Record payments",
    description: "Create payment intakes and split allocations",
    module: "finance",
  },
  {
    code: "finance.requisitions.view",
    name: "View requisitions",
    description: "See business and disbursement requisitions",
    module: "finance",
  },
  {
    code: "finance.requisitions.request",
    name: "Request requisitions",
    description: "Submit business or disbursement fund requests",
    module: "finance",
  },
  {
    code: "finance.requisitions.approve",
    name: "Approve requisitions",
    description: "Approve or reject finance requisitions (delegable)",
    module: "finance",
  },
  {
    code: "finance.requisitions.pay",
    name: "Pay requisitions",
    description: "Mark approved requisitions as paid and post money movements",
    module: "finance",
  },
  {
    code: "finance.commission.view",
    name: "View commission",
    description: "See lawyer commission progress and amounts due",
    module: "finance",
  },
  {
    code: "finance.commission.configure",
    name: "Configure commission",
    description: "Edit monthly targets and commission percentages",
    module: "finance",
  },
  { code: "hr.view", name: "View HR", description: "Staff directory, contracts, and payroll", module: "hr" },
  {
    code: "hr.manage",
    name: "Manage HR",
    description: "Edit staff records, contracts, and submit leave/advances for others",
    module: "hr",
  },
  {
    code: "hr.leave.request",
    name: "Request leave",
    description: "Submit and view your own leave requests",
    module: "hr",
  },
  {
    code: "hr.advances.request",
    name: "Request salary advances",
    description: "Submit and view your own salary advance requests",
    module: "hr",
  },
  { code: "crm.view", name: "View CRM", description: "Client birthdays and firm holidays", module: "crm" },
  {
    code: "crm.manage",
    name: "Manage CRM holidays",
    description: "Add or remove firm public holidays",
    module: "crm",
  },
  { code: "ai.use", name: "Use AI", description: "Open AI assistant", module: "ai" },
  { code: "ai.manage_settings", name: "Manage AI settings", description: "Change AI keys/settings", module: "ai" },
  { code: "audit.view", name: "View audit log", description: "Read audit events", module: "audit" },
  { code: "settings.manage", name: "Manage settings", description: "Firm settings and exports", module: "settings" },
  { code: "users.manage", name: "Manage users", description: "Invite/deactivate users", module: "users" },
  {
    code: "users.activity.view",
    name: "View user activity",
    description: "See what staff did in the system (audit trail on User access)",
    module: "users",
  },
  { code: "reports.view", name: "View reports", description: "Run management reports", module: "reports" },
  {
    code: "knowledge.reports.view",
    name: "View knowledge reports",
    description: "List and download event / BD / training reports",
    module: "knowledge",
  },
  {
    code: "knowledge.reports.manage",
    name: "Manage knowledge reports",
    description: "Upload and manage event / BD / training reports",
    module: "knowledge",
  },
  {
    code: "invoice.approve",
    name: "Approve invoices",
    description: "Approve fee invoices pending send (delegable)",
    module: "billing",
  },
  {
    code: "leave.approve",
    name: "Approve leave",
    description: "Approve staff leave requests (delegable)",
    module: "hr",
  },
  {
    code: "payroll.advance.approve",
    name: "Approve salary advances",
    description: "Approve salary advance requests (delegable)",
    module: "hr",
  },
];

const allCodes = PERMISSION_DEFS.map((p) => p.code);

function except(codes: PermissionCode[], remove: PermissionCode[]): PermissionCode[] {
  const ban = new Set(remove);
  return codes.filter((c) => !ban.has(c));
}

/** Default role → permission codes matrix */
export const ROLE_PERMISSION_MATRIX: Record<RoleCode, PermissionCode[]> = {
  managing_partner: allCodes,
  senior_associate: except(allCodes, [
    "users.manage",
    "matters.view_all",
    "clients.view_all",
    "trust.manage",
    "settings.manage",
    "ai.manage_settings",
    "crm.manage",
    "clients.delete",
    "finance.commission.configure",
    "finance.requisitions.pay",
  ]),
  junior_associate: [
    "dashboard.view",
    "clients.view",
    "matters.view",
    "matters.create",
    "matters.edit",
    "documents.view",
    "documents.manage",
    "templates.view",
    "calendar.view",
    "calendar.manage",
    "crm.view",
    "ai.use",
    "knowledge.reports.view",
    "knowledge.reports.manage",
    "finance.requisitions.view",
    "finance.requisitions.request",
    "hr.leave.request",
    "hr.advances.request",
    "billing.my_clients.view",
  ],
  secretary: [
    "dashboard.view",
    "clients.view",
    "clients.create",
    "clients.edit",
    "clients.kyc.manage",
    "matters.view",
    "documents.view",
    "documents.manage",
    "templates.view",
    "calendar.view",
    "calendar.manage",
    "crm.view",
    "crm.manage",
    "ai.use",
    "knowledge.reports.view",
    "knowledge.reports.manage",
    "finance.requisitions.view",
    "finance.requisitions.request",
    "hr.leave.request",
    "hr.advances.request",
  ],
  accounts: [
    "dashboard.view",
    "clients.view",
    "clients.view_all",
    "matters.view",
    "matters.view_all",
    "billing.view",
    "billing.manage",
    "trust.view",
    "trust.manage",
    "finance.view",
    "finance.post",
    "finance.reconcile",
    "finance.close_month",
    "finance.gl.view",
    "finance.gl.post",
    "finance.quote.manage",
    "finance.view_all_client_accounts",
    "finance.payments.view",
    "finance.payments.create",
    "finance.requisitions.view",
    "finance.requisitions.request",
    "finance.requisitions.approve",
    "finance.requisitions.pay",
    "finance.commission.view",
    "hr.view",
    "hr.manage",
    "hr.leave.request",
    "hr.advances.request",
    "crm.view",
    "crm.manage",
    "reports.view",
    "knowledge.reports.view",
  ],
};
