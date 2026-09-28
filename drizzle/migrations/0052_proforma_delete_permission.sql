-- finance.proforma.delete: permanently delete pro forma invoices (seed-rbac also upserts this).

INSERT INTO "permissions" ("code", "name", "description", "module")
VALUES (
  'finance.proforma.delete',
  'Delete pro formas',
  'Permanently delete pro forma invoices',
  'finance'
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "module" = EXCLUDED."module";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'managing_partner'
  AND p."code" = 'finance.proforma.delete'
ON CONFLICT DO NOTHING;
