# P1-13 fixed gaps

1. Party search (`GET /api/parties`) scoped for non–`view_all` users.
2. Client party create checks matter ACL when `matterId` is set.
3. Party update cannot move a party onto an inaccessible matter.
4. Client matter counts respect assignment.
5. Client party list hides inaccessible matter-linked parties.
6. Added `npm run smoke:phase1-rbac` for junior scoping + cross-firm IDOR.
7. Expanded `docs/RBAC.md` for Phase 1 routes, audits, and scoping rules.
