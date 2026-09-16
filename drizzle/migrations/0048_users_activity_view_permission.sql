-- users.activity.view: User activity tab on Lawyers & Staff (seed-rbac also upserts this).

INSERT INTO "permissions" ("code", "name", "description", "module")
VALUES (
  'users.activity.view',
  'View user activity',
  'See what staff did in the system (audit trail on User access)',
  'users'
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
  AND p."code" = 'users.activity.view'
ON CONFLICT DO NOTHING;
