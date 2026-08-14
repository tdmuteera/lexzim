# Navigation RBAC (P0-10, Phase 6 P6-03)

Sidebar and routes are gated by permissions from `lib/nav.ts` and `lib/module-nav.ts`.

## Route permissions

### Overview & practice

| Route | Permission | Nav label |
|---|---|---|
| `/dashboard` | `dashboard.view` | Dashboard |
| `/clients` | `clients.view` | Clients |
| `/matters` | `matters.view` | Matters |
| `/documents` | `documents.view` | Documents |
| `/calendar` | `calendar.view` | Calendar |
| `/reminders` | `calendar.view` | Reminders |

### Finance desk (Phase 6)

| Route | Permission | Nav label |
|---|---|---|
| `/finance/invoicing` | `billing.view` | Invoicing |
| `/finance/debtors` | `billing.view` | Debtors |
| `/finance/trust` | `trust.view` | Trust |
| `/finance/reconciliations` | `finance.reconcile` | Reconciliations |
| `/finance/expenses` | `finance.view` | Expenses & cashbook |
| `/finance/reports` | `finance.view` | Finance reports |

**Legacy aliases (bookmarks preserved, same permissions):**

| Route | Permission | Maps to |
|---|---|---|
| `/billing` (+ `/billing/invoices/*`) | `billing.view` | Finance → Invoicing |
| `/trust` | `trust.view` | Finance → Trust |

Finance sub-routes also show a horizontal tab bar (`FinanceModuleNav`) when inside the Finance desk.

### HR (Phase 6 stub)

| Route | Permission | Nav label |
|---|---|---|
| `/hr/staff` | `hr.view` | Staff records |
| `/hr/contracts` | `hr.view` | Contracts |
| `/hr/leave` | `hr.view` | Leave |

HR is separate from **User access** (`/staff`, `users.manage`), which manages logins and RBAC.

### People & insight

| Route | Permission | Nav label |
|---|---|---|
| `/staff` | `users.manage` | User access |
| `/reports` | `reports.view` | Reports |
| `/reports/lawyer-performance` | `reports.view` | Lawyer performance |
| `/ai` | `ai.use` | AI Assistant |

### System

| Route | Permission | Nav label |
|---|---|---|
| `/audit` | `audit.view` | Audit Log |
| `/settings` | `settings.manage` | Settings |
| `/help` | (none) | Help |

Forbidden deep links show **Access denied** (`components/shell/AccessDenied.tsx`).

## Phase 6 permission codes

| Code | Purpose |
|---|---|
| `finance.view` | Debtors workspace, expenses, cashbook, finance reports (read) |
| `finance.post` | Post expenses and business cashbook entries |
| `finance.reconcile` | Reconciliation workflows |
| `finance.close_month` | Month-end period lock |
| `billing.view` / `billing.manage` | Invoicing (fees); retained from Phase 3 |
| `trust.view` / `trust.manage` | Trust client money; retained from Phase 3 |
| `hr.view` | HR directory, contracts, leave |
| `hr.manage` | HR administration and leave approval |

Seed or refresh permissions after matrix changes:

```bash
npx tsx scripts/seed-rbac.ts
```

## What each role sees (sidebar)

Based on `lib/rbac/matrix.ts`:

| Module | MP | Senior | Junior | Secretary | Accounts |
|---|---|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Clients | ✓ | ✓ | ✓ | ✓ | ✓ |
| Matters | ✓ | ✓ | ✓ | ✓ | ✓ |
| Documents | ✓ | ✓ | ✓ | ✓ | |
| Calendar / Reminders | ✓ | ✓ | ✓ | ✓ | |
| Finance → Invoicing | ✓ | ✓ | | | ✓ |
| Finance → Debtors | ✓ | ✓ | | | ✓ |
| Finance → Trust | ✓ | ✓ | | | ✓ |
| Finance → Reconciliations | ✓ | | | | ✓ |
| Finance → Expenses | ✓ | | | | ✓ |
| Finance → Finance reports | ✓ | | | | ✓ |
| HR (all tabs) | ✓ | | | | ✓ (view) |
| User access | ✓ | | | | |
| Reports | ✓ | ✓ | | | ✓ |
| AI Assistant | ✓ | ✓ | ✓ | ✓ | ✓ |
| Audit Log | ✓ | ✓ | | | |
| Settings | ✓ | | | | |

Managing Partner receives every permission via `allCodes` in the matrix.

## Implementation

| Layer | Mechanism |
|---|---|
| Sidebar | `filterNavSections(can)` in `AppSidebar` |
| Finance / HR tabs | `filterModuleTabs(can)` in `FinanceModuleNav` / `HrModuleNav` |
| Route permissions | `getRoutePermission()` → `ROUTE_PERMISSION_RULES` then nav items |
| Server pages | `ProtectedModulePage` + `getRouteAccessStatus` |
| Client nav | `RouteGuard` in `AppShell` |

## Manual test (Managing Partner)

1. Sign in as MP → Finance section shows six items; HR shows three tabs.
2. Open `/finance/invoicing` → existing billing list loads with Finance tabs.
3. Open `/billing` → same invoicing view (alias); Invoicing tab stays active.
4. Open `/finance/reconciliations` → trust bank / vault reconciliation workspace.
5. Open `/finance/reconciliations` → placeholder loads.

## Manual test per role (after RBAC seed)

1. Run `npx tsx scripts/seed-rbac.ts` if permissions were added.
2. Log in as **Accounts** → Finance (all six) + HR (view) visible; no User access.
3. Log in as **Senior Associate** → Invoicing, Debtors, Trust only; no Reconciliations or Expenses.
4. Try forbidden URL (e.g. Secretary → `/finance/reconciliations`) → Access denied.
