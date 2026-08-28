# HR quickstart

LexZim HR covers **staff records**, **contracts**, **leave ledger**, **salary advances**, and a payroll **MVP**. Full statutory PAYE/NSSA/payslips remain **Phase 6B**.

## HR vs User access

| Area | Path | Purpose |
|------|------|---------|
| **HR records** | Firm → Staff records / Contracts / Leave / Advances / Payroll | Employment profiles, leave, advances, MVP payroll |
| **User access** | Firm → User access (`/staff`) | LexZim logins, roles, seat licences |

Link an HR staff record to a login user when someone both works at the firm and uses LexZim. Next of kin lives on the employee profile.

## Permissions

| Permission | Typical roles | What you can do |
|------------|---------------|-----------------|
| `hr.view` | Managing Partner, Accounts | View staff, contracts, leave, advances, payroll periods |
| `hr.manage` | Managing Partner, Accounts | Create/edit staff and contracts; approve leave/advances; run payroll MVP |
| Leave / advance approve | MP, delegates | May also use delegated approve rights without full `hr.manage` |

Lawyers and other roles do not see firm-wide HR by default.

## Staff records (`/hr/staff`)

- Add employment profiles for lawyers, support staff, cleaners, etc.
- **Login optional**: reception or cleaning staff without a LexZim account.
- Fields: job title, department, start/end dates, contact, next of kin / emergency contact, notes.
- Lawyer eligibility controls who appears in matter assignment pickers.

## Contracts (`/hr/contracts`)

- One or more contracts per staff record.
- Status: draft, active, expired, terminated.
- Upload contract PDF or Word via the document column (firm-scoped storage).

## Leave (`/hr/leave`)

### Leave types

Default types are created automatically: annual, sick, unpaid, other. HR managers can add custom types via API.

### Leave ledger

Entitlement, used, pending, and remaining by leave type. Managing Partner (or delegate) configures entitlements and approves requests.

### Submit a request

1. Open **Leave** → **Request leave**.
2. Choose type and dates (inclusive).
3. Add an optional note.

Staff linked to a login user can request their own leave. HR managers can request on behalf of anyone.

### Approvals

HR managers (`hr.manage`) or leave approvers approve or reject **requested** leave from the Requests tab.

### Who is away

Use the **Who is away** tab with **This week** or **This month**, or pick a custom date range. Shows **approved** leave only.

## Salary advances

Follow the firm salary advance form (amount, reason, finance proposal, management decision). Approved advances recover from payroll MVP when periods are marked paid.

## Payroll MVP

Payroll periods and lines support basic generation and **advance recovery**. This is **not** full PAYE/NSSA statutory payroll. See `docs/PHASE6B_PAYROLL_HANDOFF.md` and `docs/PHASE11_CANDIDATES.md`.

## Related docs

- `docs/FINANCE_HR_ADR.md` architecture overview
- `docs/FINANCE_HR_SCHEMA.md` database tables
- `docs/user/Admin_Guide.md` firm administration
