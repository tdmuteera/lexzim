# Finance trust quickstart

Client money held in trust is separate from firm fee revenue. LexZim enforces that separation in data and in the UI.

| | Invoicing (fees) | Trust |
|--|------------------|-------|
| Purpose | Fee notes, time, disbursements, fee receipts | Client money held for clients |
| Finance menu | **Finance → Invoicing** | **Finance → Trust** |
| Example | Fee note for professional fees | Client deposit into trust bank |

Recording a **fee payment** on a fee note does **not** post to trust. Posting a **trust receipt** does **not** mark a fee note paid.

## Trust overview (firm-wide)

Open **Finance → Trust → Overview**.

You will see:

- **Master trust bank** balance (from ledger postings on bank trust accounts)
- **Sum of client balances** by currency (total client trust liability)
- A **client balances** table with quick links to ledger and statement

The sum of client balances should reconcile with trust account balances when all client money is correctly tagged. Three-way reconciliation (bank, firm ledger, client statements) is completed under **Finance → Reconciliations**. See `docs/user/Finance_Trust_Recon_SOP.md`.

## Trust vault (cash)

Open **Finance → Trust → Vault (cash)**.

1. **Receive cash**: client-tagged receipt into the vault trust account (not firm petty cash).
2. **Vault balance** = sum of ledger postings on the vault account (client portions shown in the table).
3. **Bank vault**: moves client-tagged cash from vault to master trust bank. Client ledger totals stay correct; only the location of funds changes.
4. **Vault count**: record physical count vs system balance. Variance is stored and audited.

Vault cash is still **client trust money**. Do not mix with firm operating cash (see Expenses & cashbook in Phase 6).

## Per-client ledger and running balance

1. Open **Overview** and click **Ledger** on a client, or use **Ledger** tab and filter by client.
2. Entries show in chronological order with a **running balance** column.
3. Entry types: receipt, disbursement, transfer, adjustment (same as before).

## Posting trust entries

**Post entry** (requires `trust.manage`):

- **Receipt**: client money received into trust (credit to client balance).
- **Disbursement**: pay from trust on behalf of the client (debit).
- **Transfer**: move tagged client money between trust accounts (e.g. vault to bank in later phases).
- **Adjustment**: controlled correction (credit or debit).

By default, LexZim **rejects** any entry that would put the **client** trust balance below zero on the affected account. An audited override checkbox exists for permitted roles.

**Never** use trust posting to record fee invoice payments. Use **Finance → Invoicing** for fee receipts.

## Client statement (print and CSV)

1. Open **Client statement** tab (or **Statement** from Overview).
2. Select the client and load the statement.
3. **Print** for browser PDF, or **Export CSV** for spreadsheets.

The statement includes continuous running balance and excludes fee invoices and fee payments.

## Trust accounts

The **Accounts** tab lists trust bank and vault accounts with book references and balances from postings.

Negative client balances are blocked by default. Override is permissioned and audited.

## Who can do what

| Permission | Typical access |
|------------|----------------|
| `trust.view` | Overview, ledger, statements |
| `trust.manage` | Post entries, create accounts |

## Related

- Fee invoicing: `docs/user/Billing_Trust_Quickstart.md` (fees section)
- Full finance desk: `docs/FINANCE_HR_ADR.md`
