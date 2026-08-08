# Navigation RBAC (P0-10)

Sidebar and routes are gated by permissions from `lib/nav.ts`.

## Route permissions

| Route | Permission | Nav label |
|---|---|---|
| `/dashboard` | `dashboard.view` | Dashboard |
| `/clients` | `clients.view` | Clients |
| `/matters` | `matters.view` | Matters |
| `/documents` | `documents.view` | Documents |
| `/calendar` | `calendar.view` | Calendar |
| `/intake` | `intake.view` | Intake & Conflicts |
| `/billing` | `billing.view` | Billing (fees) |
| `/trust` | `trust.view` | Trust (client money) |
| `/reminders` | `calendar.view` | Reminders |
| `/staff` | `users.manage` | Lawyers & Staff |
| `/reports` | `reports.view` | Reports |
| `/ai` | `ai.use` | AI Assistant |
| `/audit` | `audit.view` | Audit Log |
| `/settings` | `settings.manage` | Settings |

Forbidden deep links show **Access denied** (`components/shell/AccessDenied.tsx`).

## What each role sees (sidebar)

Based on `lib/rbac/matrix.ts`:

| Module | MP | Senior | Junior | Secretary | Accounts |
|---|---|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Clients | ✓ | ✓ | ✓ | ✓ | ✓ |
| Matters | ✓ | ✓ | ✓ | ✓ | ✓ |
| Documents | ✓ | ✓ | ✓ | ✓ | |
| Calendar | ✓ | ✓ | ✓ | ✓ | |
| Intake | ✓ | ✓ | ✓ | ✓ | |
| Billing (fees) | ✓ | ✓ | | | ✓ |
| Trust (client money) | ✓ | ✓ | | | ✓ |
| Lawyers & Staff | ✓ | | | | |
| Reports | ✓ | ✓ | | | ✓ |
| AI Assistant | ✓ | ✓ | ✓ | ✓ | ✓ |
| Audit Log | ✓ | ✓ | | | |
| Settings | ✓ | | | | |

Managing Partner sees all nav items.

## Implementation

| Layer | Mechanism |
|---|---|
| Sidebar | `filterNavSections(can)` in `AppSidebar` |
| Server pages | `ProtectedModulePage` + `getRouteAccessStatus` |
| Client nav | `RouteGuard` in `AppShell` |

## Manual test (Managing Partner)

1. Sign in as MP → all sidebar items visible.
2. Open `/audit` → placeholder loads.
3. Open `/staff` → placeholder loads.

## Manual test per role (after P0-11 seeds)

Log in as each seeded role and confirm sidebar matches the table above. Try a forbidden URL (e.g. Secretary → `/audit`) → Access denied.
