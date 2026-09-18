export type FirmStatus = "active" | "trial" | "demo" | "suspended" | "archived";

export type Firm = {
  id: string;
  name: string;
  slug: string;
  status: FirmStatus | string;
  defaultCurrency: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string | null;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type PlatformAdmin = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: Date;
};

export type Role = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  createdAt: Date;
};

export type Permission = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  module: string;
};

export type AppUser = {
  id: string;
  firmId: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  roleId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

export type AuditLog = {
  id: string;
  firmId: string | null;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadataJson: Record<string, unknown> | null;
  ipOrUserAgent: string | null;
  createdAt: Date;
};

export type RoleCode =
  | "managing_partner"
  | "senior_associate"
  | "junior_associate"
  | "secretary"
  | "accounts";

export type PermissionCode =
  | "dashboard.view"
  | "clients.view"
  | "clients.view_all"
  | "clients.create"
  | "clients.edit"
  | "clients.delete"
  | "clients.kyc.manage"
  | "matters.view"
  | "matters.create"
  | "matters.edit"
  | "matters.delete"
  | "matters.view_all"
  | "documents.view"
  | "documents.manage"
  | "templates.view"
  | "templates.manage"
  | "calendar.view"
  | "calendar.manage"
  | "billing.view"
  | "billing.manage"
  | "trust.view"
  | "trust.manage"
  | "finance.view"
  | "finance.post"
  | "finance.reconcile"
  | "finance.close_month"
  | "finance.gl.view"
  | "finance.gl.post"
  | "finance.quote.manage"
  | "finance.view_all_client_accounts"
  | "finance.payments.view"
  | "finance.payments.create"
  | "finance.requisitions.view"
  | "finance.requisitions.request"
  | "finance.requisitions.approve"
  | "finance.requisitions.pay"
  | "finance.commission.view"
  | "finance.commission.configure"
  | "hr.view"
  | "hr.manage"
  | "hr.leave.request"
  | "hr.advances.request"
  | "crm.view"
  | "crm.manage"
  | "ai.use"
  | "ai.manage_settings"
  | "audit.view"
  | "settings.manage"
  | "users.manage"
  | "users.activity.view"
  | "reports.view"
  | "knowledge.reports.view"
  | "knowledge.reports.manage"
  | "invoice.approve"
  | "leave.approve"
  | "payroll.advance.approve"
  | "billing.my_clients.view";
