-- Unbundle KYC from Accounts default grants.
-- Finance can keep clients.view for invoicing without clients.kyc.manage.

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'accounts'
  AND p.code = 'clients.kyc.manage';

-- Also strip KYC from per-user grants that only came from the old Clients tick
-- when the user is on the accounts role (leave MP / secretary / custom alone).
DELETE FROM user_permissions up
USING users u, roles r, permissions p
WHERE up.user_id = u.id
  AND u.role_id = r.id
  AND up.permission_id = p.id
  AND r.code = 'accounts'
  AND p.code = 'clients.kyc.manage';
