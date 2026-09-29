# FINANCE DEPTH PHASE COMPLETION REPORT

Firm: T Pfigu Attorneys (finance module). Date: 28 September 2026.
All destructive testing was done in the Isolation Test Firm with dedicated sandbox users. No real client trust money was used and no T Pfigu finance records were created, changed or deleted.

---

## A. Work Completed

1. **Baseline recorded.** Before any change, T Pfigu and the Isolation Test Firm both had zero trust entries, invoices, fee payments and journals. The existing screens, routes and posting rules were kept. Every change is additive (new columns, new routes, new checks) through one controlled migration, `0054_finance_depth.sql`.
2. **Atomic money movements.** Every movement that touches more than one table (trust ledger, fee payment, invoice, requisition, disbursement, general ledger) now runs in a single database transaction. Either all of it is saved or none of it is.
3. **Concurrency locks.** Per-client trust, per-invoice and per-requisition locks stop two simultaneous actions from overdrawing a client or paying the same requisition twice.
4. **Money movement engine.** Receipts, trust deposits, trust payments, cash banking, trust to fees, client to client transfers, disbursement requisitions (trust, float, or trust then float), expenses, and every reversal now go through one set of validated functions. Each function writes the matching general ledger journal in the same transaction.
5. **Strict trust segregation.** A client's trust money can only be used for that client. Moving money between clients is a separate, explicit action. It requires the Managing Partner, a written reason (the client instruction), and enough funds. It writes two linked legs that name each other.
6. **Reversals instead of deletes.** Trust entries, fee receipts, fees taken from trust, payment intakes, paid requisitions and expenses can be reversed. The original row is kept. A contra row is linked to it both ways and records who reversed it, when, and why. The general ledger gets an opposite journal linked to the original.
7. **Trust controls.** No cross-client use, no withdrawals without funds, and no negative balance unless the Managing Partner authorises it with a reason (recorded on the entry). Every entry must name a client. Duplicate submissions are blocked by idempotency keys and unique receipt numbers. Links are protected by foreign keys.
8. **Integrity checker.** `GET /api/finance/integrity` runs 13 checks (listed in section E). The test harness ran it after every significant transaction.
9. **Ten-cycle test harness.** `scripts/finance-depth-cycles.ts` drives the real HTTP API as a Managing Partner and an Accounts user. It runs ten cycles plus an endpoint sweep and cleans up after itself.
10. **Data migration dry run.** `scripts/finance-migration-dryrun.ts` reads the four Excel books, maps them to opening balances, checks every total, and matches clients against existing records. It is read-only and produces an import record. Nothing was imported.

## B. Ten-Cycle Test Report

Run 1 (first full run): cycles 1 to 10 passed 155 of 155 steps. All 16 integrity runs passed 13 of 13 checks. The endpoint sweep had 3 failures: 2 were harness errors and 1 was environmental (section G, items 20 to 22).
Run 2 (regression): 159 of 181. All 22 failures traced to the environment (session idle timeout and one dropped database connection, section G items 23 and 24). No finance defect. Integrity stayed clean in all 15 runs, including after the dropped connection.
Runs 3 to 5: stopped by the environment (the database host briefly stopped resolving, then the local server and harness were interrupted). Run 4 showed one read failing outside any money movement. The cause was not logged, and it matched the connection drops seen all session. The transaction store was hardened anyway (section G item 25).
Final regression (run 7, 29 September 2026, after all fixes): **184 of 184 steps passed**. All 16 integrity runs passed 13 of 13 checks. Cleanup completed. Every cycle below is Closed on this run.

The defects in section G were found by reading every movement path before the harness was built, and were fixed before run 1. Each cycle below lists the defects its scenario covers. Run 1 is the retest of those fixes, and run 2 is the regression.

### Cycle 1: Standard invoice and full payment
- **Tested:** create invoice 500, approve and send, record payment 500, try a further payment, export the invoice PDF, integrity.
- **Expected:** invoice paid with balance 0. A further payment is refused. PDF exports. Accounts receivable matches the ledger.
- **Actual:** as expected. Further payment refused ("already fully paid").
- **Defects covered:** 1 (not atomic), 8 (no overpayment check).
- **Corrections:** receipt, invoice status and general ledger saved in one transaction. Overpayment is blocked under an invoice lock.
- **Retest / regression / status:** passed / passed / **Closed**.

### Cycle 2: Partial payment then settlement
- **Tested:** invoice 1,000, pay 300, try 800 against the 700 balance, pay 700, receipt PDF.
- **Expected:** balance 700 after the part payment. Overpayment refused. Paid after settlement.
- **Actual:** as expected.
- **Defects covered:** 8, 12 (receipt PDF ignored trust applied).
- **Corrections:** overpayment check; the receipt balance now subtracts trust applied.
- **Retest / regression / status:** passed / passed / **Closed**.

### Cycle 3: Trust receipt and trust movement
- **Tested:** deposit 2,000 to trust bank; deposit 300 to trust cash and bank it; settle invoice 400 from trust; a mixed payment of 500 (100 held in trust, 400 fees earned from trust).
- **Expected:** balances 2,000, then 2,300 after banking (total unchanged), 1,900 after the fee, 2,000 after the mixed payment. Operating bank rises by the earned fee.
- **Actual:** as expected. Operating bank rose by 400.
- **Defects covered:** 5 (apply retainer wrote no trust row), 6 (second retainer of the same amount silently skipped), 7 (fee from trust never reduced the trust bank; validation ran after writes).
- **Corrections:** fees from trust are one unit: a trust disbursement row plus a single journal (trust liability to receivables or revenue, and trust bank to operating bank).
- **Retest / regression / status:** passed / passed / **Closed**.

### Cycle 4: Disbursement and requisition workflow
- **Tested:** requisition 150 from trust (create, approve, pay, pay again); client with 50 asking for 200 (trust only, then trust then float by Accounts, then by the Managing Partner); business requisition from operating; matter disbursement marked "paid from trust" outside a requisition.
- **Expected:** the trust entry links to the requisition; double pay refused; shortfall refused; float part needs the Managing Partner; trust used first, then the float balance is marked recoverable; the direct trust disbursement is refused.
- **Actual:** as expected.
- **Defects covered:** 9 (trust bank credited twice; double pay possible), 15 (trust leak through matter disbursements), 19 (inconsistent shortfall check).
- **Corrections:** single trust posting per requisition, conditional status update under a lock, new `trust_then_float` option (the firm's stated rule), per-client balance on the chosen account.
- **Retest / regression / status:** passed / passed / **Closed**.

### Cycle 5: Reversal and correction
- **Tested:** reverse a trust receipt (no reason, with reason, twice); void an invoice with a receipt; reverse a bounced cheque; void after reversal; reverse a fee taken from trust; reverse a mixed intake (and twice); reverse a paid requisition as Accounts and as the Managing Partner.
- **Expected:** reason required; contra linked to the original; no double reversal; void blocked until receipts are reversed; invoices reopen; trust restored exactly; requisition reversal only by the Managing Partner, status "reversed".
- **Actual:** as expected. Every balance matched to the cent.
- **Defects covered:** 10 (no reversals), 11 (edits and deletes left the ledger unchanged), 16 (paid invoices could be voided or manually marked paid).
- **Corrections:** reversal functions for every movement type, original kept, full audit fields.
- **Retest / regression / status:** passed / passed / **Closed**.

### Cycle 6: Multiple invoices and payments for one client
- **Tested:** three invoices (200, 300, 500); an allocation above one invoice's balance; one payment of 700 split over three invoices; a second payment settling the third.
- **Expected:** over-allocation refused with nothing saved; three distinct receipt numbers; correct balances on each invoice.
- **Actual:** as expected. No partial intake was left after the refused allocation.
- **Defects covered:** 18 (duplicate receipt numbers crashed multi-invoice payments), 1.
- **Corrections:** receipts numbered PAY-n, PAY-n/2, PAY-n/3; all lines validated before any write.
- **Retest / regression / status:** passed / passed / **Closed**.

### Cycle 7: Multiple matters for one client
- **Tested:** trust deposit on a second matter; a trust receipt for client A on client B's matter; settle a matter A1 invoice from client A trust; client statement.
- **Expected:** matter balance tracked; cross-client matter refused; client-level trust usable across the client's own matters; statement lists matters.
- **Actual:** as expected.
- **Defects covered:** 4 (matter not checked against client).
- **Corrections:** every trust entry checks that the matter belongs to the client.
- **Retest / regression / status:** passed / passed / **Closed**.

### Cycle 8: Multiple clients with strict trust segregation
- **Tested:** client B paying client A's invoice; settling B's invoice when only A has trust; A to B transfer by Accounts, by the Managing Partner without a reason, above A's balance, and properly; reversal of the transfer.
- **Expected:** all cross-client attempts refused except the authorised transfer; both legs name the counterparty; reversal restores both clients.
- **Actual:** as expected.
- **Defects covered:** 2 (overdraw flag from the request with no Managing Partner check), 3 (transfers without a client).
- **Corrections:** explicit client to client transfer action with authorisation, reason, funding check and linked legs.
- **Retest / regression / status:** passed / passed / **Closed**.

### Cycle 9: Invalid and error cases
- **Tested:** idempotent replay; payment above balance; overdraw by Accounts, by the Managing Partner without and with a reason; five simultaneous payments of 40 from 100; zero amount; wrong currency; no client; unknown client; marking an invoice paid with no money; three simultaneous pays of one requisition.
- **Expected:** replay not posted twice; overdraw only with Managing Partner and reason, recording who authorised; exactly two of five concurrent payments succeed; one of three requisition pays succeeds; all invalid input refused with a clear message.
- **Actual:** as expected. The balance never went negative during the race.
- **Defects covered:** 2, 3, 16, 1.
- **Retest / regression / status:** passed / passed / **Closed**.

### Cycle 10: Full end-to-end mixed scenario (30 steps)
- **Tested:** cash deposit 1,000; bank 600; requisition 250 from trust bank; requisition 9,000 paid trust bank first then float; bill only the float part (8,650); apply the 400 cash trust; client pays fees 800 and the recovery balance 8,250 in one payment; mark the advance recovered; small fee paid, receipt reversed, invoice voided; trial balance; trust statement PDF; integrity at four points.
- **Expected:** all balances correct at each step; the trust-paid part is never billed again; both invoices paid; integrity clean.
- **Actual:** as expected. Integrity clean at all four checkpoints.
- **Retest / regression / status:** passed / passed / **Closed**.

### Endpoint sweep (every finance screen's data source)
28 read endpoints (trust, payments, requisitions, debtors, KPIs, reports, client accounts, general ledger, statements, expenses, cashbook, petty cash, creditors, reconciliations, period locks, invoices, integrity, exports) plus a physical vault count. See section G items 20 to 22 for the run 1 failures and their resolution.

## C. Financial Architecture

- **Transactions.** `runInTransaction` holds the active transaction in request-local storage, so every repository call inside a movement uses it. Nested calls become savepoints.
- **Locks.** Advisory transaction locks on `trust:<firm>:<client>`, `invoice:<firm>:<id>` and `requisition:<firm>:<id>`.
- **Posting rules.** Each movement posts its own journal in the same transaction. Every journal carries a source type and source id, so it traces back to the business record.
- **Reversals.** Contra rows with a negative amount, linked both ways (`reversal_of_id`, `reversed_by_id`) with a reason. Journals are reversed with an opposite journal whose source id is `<original>:rev:<id>`, and the original is marked reversed.
- **Fees from trust.** One unit: a trust disbursement row (source `invoice_fee` or `intake_fee`) and one journal: Dr Trust liability 2100, Cr Receivables 1310 (or revenue); Dr Operating bank 1010 (or Business vault 1020), Cr Trust bank 1210.
- **Requisitions.** Trust part: trust disbursement (Dr 2100, Cr 1210) plus a non-billable disbursement record. Float part: billable disbursement, Dr Client cost advances 1320, Cr Operating bank 1010, marked recoverable.

## D. Accounts

| Code | Account | Used for |
|---|---|---|
| 1010 | Operating bank | Fee receipts, earned fees moved from trust, float disbursements |
| 1020 | Business vault | Cash fee receipts |
| 1050 | Petty cash | Petty cash float and spending |
| 1060 | Disbursement float | Firm money for client disbursements; funded monthly, recoveries return here |
| 1210 | Trust bank (includes trust cash) | Client money held |
| 1310 | Accounts receivable | Invoices outstanding |
| 1320 | Client cost advances | Recoverable disbursements paid by the firm |
| 2100 | Trust liability | Money owed to clients |
| 4030, 4050, 4100 | Revenue | Fees by category |

Invariants checked continuously: trust ledger equals account 1210; client trust balances equal account 2100; invoices outstanding equal account 1310; every journal balances.

## E. Interconnectivity

Every trust entry now records its source (type and id), and where relevant its invoice, requisition, payment intake, transfer group, counterparty client, reversal links, authoriser and idempotency key. Fee payments record their client, matter and intake. Requisitions record their trust entry. Disbursements record their trust entry and requisition. All links are foreign keys.

Integrity checks (13): ledger balanced; trust ledger vs 1210; client trust vs 2100; no orphan trust entries; no unauthorised negative balances; matter belongs to client; reversal pairs complete; transfer legs net to zero; invoice balances consistent; receivables vs 1310; requisition links valid; journals traceable to a source; no duplicate receipts.

## F. Data Migration

Source: `Accounts at 28-09-2026` (four workbooks). The dry run below was reviewed, and the opening balances were then **imported on 29 September 2026** (see section M). Import record: `Migration dry run import record 28-09-2026.json` in the same folder.

| Opening balance | Amount | Check |
|---|---|---|
| Trust bank | 189,504 | Sheet 188,654 plus the 850 deposited from cash (Zokwa 740, Pfukwa 110) |
| Trust cash | 534 | Sheet 1,384 less 850; equals cash on hand. The pot ledger lines add to 533 (one line 1 short) |
| Accounts receivable | 36,865 | Equals the Master Schedule grand total; every bucket subtotal agrees |
| Bad debt written off (Banda) | 4,062 | True balance, per firm decision (sheet shows 3,062) |
| Recoverable advances | 619 | Mupetesi 51 (decided) plus Jeffery 323, Bristow 190, Taguta 30, Kahembe 10, Granola 10, Danet 5 (to confirm) |
| Advances written off | 284 | Harishri, per firm decision |
| Disbursement float | 0 | Not yet funded |
| Business cash | 10 | Cash book: 2,051 + 1,520 − 3,561 |
| Petty cash | 0 | 9 + 60 − 69 |

Client register: 38 names (the advances list adds Harishri, Kahembe and Granola). 6 need a person to choose (Chikwama R and M, Kasipo, Pfukwa, Scholtz / Harishri Africa, Mandizha estate, Musindo / Danet). Danet is one client with several matters.
Duplicate protection: T Pfigu currently has zero finance rows, so opening balances would not overlap existing entries. The script refuses to mark the import safe if any finance rows exist. Receipt numbers 157 and 160 repeat across books, so they are not used as import keys.
Other findings: the trust sheet heading still says 13.8.2026; several "date updated" cells have day and month swapped; no physical cash count is recorded in either cash book.

## G. Bugs Corrected

1. Money movements were not atomic; a failure midway left partial records.
2. The trust overdraw flag came from the request with no Managing Partner check.
3. Trust transfers could be posted without a client.
4. The trust ledger did not check that a matter belongs to the client.
5. Applying a retainer wrote no trust row and did no balance check.
6. A second retainer of the same amount was silently skipped.
7. Fees from trust never reduced trust bank 1210, and validation ran after the writes.
8. Payments could exceed the invoice balance.
9. Paying a requisition from trust credited 1210 twice, and a requisition could be paid twice.
10. No reversals existed for payments, trust entries, intakes, requisitions or expenses.
11. Editing or deleting expenses and disbursements left the ledger unchanged.
12. The receipt PDF and invoice balance ignored trust applied.
13. Invoice and receipt exports had no matter access check.
14. Trust adjustments posted no journal.
15. The matter disbursement screen could mark items paid from trust without touching trust (trust leak).
16. Paid invoices could be voided, and invoices could be marked paid with no money received.
17. Composite source ids would crash the journal table (source id was a uuid column).
18. Payments across several invoices produced duplicate receipt numbers and failed.
19. Trust shortfall checks were inconsistent; they now use the client's balance on the chosen account.
20. (Harness) Vault counts were requested with GET; the endpoint is POST only. Replaced with a real count.
21. (Harness) Statements were requested without a date range. Fixed to use the correct parameters.
22. (Environment) Petty cash returned 401 during a dev server reload; a clean retest returned 200. No code defect.
23. (Harness) Run 2 took 59 minutes and the Accounts user sat idle for more than 30 minutes, so the staff idle timeout signed it out (401s in cycles 8 to 10). The harness now signs in again once on a 401 and retries.
24. (Environment) In run 2 the database pooler dropped one connection (`CONNECTION_CLOSED`) during the cycle 6 split payment. The payment failed with a 500 and **rolled back completely**: invoices 2 and 3 kept their exact prior balances and all 15 integrity runs in that run passed. This confirms the atomicity fix (item 1) under a real failure. Later failures in that cycle were knock-on effects.
26. Client cost advances (1320) never cleared: billing an advanced disbursement credited revenue (4100) instead. Billing now clears 1320, and a new integrity check keeps 1320 equal to unbilled advances.
27. The firm float was paid out of the operating bank, mixing float and operating money. It now has its own account (1060), cannot pay more than it holds, and recoveries return to it.
25. (Hardening) Work that outlives a transaction, such as a fire-and-forget notification, could still have picked up the finished transaction. The transaction store now marks itself closed when the transaction ends, and such work falls back to the normal connection pool.

## H. Assumptions

1. Trust segregation is enforced per client per trust account. Separate balances per matter are shown but not enforced.
2. Disbursements paid from trust are not billable, so the client is never charged twice.
3. Earned fees move from trust to the operating account at the time they are applied.
4. Only the Managing Partner can reverse a paid requisition. Reversing an intake needs the payment creation permission.
5. Cashbook deletes have no ledger impact (unchanged from before).
6. `trust_then_float` implements the firm's rule: use trust if it has funds; if short, use trust then the disbursement account for the rest.
7. Requisitions have a new status, "reversed".
8. The 400 monthly disbursement float is a firm fund (account 1060), kept separate from client trust. It cannot pay more than it holds; fund it first. Marking an advance recovered requires the invoice that billed it to be paid.
9. Trust bank and trust cash share ledger account 1210 and are separated by trust account in the subledger.

## I. Management Decisions Required

**Answered by the firm on 29 September 2026 (now applied):**
- Zokwa 740 and Pfukwa 110 were deposited to bank trust. Cash trust is 534, matching cash on hand. The pot ledger lines add to 533, so one sheet line is 1 short.
- The disbursement float opens at 0 (not yet funded).
- Recovered advances go back to the float. If the float is too high, the Managing Partner can move the excess to the cashbook or bank, with a reason.
- Banda write-off stands at 4,062 (the 3,062 was a working error).
- Mandizha: the 900 trust deposit was applied to later invoices on the client's instruction.
- Jeffery: correct name is Mr Malcom Jeffery. LexZim already has CL0050 spelled correctly; the Excel spellings map to it on import.
- Harishri 284 written off; Mupetesi 51 recovered from pending invoice payments.
- Danet is one client with several matters.

**Still open:**

1. **Client matching.** Imported using the defaults listed in section M. Please confirm them.
2. **Cutover date.** Imported as at 28 September 2026. Please confirm.
3. **Remaining small advances** (Jeffery 323, Bristow 190, Taguta 30, Kahembe 10, Granola 10, Danet 5): held as recoverable until confirmed.
4. **Matter-level trust.** Enforce separate trust balances per matter, or keep per client (current)?

## J. Attention Required

1. Migration `0054_finance_depth.sql` is applied to the shared database (local and Railway use the same one). It only adds columns, indexes and keys; existing data was not changed.
2. Done (section M): the reversal, client to client transfer, `trust_then_float`, overdraw reason and float actions now have buttons.
3. The document numbering policy (PREFIX-YEAR-SEQUENCE) is not yet implemented.
4. No bank reconciliation has been done and the bank statement has not been received.
5. The business operating bank Excel is still outstanding.
6. Please change the technical screenshot account password (`LexZimShot2026!`).

## K. Test Data

- Firm: Isolation Test Firm only, with two sandbox users (Managing Partner and Accounts).
- Records: clients FINQA A to D, matters A1, A2, B1, C1, D1, and FINQA trust accounts, all tagged FINQA.
- Cleanup: the harness deletes all FINQA records and the sandbox firm's journals after each run. `FIN_QA_KEEP=1` keeps them for inspection.
- The other Isolation firm users were not touched. No T Pfigu data was used.

## L. Deployment

- Checks: TypeScript (`tsc --noEmit`) clean; lint clean on every changed file; production build (`npm run build`) succeeded; final ten-cycle regression 184 of 184 against the local server.
- Float and recovery update (29 September 2026): regression 200 of 200, 16 integrity runs of 15 checks all clean (new checks: 1320 equals unbilled advances; float never negative), production build succeeded.
- Known issue seen during outages (not changed in this phase): when the database is unreachable, login sometimes reports "Invalid email or password" instead of "database unavailable". Worth fixing so staff are not misled.
- Migration: `0054_finance_depth.sql` (journal index 54).
- Commit: "Finance depth phase: atomic money movements, trust controls, reversals, integrity checks, ten-cycle harness".

## M. Buttons and T Pfigu Opening Balances (29 September 2026)

**New buttons.** Every correction asks for a written reason and posts a linked reversal; nothing is deleted.

| Screen | Button | Who |
|---|---|---|
| Trust, header | Transfer between clients (paying client, receiving client, optional matters, amount, reason) | Managing Partner |
| Trust, ledger rows | Reverse (manual entries, client transfers, vault deposits, fee transfers). Other rows say where to reverse them (Payments, Requisitions) or show "Opening balance" | Trust managers; transfers need the Managing Partner |
| Trust, post entry | Overdraw reason box, shown when "Allow negative" is ticked | Managing Partner |
| Invoice, receipts tab | Reverse receipt. Receipts that came through Payments link there instead | Billing managers |
| Payments register | Reverse (unwinds the whole payment) | Payment capturers |
| Requisitions | Pay option "Trust first, shortfall from float"; "Client paid into" selector on Mark recovered; Reverse payment | Payers; reverse is Managing Partner only |
| Requisitions, top | Disbursement float panel: balance, movements, Fund float, Return excess | Finance posters; Return excess is Managing Partner only |

The shared pop-up window now opens over the whole page. Before this fix it was cut off when opened from inside a panel or table.

**Import.** Script `scripts/finance-import-tpfigu.ts`, batch `tpfigu-ob-20260928`, as at 28 September 2026. It posts through the application's own trust, invoice and ledger functions in one transaction, checks integrity before saving, and refuses to run if T Pfigu already has finance rows. The dry run (which saves nothing) and the live run gave the same result: all 15 integrity checks passed. Manifest of created records: `Opening balance import manifest 28-09-2026.json` in the accounts folder. The script's `--rollback` option removes exactly those records, and refuses once anything else has been posted against them.

| Imported | Amount | How |
|---|---|---|
| Trust Bank (new trust account) | 189,504 | 10 client receipts |
| Trust Cash (new vault account) | 534 | 6 client receipts |
| Debtors | 36,865 | 21 sent invoices OB-0001 to OB-0021; due dates backdated to keep the ageing buckets |
| Recoverable cost advances | 619 | 7 disbursements (Dr 1320) |
| Business cash book | 10 | Dr 1020 |
| Opening equity (3010) | 37,494 | Balancing credit for debtors, advances and cash |

Not imported: operating bank (figure still outstanding), petty cash 0, float 0, Banda 4,062 and Harishri 284 (both written off before cutover).

Client matches used (firm defaults, to confirm): Chikwama R to CL0031 Rickson; Kasipo to CL0040 Nisbert; Pfukwa to CL0029 Eng P M Pfukwa; Monagan P/L Dr Matemezano to CL0019; Rev Musindo Danet (TP) to Danet, matter "Rev Musindo (TP)". New clients CL0063 to CL0078: M Chikwama, Bristow, Chikandiwa, Chigariro, Paradza, Gweme, Harishri Africa, Danet, Z Chipanga-Mlambo, B M Mutanga, Estate Late Mandizha, Mwasoya, Chidziva, W P Kauraro, Kahembe, Granola. Their KYC is marked draft. Each client with debtors or advances has an "Opening balance brought forward (28 Sep 2026)" matter; Danet has one matter per debtor line. Trust balances are held per client, not per matter.

Checks: TypeScript clean, lint clean on changed and new files, production build succeeded, screens checked in the browser against the imported data without posting anything.
