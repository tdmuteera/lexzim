# LexZim

LexZim is a hosted multi-tenant legal practice management web SaaS for Zimbabwe firms. The TPfigu HTML demo is the default visual theme pack.

**Phase 0 status:** COMPLETE  
**Phase 1 status:** COMPLETE  
**Phase 2 status:** COMPLETE  
**Phase 3 status:** COMPLETE  
**Phase 4 status:** COMPLETE (Sell & Ship)  
**Phase 5 status:** COMPLETE (Portal & Scale)

**App version:** `0.5.0` (see `CHANGELOG.md`, Settings → About)  
**Roadmap:** `docs/ROADMAP_STATUS.md` (web phases 0 to 5 complete)

## Stack

| Layer | Choice |
|---|---|
| App | Next.js App Router + React + TypeScript |
| Host | Railway (GitHub deploy) |
| Data/Auth/Files | Supabase (Postgres, Auth, Storage, pgvector) |
| ORM | Drizzle |
| AI | Gemini / Claude / OpenAI (BYO or managed), RAG, firm memory, Matter Assist |
| Practice ops | Calendar, deadlines, time/billing, trust, intake/conflicts, reports |
| Sell & Ship | Licences, editions/seats, onboarding, Help, sales/ops docs |
| Portal & Scale | Limited client portal, privacy tooling, ops/admin, embeddings jobs |
| State/UI | Zustand + TPfigu CSS port |

Not used: Tauri, Electron, SQLite, desktop installers.

## Multi-tenant model

- One platform, many firms (LPMS Core model)
- Every firm-scoped record is tied to `firm_id`
- Session carries firm + role + permission context
- Sidebar/routes/API access are RBAC-gated
- Junior associates see assigned matters only
- Licence expiry never blocks firm export

Read: `docs/TENANT_ARCHITECTURE.md`, `docs/ARCHITECTURE_PHASE3.md`, `docs/ARCHITECTURE_PHASE4.md`

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
npm run db:seed:phase3-demo
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
| `npm run db:seed:phase3-demo` | Practice-ops demo (calendar/billing/trust/intake) |
| `npm run db:seed:demo-firm` | Demo tenant row (`DEMO_SEED_ENABLED=1`) |
| `npm run licence:issue` | Issue / renew firm licence |
| `npm run smoke:phase0` | Phase 0 smoke |
| `npm run smoke:phase1` | Phase 1 MVP smoke |
| `npm run smoke:phase1-rbac` | Junior scoping + cross-firm IDOR |
| `npm run smoke:phase2` | Phase 2 AI smoke |
| `npm run smoke:phase3` | Phase 3 practice-ops smoke |
| `npm run smoke:phase4` | Phase 4 Sell & Ship release smoke |
| `npm run smoke:phase5` | Phase 5 Portal & Scale release smoke |
| `npm run smoke:portal-shares` | Portal share isolation smoke |

## Key docs

- Roadmap status: `docs/ROADMAP_STATUS.md`
- Phase 5 smoke: `docs/PHASE5_SMOKE_TEST.md`
- Phase 5 cloud docs: `docs/cloud/`
- Phase 5 readiness: `docs/PHASE5_READY_CHECKLIST.md`
- Phase 4 architecture: `docs/ARCHITECTURE_PHASE4.md`
- Phase 4 smoke: `docs/PHASE4_SMOKE_TEST.md`
- Licensing / editions: `docs/LICENSING.md`, `docs/EDITIONS.md`
- Onboarding / Help: `docs/ONBOARDING.md`, `docs/user/`
- Sales / ops: `docs/sales/`, `docs/ops/`
- AI: `docs/AI.md`, `docs/AI_PROXY.md`
- Railway / secrets: `docs/RAILWAY.md`, `docs/PRODUCTION_SECRETS.md`
- Hosting and env: `docs/HOSTING.md`
- RBAC: `docs/RBAC.md`

## Phase 5 delivers

- Limited client portal (share-nothing default; staff invite/share/revoke)
- Privacy export/delete tooling, retention docs, AI conversation minimize
- Multi-firm ops console, session admin, embeddings job queue
- Ops runbook, portal auth rate limits, security headers

## Out of scope (post-roadmap)

- Mandatory portal or full client LPMS
- Client AI legal-advice chatbot
- Payment gateways / bank feeds
- Real-time collaborative editing
- Desktop installers

## Deployment status

- Local: verified via smoke scripts when app is running
- Railway production/staging URL: **TBD** (set and record in `docs/HOSTING.md` once deployed). Health check: `GET /api/health`.
- Release smoke: `SMOKE_BASE_URL=https://… npm run smoke:phase5`

## Next

**PHASE 5 COMPLETE — limited client portal and scale/privacy tooling available**

**LEXZIM WEB PHASE ROADMAP 0–5 COMPLETE — iterate on content, integrations, and pilot feedback next**

Do not revive desktop sync or weaken tenant isolation.