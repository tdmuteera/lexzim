import assert from "node:assert/strict";
import {
  canViewAllClientAccounts,
  canViewAllClients,
  canViewAllMatters,
} from "../lib/rbac/permissions";
import type { AuthSessionUser } from "../lib/auth/types";

function fakeUser(
  role: string,
  permissions: string[],
): AuthSessionUser {
  return {
    id: "u1",
    email: "t@example.com",
    fullName: "Test",
    role: { id: "r1", code: role as AuthSessionUser["role"]["code"], name: role },
    firm: { id: "f1", name: "Firm", slug: "firm" },
    permissions,
    lastLoginAt: null,
  } as AuthSessionUser;
}

const associate = fakeUser("junior_associate", ["clients.view", "matters.view"]);
assert.equal(canViewAllClients(associate), false);
assert.equal(canViewAllClientAccounts(associate), false);

const withViewAll = fakeUser("senior_associate", [
  "clients.view",
  "clients.view_all",
]);
assert.equal(canViewAllClients(withViewAll), true);
assert.equal(canViewAllClientAccounts(withViewAll), false);

const bookkeeper = fakeUser("accounts", [
  "clients.view",
  "clients.view_all",
  "finance.view_all_client_accounts",
]);
assert.equal(canViewAllClients(bookkeeper), true);
assert.equal(canViewAllClientAccounts(bookkeeper), true);

const mp = fakeUser("managing_partner", ["clients.view"]);
assert.equal(canViewAllClients(mp), true);
assert.equal(canViewAllClientAccounts(mp), true);
assert.equal(canViewAllMatters(associate), false);

console.log("client visibility checks passed");
