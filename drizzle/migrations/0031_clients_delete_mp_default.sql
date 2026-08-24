-- clients.delete should be default-only for Managing Partner role.
-- Keep assignable via per-person user_permissions ticks.

DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id"
  AND rp."permission_id" = p."id"
  AND p."code" = 'clients.delete'
  AND r."code" <> 'managing_partner';
