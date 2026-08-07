# LexZim

LexZim is a hosted multi-tenant legal practice management web SaaS for Zimbabwe firms. The TPfigu HTML demo is the default visual theme pack.

**Phase 0 status:** COMPLETE  
**Phase 1 status:** COMPLETE  
**Phase 2 status:** **COMPLETE**

**PHASE 2 COMPLETE — ready for Phase 3 prompts (Calendar, Billing & Trust, Intake & Conflicts, Reporting)**

## Stack

| Layer | Choice |
|---|---|
| App | Next.js App Router + React + TypeScript |
| Host | Railway (GitHub deploy) |
| Data/Auth/Files | Supabase (Postgres, Auth, Storage, pgvector) |
| ORM | Drizzle |
| AI (Phase 2) | Gemini Flash + embeddings, RAG, firm memory, Matter Assist, draft polish |
| State/UI | Zustand + TPfigu CSS port |

Not used: Tauri, Electron, SQLite, desktop installers.

## Multi-tenant model

- One platform, many firms (LPMS Core model)
- Every firm-scoped record is tied to `firm_id`
- Session carries firm + role + permission context
- Sidebar/routes/API access are RBAC-gated
- Junior associates see assigned matters only

Read: `docs/TENANT_ARCHITECTURE.md`, `docs/ARCHITECTURE_PHASE1.md`

## Run locally

```bash
cd lexzim
npm install
npm run db:migrate
npm run db:seed:rbac
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Dev users and Zimbabwe demo data:

```powershell
$env:DEV_SEED_ENABLED = "1"
npm run db:seed:dev-users
npm run db:seed:phase1-demo
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Production runtime |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |
| `npm run db:generate` | Generate SQL from Drizzle schema |
| `npm run db:migrate` | Apply migrations to Supabase |
| `npm run db:seed:rbac` | Seed roles/permissions/matrix |
| `npm run db:seed:dev-users` | Dev seed users (`DEV_SEED_ENABLED=1`) |
| `npm run db:seed:phase1-demo` | Zimbabwe demo clients/matters (`DEV_SEED_ENABLED=1`) |
| `npm run db:seed:demo-firm` | Demo tenant row (`DEMO_SEED_ENABLED=1`) |
| `npm run smoke:phase0` | Phase 0 smoke |
| `npm run smoke:phase1` | Phase 1 MVP smoke |
| `npm run smoke:phase1-rbac` | Junior scoping + cross-firm IDOR |
| `npm run smoke:phase2` | Phase 2 AI smoke |

## Key docs

- Phase 1 architecture: `docs/ARCHITECTURE_PHASE1.md`
- Phase 1 smoke: `docs/PHASE1_SMOKE_TEST.md`
- Phase 2 AI: `docs/AI.md`
- Phase 2 smoke: `docs/PHASE2_SMOKE_TEST.md`
- Phase 3 readiness: `docs/PHASE3_READY_CHECKLIST.md`
- Knowledge base: `docs/KNOWLEDGE_BASE.md`
- Firm memory: `docs/FIRM_MEMORY.md`
- Hosting and env: `docs/HOSTING.md`
- RBAC: `docs/RBAC.md`
- Backup/export: `docs/BACKUP.md`
- Dev seeds: `docs/DEV_SEEDS.md`

## Phase 2 delivers

- Zimbabwe RAG legal research (grounded + not-found)
- Firm memory embeddings + Matter Assist
- Draft-from-template with optional AI polish
- Honest AI connectivity / error UX
- Optional allowlisted web lookup (UNVERIFIED, default off)

## Out of scope (Phase 3+)

- Full billing/trust engines
- Calendar engines
- Intake / conflicts workflows
- Management reporting packs
- Subscription billing UI

## Deployment status

- Local: verified
- Railway production URL: **TBD** (set and record in `docs/HOSTING.md` once deployed). Health check: `GET /api/health`.

## Next

Proceed with `PHASE 3 - Practice Ops Prompts.md`. Do not implement Phase 3 features until those prompts are followed in order.
