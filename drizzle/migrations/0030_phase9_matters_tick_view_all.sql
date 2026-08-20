-- Matters tick should include matters.view_all for current per-person grants.

INSERT INTO "user_permissions" ("user_id", "permission_id", "firm_id")
SELECT up."user_id", p_all."id", up."firm_id"
FROM "user_permissions" up
INNER JOIN "permissions" p_view
  ON p_view."id" = up."permission_id"
INNER JOIN "permissions" p_all
  ON p_all."code" = 'matters.view_all'
WHERE p_view."code" = 'matters.view'
ON CONFLICT DO NOTHING;
