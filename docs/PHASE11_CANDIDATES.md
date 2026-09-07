# Phase 11 candidates

Short list of **older brainstorm ideas**. Phase 11 **committed scope** is the finance-depth package in `docs/PHASE11_ADR.md` and `PHASE 11 - Finance Depth and Access Prompts.md` (Payments split, client visibility, requisitions, staff email notify, commission).

Ideas below are **not** automatically in Phase 11 unless partners re-open them.

## Strong candidates (backlog)

1. **Deeper statutory payroll (complete 6B)**  
   PAYE, NSSA, payslips, and filings beyond the Phase 10 payroll MVP and advance recovery.

2. **Inbound email / matter filing from mailbox**  
   Capture inbound mail and file to a matter (or client) with audit. Outbound stays manual Send.

3. **Client portal parity with more desk workflows**  
   Wider portal views for invoices, documents, and matter status where the firm opts in.

4. **Advanced conflict / AML screening**  
   Richer screening against parties, related entities, and watchlists on top of Phase 10 Clear / Potential / Blocked.

5. **Birthday / newsletter manual batch send**  
   Compose a batch, review recipients, then Send. Still **never** a silent cron unless a partner later insists.

## Other sensible follow-ups

- Firm-configurable contested / pro forma invoice footer text (optional setting)
- Bank feeds or payment gateways (still out of core LPMS unless partners demand)
- Stronger AI research corpus / citation DB (still no zero-hallucination promise)
- Mobile push notifications (browser-only reminders today)
- Named custom roles beyond per-person ticks (rejected for v1; revisit only if needed)
- Calendar / deadline reminder emails (deferred from Phase 11 email slice)

## Explicitly not assumed

- Hard-delete of live financial history for ordinary firm users (platform purge only)
- Silent scheduled client email campaigns
- Replacing Phase 8 diagnostics

See also: `docs/ROADMAP_STATUS.md`, `docs/PHASE11_ADR.md`, `docs/PHASE10_ADR.md`, `docs/PHASE6B_PAYROLL_HANDOFF.md`.
