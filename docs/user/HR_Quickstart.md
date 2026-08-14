# HR quickstart (Phase 6)

LexZim HR covers **staff records**, **contracts**, and **leave**. Payroll calculations are **not** included in Phase 6 (coming in Phase 6B).

## HR vs User access

| Area | Path | Purpose |
|------|------|---------|
| **HR records** | Firm → Staff records / Contracts / Leave | Employment profiles, contracts, leave (includes non-login staff) |
| **User access** | Firm → User access (`/staff`) | LexZim logins, roles, seat licences |

Link an HR staff record to a login user when someone both works at the firm and uses LexZim.

## Permissions

| Permission | Typical roles | What you can do |
|------------|---------------|-----------------|
| `hr.view` | Managing Partner, Accounts | View staff, contracts, leave; submit leave for your own HR profile if linked |
| `hr.manage` | Managing Partner, Accounts | Create/edit staff and contracts; approve or reject leave; submit leave for anyone |

Lawyers and other roles do not see firm-wide HR by default.

## Staff records (`/hr/staff`)

- Add employment profiles for lawyers, support staff, cleaners, etc.
- **Login optional**: reception or cleaning staff without a LexZim account.
- Fields: job title, department, start/end dates, contact, emergency contact, notes.
- **Annual leave entitlement**: manual days-per-year field (used for balance display only; no accrual engine).

## Contracts (`/hr/contracts`)

- One or more contracts per staff record.
- Status: draft, active, expired, terminated.
- Upload contract PDF or Word via the document column (firm-scoped storage).

## Leave (`/hr/leave`)

### Leave types

Default types are created automatically: annual, sick, unpaid, other. HR managers can add custom types via API.

### Submit a request

1. Open **Leave** → **Request leave**.
2. Choose type and dates (inclusive).
3. Add an optional note.

Staff linked to a login user can request their own leave. HR managers can request on behalf of anyone.

### Approvals

HR managers (**`hr.manage`**) approve or reject **requested** leave from the Requests tab.

### Who is away

Use the **Who is away** tab with **This week** or **This month**, or pick a custom date range. Shows **approved** leave only.

### Annual leave balance

When you filter requests by a staff member, the UI shows:

- Days **entitled** (from staff record manual field)
- Days **taken** (approved annual leave in the calendar year)
- **Remaining** (entitled minus taken)

No automatic accrual or carry-over rules in Phase 6.

## Payroll

Payslips, PAYE, NSSA, and statutory deductions are **Phase 6B**. HR data collected here (staff, contracts, leave) is intended to feed payroll later.

## Related docs

- `docs/FINANCE_HR_ADR.md` architecture overview
- `docs/FINANCE_HR_SCHEMA.md` database tables
- `docs/user/Admin_Guide.md` firm administration
