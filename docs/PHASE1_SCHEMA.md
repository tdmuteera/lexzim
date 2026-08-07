# Phase 1 MVP schema (P1-01)

Matter-centric, multi-tenant. Every table includes `firm_id` (except Phase 0 globals).

## Tables

| Table | Purpose |
|---|---|
| `clients` | Individual/company client registry |
| `matters` | Case/matter files linked to clients |
| `matter_team` | Users assigned to a matter |
| `related_parties` | Opposing parties, witnesses, etc. |
| `pending_procedures` | Tasks/deadlines per matter |
| `matter_events` | Timeline notes/events |
| `templates` | Document templates per firm |
| `template_versions` | Version history for templates |
| `documents` | Uploaded/generated files (Supabase Storage paths) |

## Key enums (app-level)

| Field | Values |
|---|---|
| `clients.client_type` | `individual`, `company` |
| `matters.status` | `prospective`, `open`, `on_hold`, `closed`, `archived` |
| `matters.conflict_check_status` | `pending`, `clear`, `flagged`, `not_done` |
| `pending_procedures.status` | `todo`, `done`, `cancelled` |
| `documents.doc_type` | `uploaded`, `generated_template`, `other` |

## Areas of law (locked for Phase 1)

Civil, Criminal, Family, Labour, Property/Conveyancing, Corporate/Commercial, IP, Constitutional/Administrative, Estates & Trusts, Immigration.

## Indexes (high value)

- `matters(firm_id, status)`
- `pending_procedures(firm_id, due_at)`
- `documents(firm_id, matter_id)`
- `clients(firm_id, archived_at)`

## Storage path convention

```text
firms/{firm_id}/documents/...
firms/{firm_id}/templates/...
```

## Permissions (from Phase 0, used in Phase 1 modules)

| Module | Permissions |
|---|---|
| Clients | `clients.view`, `clients.create`, `clients.edit`, `clients.delete` |
| Matters | `matters.view`, `matters.create`, `matters.edit`, `matters.delete`, `matters.view_all` |
| Documents | `documents.view`, `documents.manage` |
| Templates | `templates.view`, `templates.manage` |
| Dashboard | `dashboard.view` |

## Repository stubs

| Path | Role |
|---|---|
| `lib/repos/clients.ts` | List/get clients |
| `lib/repos/matters.ts` | List/get matters |
| `lib/repos/documents.ts` | Matter documents |
| `lib/repos/templates.ts` | Templates + versions |
| `lib/repos/matter-workflow.ts` | Events, procedures, related parties |

## Scripts

```bash
npm run db:generate
npm run db:migrate
```

## Next

**P1-02:** Clients module (done) — see `docs/CLIENTS.md`.  
**P1-03:** Matters module (done) — see `docs/MATTERS.md`.  
**P1-04:** Pending procedures (done) — see `docs/PROCEDURES.md`.  
**P1-05:** Matter timeline + notes (done) — see `docs/TIMELINE.md`.  
**P1-06:** Related parties (done) — see `docs/PARTIES.md`.  
**P1-07:** Matter documents (done) — see `docs/FILES.md`.  
**P1-08:** Template library (done) — see `docs/TEMPLATES.md`.  
**P1-09:** Merge engine (done) — see `docs/TEMPLATES.md`.  
**P1-10:** Dashboard (done) — see `docs/DASHBOARD.md`.  
**P1-11:** Global search + UX polish (done) — see `docs/SEARCH.md`.  
**P1-12:** Export / backup (done) — see `docs/BACKUP.md`.  
**P1-13:** RBAC hardening + audit (done) — see `docs/RBAC.md`.  
**P1-14:** Demo seeds, smoke, Phase 2 handoff (done).  

**PHASE 1 COMPLETE — ready for Phase 2 prompts (AI Legal Assistant: RAG, firm memory, drafting help)**
