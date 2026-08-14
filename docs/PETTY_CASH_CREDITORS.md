# Petty cash and creditors (P7-07)

Firm operating money only. Never client trust.

## Petty cash

**Finance → Petty cash**

- Open a float (opening balance).
- Movements: `vault_to_petty`, `petty_spend`, `petty_return`.
- Current balance shown on desk; GL posts via `postPettyCashMovementGl()`.

| Movement | GL effect |
|----------|-----------|
| Vault to petty | Dr 1050 Petty cash, Cr 1010 Operating bank |
| Petty spend | Dr expense (6xxx), Cr 1050 |
| Return to vault | Dr 1010, Cr 1050 |

Export: `petty_cash_summary` (PDF, Word, Excel).

## Creditors (AP)

**Finance → Creditors**

- Creditors master (name, contact, default expense account).
- Record supplier bill → Dr expense 6xxx, Cr AP **2010**.
- Record payment → Dr AP **2010**, Cr Cash **1010**.
- Ageing report by due date.

Export: `creditor_ageing` (PDF, Word, Excel).

## Firm expenses (GL tree)

Flat legacy categories replaced with COA leaf accounts (6000 to 9000). Expense form selects GL category; optional budget month (`YYYY-MM`).

Payment source:

| Source | GL credit |
|--------|-----------|
| `cash` | 1010 Operating bank |
| `petty` | 1050 Petty cash |
| `ap` | No cash GL (bill posted separately) |

## Matter disbursements

Billable disbursements post to **1320 Client cost advances** on record:

- Paid from operating → Cr 1010
- Paid from trust → Cr 1210

Recovery on invoice posts to **4100 Reimbursed costs** (P7-06 invoice GL).

**Next:** P7-08.
