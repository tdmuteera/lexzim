# Month-end trust reconciliation SOP

Short procedure for Accounts staff and the Managing Partner. Applies to **Finance → Reconciliations** in LexZim.

## Policy

- **Variance formula:** statement balance minus LexZim book balance (A − B).
- **Complete with variance ≠ 0:** blocked by default. Only the **Managing Partner** may complete with a mandatory **override reason** (audited).
- **Vault** reconciliation is separate from **trust bank** three-way. Bank vault transfers change location of client money, not ownership.

## Trust bank three-way (monthly)

### 1. Gather figures

| View | Source |
|------|--------|
| **A · Bank statement** | Closing balance on the master trust **bank** statement for the period (manual entry; no bank feed). |
| **B · Book balance** | LexZim book balance on the selected bank trust account (ledger postings). |
| **C · Client ledgers** | Spot-check: Finance → Trust → Client statement (or Overview client balances). Sum of client portions on the bank account should match B when all money is client-tagged. |

### 2. Enter in LexZim

1. Open **Finance → Reconciliations → Trust bank**.
2. Select **period** and **bank trust account**.
3. Review **B** (book) and **C** (client ledger sum). Investigate if client sum ≠ book.
4. Enter **A** (statement balance from the bank).
5. Review **variance** (A − B).
6. Add **notes** (e.g. timing items, items to clear).

### 3. Sign-off

1. **Save draft** while investigating.
2. When satisfied and variance is **zero**, click **Mark completed**.
3. If variance is **not zero** and must be signed off anyway, the **Managing Partner** enters an **override reason** and completes (audited).

## Vault reconciliation (related step)

Use when client trust cash is held in the physical vault before banking.

1. Open **Finance → Reconciliations → Vault** (or **Trust → Vault** for counts).
2. **A** = physical count (or latest vault count worksheet).
3. **B** = LexZim vault system balance.
4. Complete when variance is zero, or MP override with reason.

Bank vault cash using **Trust → Vault → Bank vault** before month-end if policy requires all client money in the bank account.

## What this does not replace

- Law Society trust rules and professional judgement
- External accountant sign-off where required
- Business operating bank reconciliation (Finance → Expenses & cashbook, P6-09)

## Permissions

| Action | Permission |
|--------|------------|
| View and run reconciliations | `finance.reconcile` |
| Complete with non-zero variance | Managing Partner role |
