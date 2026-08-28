-- Phase 10 P10-05: delegated approval capabilities (overlay on RBAC ticks).
CREATE TABLE IF NOT EXISTS "delegation_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "grantor_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "grantee_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "capability" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "revoked_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null
);

CREATE INDEX IF NOT EXISTS "delegation_grants_firm_grantee_idx"
  ON "delegation_grants" ("firm_id", "grantee_user_id");
CREATE INDEX IF NOT EXISTS "delegation_grants_firm_active_idx"
  ON "delegation_grants" ("firm_id", "capability")
  WHERE "revoked_at" IS NULL;

INSERT INTO "permissions" ("id", "code", "name", "description", "module")
VALUES
  (gen_random_uuid(), 'invoice.approve', 'Approve invoices', 'Approve fee invoices pending send', 'billing'),
  (gen_random_uuid(), 'leave.approve', 'Approve leave', 'Approve staff leave requests', 'hr'),
  (gen_random_uuid(), 'payroll.advance.approve', 'Approve salary advances', 'Approve salary advance requests', 'hr')
ON CONFLICT ("code") DO NOTHING;

-- Managing Partner role matrix: grant new permissions (idempotent).
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'managing_partner'
  AND p.code IN ('invoice.approve', 'leave.approve', 'payroll.advance.approve')
ON CONFLICT DO NOTHING;
