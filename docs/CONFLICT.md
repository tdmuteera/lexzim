# Conflict checks (P10-13)

Formal conflict workflow on clients. Not a lonely checkbox.

## Flow

1. Search clients, matters, and related/opposing parties (`GET /api/conflict/search?q=`).
2. Record **Clear**, **Potential**, or **Blocked** with notes and checked-by/date (`POST /api/clients/[id]/conflict-checks`).
3. History lists on the client overview (`ConflictCheckPanel`). After KYC create, redirect includes `?conflict=1` to highlight the step.

Legacy result values `conflict` and `possible` map to `blocked` and `potential` on read.

## Gate open matter

Firm setting `require_clear_conflict` defaults **ON** (same pattern as invoice approval: off only when stored `"false"`). Toggle in Settings → Firm profile.

When ON, setting matter status to **Open** (create or status change) requires the client’s latest conflict check result to be **Clear**. Prospective / draft / on_hold may proceed without Clear.

Clear AuthError message if blocked.

## Related P10-13

- **Debtor communications:** timeline on Finance → Debtors (expand client) and Client → Billing. Channel phone/email/in_person; outcome; next follow-up. Audit `debtor.communication.create`.
- **Knowledge reports:** `/knowledge/reports` uploads (separate from AI `knowledge_sources`). Permissions `knowledge.reports.view` / `knowledge.reports.manage`. Audit `knowledge.report.upload` / `.download`.

See `docs/PHASE10_ADR.md`.
