-- Phase 11 P11-02: Payments intake, allocations, requisitions, staff emails, commission settings.
-- Additive only. Trust and fee ledgers remain separate; intakes orchestrate them.

CREATE TABLE IF NOT EXISTS "finance_payment_intakes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE restrict,
  "matter_id" uuid REFERENCES "matters"("id") ON DELETE set null,
  "received_at" timestamp with time zone NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "destination" text NOT NULL,
  "method" text,
  "reference" text,
  "receipt_number" text,
  "notes" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "finance_payment_intakes_firm_id_idx"
  ON "finance_payment_intakes" ("firm_id");
CREATE INDEX IF NOT EXISTS "finance_payment_intakes_client_id_idx"
  ON "finance_payment_intakes" ("client_id");
CREATE INDEX IF NOT EXISTS "finance_payment_intakes_matter_id_idx"
  ON "finance_payment_intakes" ("matter_id");
CREATE INDEX IF NOT EXISTS "finance_payment_intakes_firm_received_idx"
  ON "finance_payment_intakes" ("firm_id", "received_at");

COMMENT ON COLUMN "finance_payment_intakes"."destination" IS
  'trust_bank | trust_vault | fee_bank';

CREATE TABLE IF NOT EXISTS "finance_payment_allocation_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "intake_id" uuid NOT NULL REFERENCES "finance_payment_intakes"("id") ON DELETE cascade,
  "line_type" text NOT NULL,
  "fee_category" text,
  "amount_cents" integer NOT NULL,
  "invoice_id" uuid REFERENCES "invoices"("id") ON DELETE set null,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "finance_payment_alloc_firm_id_idx"
  ON "finance_payment_allocation_lines" ("firm_id");
CREATE INDEX IF NOT EXISTS "finance_payment_alloc_intake_id_idx"
  ON "finance_payment_allocation_lines" ("intake_id");

COMMENT ON COLUMN "finance_payment_allocation_lines"."line_type" IS
  'trust_hold | fee_revenue | disbursement_float';

CREATE TABLE IF NOT EXISTS "finance_requisitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "client_id" uuid REFERENCES "clients"("id") ON DELETE restrict,
  "matter_id" uuid REFERENCES "matters"("id") ON DELETE restrict,
  "nature" text,
  "description" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "requested_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "approved_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "approved_at" timestamp with time zone,
  "rejected_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "rejected_at" timestamp with time zone,
  "rejection_note" text,
  "paid_at" timestamp with time zone,
  "paid_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "payment_ref" text,
  "paid_from" text,
  "recoverable" boolean NOT NULL DEFAULT false,
  "expense_id" uuid REFERENCES "firm_expenses"("id") ON DELETE set null,
  "disbursement_id" uuid REFERENCES "disbursements"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "finance_requisitions_firm_id_idx"
  ON "finance_requisitions" ("firm_id");
CREATE INDEX IF NOT EXISTS "finance_requisitions_firm_status_idx"
  ON "finance_requisitions" ("firm_id", "status");
CREATE INDEX IF NOT EXISTS "finance_requisitions_client_id_idx"
  ON "finance_requisitions" ("client_id");
CREATE INDEX IF NOT EXISTS "finance_requisitions_matter_id_idx"
  ON "finance_requisitions" ("matter_id");

COMMENT ON COLUMN "finance_requisitions"."type" IS 'business | disbursement';
COMMENT ON COLUMN "finance_requisitions"."status" IS
  'draft | pending_approval | approved | rejected | paid | cancelled';
COMMENT ON COLUMN "finance_requisitions"."paid_from" IS 'trust | firm_float | operating';

CREATE TABLE IF NOT EXISTS "staff_communication_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "email" text NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "staff_comm_emails_firm_user_idx"
  ON "staff_communication_emails" ("firm_id", "user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "staff_comm_emails_firm_user_email_uidx"
  ON "staff_communication_emails" ("firm_id", "user_id", "email");

CREATE TABLE IF NOT EXISTS "finance_commission_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "monthly_target_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "commission_percent_above_target" real NOT NULL,
  "effective_from" date NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "finance_commission_settings_firm_id_idx"
  ON "finance_commission_settings" ("firm_id");
CREATE INDEX IF NOT EXISTS "finance_commission_settings_firm_effective_idx"
  ON "finance_commission_settings" ("firm_id", "effective_from");

-- Phase 11 RBAC permission keys (idempotent).
INSERT INTO "permissions" ("id", "code", "name", "description", "module")
VALUES
  (gen_random_uuid(), 'clients.view_all', 'View all clients', 'See all firm clients, not only assigned', 'clients'),
  (gen_random_uuid(), 'finance.view_all_client_accounts', 'View all client finance accounts', 'Open client trust/fee accounts firm-wide for bookkeeping', 'finance'),
  (gen_random_uuid(), 'finance.payments.view', 'View payments', 'See Finance Payments register and intakes', 'finance'),
  (gen_random_uuid(), 'finance.payments.create', 'Record payments', 'Create payment intakes and split allocations', 'finance'),
  (gen_random_uuid(), 'finance.requisitions.view', 'View requisitions', 'See business and disbursement requisitions', 'finance'),
  (gen_random_uuid(), 'finance.requisitions.request', 'Request requisitions', 'Submit business or disbursement fund requests', 'finance'),
  (gen_random_uuid(), 'finance.requisitions.approve', 'Approve requisitions', 'Approve or reject finance requisitions', 'finance'),
  (gen_random_uuid(), 'finance.requisitions.pay', 'Pay requisitions', 'Mark approved requisitions as paid and post money movements', 'finance'),
  (gen_random_uuid(), 'finance.commission.view', 'View commission', 'See lawyer commission progress and amounts due', 'finance'),
  (gen_random_uuid(), 'finance.commission.configure', 'Configure commission', 'Edit monthly targets and commission percentages', 'finance')
ON CONFLICT ("code") DO NOTHING;

-- Managing Partner: all new permissions.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'managing_partner'
  AND p.code IN (
    'clients.view_all',
    'finance.view_all_client_accounts',
    'finance.payments.view',
    'finance.payments.create',
    'finance.requisitions.view',
    'finance.requisitions.request',
    'finance.requisitions.approve',
    'finance.requisitions.pay',
    'finance.commission.view',
    'finance.commission.configure'
  )
ON CONFLICT DO NOTHING;

-- Accounts / bookkeeper: money + client accounts + requisitions (not commission configure).
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'accounts'
  AND p.code IN (
    'clients.view_all',
    'finance.view_all_client_accounts',
    'finance.payments.view',
    'finance.payments.create',
    'finance.requisitions.view',
    'finance.requisitions.request',
    'finance.requisitions.approve',
    'finance.requisitions.pay',
    'finance.commission.view'
  )
ON CONFLICT DO NOTHING;

-- Associates / secretary: request requisitions only.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code IN ('junior_associate', 'secretary', 'senior_associate')
  AND p.code IN (
    'finance.requisitions.view',
    'finance.requisitions.request'
  )
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'senior_associate'
  AND p.code IN (
    'finance.payments.view',
    'finance.commission.view',
    'finance.requisitions.approve'
  )
ON CONFLICT DO NOTHING;
