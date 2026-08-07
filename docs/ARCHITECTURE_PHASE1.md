# LexZim Phase 1 architecture

Phase 1 delivers the MVP practice core on the Phase 0 multi-tenant foundations: clients, matters, procedures, timeline, parties, documents, templates, dashboard, search, and firm export.

## Scope delivered

- Matter-centric domain schema (`firm_id` on every table)
- Clients and matters CRUD with status workflow
- Pending procedures and overdue surfaces
- Matter timeline (notes + system events)
- Related parties (conflict-search prep)
- Supabase Storage uploads under `firms/{firm_id}/…`
- Template library + DOCX merge (`{{FIELD}}`)
- Live dashboard aggregates
- Global search (ILIKE, Ctrl+K)
- Firm export ZIP (Settings → Backup & Export)
- RBAC hardening (assigned matters, cross-firm IDOR checks)

Explicitly **not** delivered: AI/RAG, full billing/trust engines, calendar engines, one-click restore wizard.

## Runtime

```text
Browser (TPfigu theme)
  -> Next.js App Router (Railway)
    -> Route Handlers / Server Components
      -> requirePermission + tenantFirmId(session)
      -> Drizzle repos (firm_id + matter ACL)
      -> Supabase Postgres
      -> Supabase Storage (firm-files bucket)
```

## Domain model (matter-centric)

```text
firm
  └── clients
        └── matters
              ├── matter_team
              ├── related_parties
              ├── pending_procedures
              ├── matter_events (timeline)
              └── documents (storage paths)
  └── templates / template_versions
  └── firm_settings (e.g. last_export_at)
  └── audit_logs
```

## Folder map (Phase 1 additions)

```text
app/(platform)/
  clients, matters, documents, settings, dashboard, …
app/api/
  clients, matters, procedures, parties, documents, templates,
  search, dashboard, export, …
components/
  clients, matters, parties, templates, dashboard, settings, shell/GlobalSearch
lib/
  repos/*          # firm-scoped data access
  export/          # firm archive ZIP
  templates/       # starters + merge
  storage/         # firm-files helpers
  format/dates.ts  # Zimbabwe-friendly formatting
scripts/
  seed-phase1-demo, phase1-smoke, phase1-rbac-smoke
docs/
  CLIENTS, MATTERS, PROCEDURES, TIMELINE, PARTIES, FILES, TEMPLATES,
  DASHBOARD, SEARCH, BACKUP, RBAC, PHASE1_SMOKE_TEST, ARCHITECTURE_PHASE1
```

## Tenancy and RBAC

- Session firm id only (`tenantFirmId`); never trust client-supplied `firm_id`
- `matters.view_all`: MP / Senior / Accounts see all firm matters
- Junior / Secretary: responsible lawyer or `matter_team` only
- UI mutations gated with `<Can>`; APIs enforce the same rules
- Cross-firm UUID access returns 403/404

## Storage

```text
firms/{firm_id}/matters/{matter_id}/documents/{document_id}/{file}
firms/{firm_id}/templates/{template_id}/v{n}/{file}
```

## Export vs platform backup

- In-app export: Managing Partner ZIP of JSON + storage key list (`docs/BACKUP.md`)
- Platform: Supabase PITR/daily backups + Railway redeploys (ops, not end-user)

## Verification

- `npm run smoke:phase1`
- `npm run smoke:phase1-rbac`
- Manual checklist: `docs/PHASE1_SMOKE_TEST.md`

## Phase 2 boundary

Phase 2 starts AI Legal Assistant work (RAG, firm memory, drafting help). Phase 1 leaves `/ai` as a placeholder on purpose.
