# Finance depth: Payments, client accounts, requisitions, commission

Phase 11 additions to the Finance desk. Trust and fee money stay separate. This guide is for Accounts, Managing Partners, and bookkeepers.

Also read `Finance_Desk_Quickstart.md` (daily desk) and `Billing_Trust_Quickstart.md` (fees vs trust).

## Client visibility

By default, staff see only **clients and matters they are assigned to**.

| Permission | Effect |
|------------|--------|
| `clients.view` | Assigned clients only |
| `clients.view_all` | All firm clients (list and profiles) |
| `finance.view` | Finance desk; Client accounts still limited to assigned clients unless… |
| `finance.view_all_client_accounts` | Open every client’s finance account (bookkeeper path) |

Managing Partners typically see everything. Grant `clients.view_all` or `finance.view_all_client_accounts` when a senior partner or accounts clerk needs firm-wide lists without changing their other ticks.

## Payments (money in + split)

Path: **Finance → Payments** (`/finance/payments`).

Use this when cash or a bank credit arrives and you need to **split** it in one receipt:

1. Choose destination: trust bank, trust vault, fee bank (banked fees), or fee vault (cash fees on hand).
2. Enter the total amount, client, and matter when required.
3. Add allocation lines that sum to the total (trust hold, fee revenue categories, disbursement float).
4. Save. LexZim issues **one** cash receipt number for that bank or vault event.

**Trust first (default):** full amount posts as a trust receipt; fee lines leave trust and become fee revenue or retainer apply. Trust hold and disbursement float stay as client money.

**Fees-only:** destination fee bank or fee vault. No trust ledger movement.
- Fee bank = fees already going into (or treated as) the firm operating bank (GL 1010).
- Fee vault = firm fee cash still in the office safe / drawer (GL 1020 Business Vault). Never client trust.

The same cash is **not** posted twice. Trust desk and Invoicing remain the ledgers of record; Payments orchestrates them.

Permissions: `finance.payments.view`, `finance.payments.create`.

## Client accounts

Path: **Finance → Client accounts** (`/finance/client-accounts`).

Bookkeeper view per client:

- Trust balance and recent trust movements
- Fees billed, paid, outstanding
- Unbilled disbursements
- Payment intakes
- Recoverable requisitions (firm float used for client costs)

Open a row for detail. Links go to Trust and Payments. Visibility follows the rules above.

## Requisitions

Path: **Finance → Requisitions** (`/finance/requisitions`).

| Type | Use for | When paid |
|------|---------|-----------|
| **Business** | Firm operating costs (stationery, rent share, etc.) | Posts to **Expenses** (operating funds only) |
| **Disbursement** | Client/matter costs (filing, courier) | Posts on the **matter Costs** tab; debit trust if paid from trust |

Flow: draft → submit → approve → pay. Approvers are notified in-app and by staff email when SMTP works.

**Paid from:** operating (business), client trust, or firm float. Firm float on a shortfall can mark the item **recoverable** until the client tops up trust (policy may block float pay if shortfall blocking is on).

Permissions: `finance.requisitions.view`, `request`, `approve`, `pay` as granted.

## Commission

Path: **Finance → Commission** (`/finance/commission`).

Configurable monthly **fee collection target** and **percent of collected fees above that target**. Example: target 3000, 25%, lawyer collected 4000 → commission due 250.

- Basis: fee receipts (`fee_payments`) in the calendar month, attributed to the matter’s responsible lawyer (same idea as Lawyer Performance).
- Trust deposits and disbursements do **not** count.
- This is **not payroll**. It does not post salary or PAYE.

Configure: `finance.commission.configure`. View: `finance.commission.view`. Lawyer Performance overlays commission columns when From and To are the same calendar month.

## Staff email on tasks and approvals

Set a **communication email** on Account profile (login email is the fallback). System admins can assign up to **three** notification addresses per person (business + personal + backup) under Settings → Staff notification emails or Staff edit. All listed addresses receive the same staff notice via firm SMTP.

Assigning a firm task or requesting approval sends an in-app notification and attempts firm SMTP email. Client documents stay **manual send only**. If SMTP fails (for example Railway Hobby blocking outbound mail), the task or approval still saves; Settings → Email may show the last staff-notify error.

## Known limits (Phase 11)

- No bank feeds or payment gateways
- Commission is not payroll; full PAYE/NSSA remains Phase 6B
- Outbound SMTP may fail on Railway Hobby/Trial; upgrade or use a supported relay (`Email_Setup.md`)
- Partner browser checklist: `docs/PHASE11_MANUAL_TEST.md`

## Related

- `Finance_Desk_Quickstart.md`
- `Billing_Trust_Quickstart.md`
- `Email_Setup.md`
- `Clients_KYC_Guide.md` (visibility)
- `docs/PHASE11_ADR.md` (architecture)
