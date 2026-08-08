# ADR: Phase 5 Portal & Scale

**Status:** Accepted for implementation (P5-01)  
**Date:** 2026-08-08  
**Product:** LexZim (web SaaS on Railway + Supabase)  
**Phase:** 5 — Portal & Scale (optional advanced)

## Context

Phases 0 to 4 already delivered a hosted multi-tenant practice system: staff RBAC, matters, documents, practice ops, Zimbabwe-grounded AI, licensing, and pilot ops. Cloud hosting is **not** new in Phase 5.

Phase 5 adds a **limited client portal**, stronger **privacy/compliance tooling**, and **scale** guidance beyond free tiers. It must not revive desktop sync, SQLite, or installers.

## Decision

### 1. Portal packaging

- Same Next.js app on Railway for MVP.
- Route group under `/portal` (not a separate subdomain required for MVP).
- Optional later: `portal.` custom host pointing at the same service.
- Portal can be **feature-disabled** per firm / edition without breaking the main staff app.

### 2. Portal components (logical)

| Component | Role |
|-----------|------|
| Portal auth | Separate from staff Supabase sessions; invited clients only |
| Portal identity | `portal_user` mapped to `firm_id` + `client_id` |
| Share grants | Explicit shares for matters and/or documents (default: nothing) |
| Portal UI | Read-limited views; optional narrow upload inbox later |
| Staff share UX | Lawyers invite/revoke from the main app |
| Audit | Login, share, revoke, upload, export/delete events |

### 3. Share-nothing default

- Creating a client or matter does **not** expose anything to the portal.
- Portal users see only objects with an active share grant for their `client_id` and `firm_id`.
- Revoke sets `revoked_at` (or equivalent); access ends immediately on next request.

### 4. Tenant isolation

- One firm = one tenant. Every portal query filters `firm_id` from the portal session, never from a client-supplied firm id alone.
- Portal users never receive staff permissions (`settings.manage`, trust manage, AI admin, etc.).
- Cross-tenant IDOR tests are mandatory before portal goes to pilots.

### 5. Scale path (document now, implement later prompts)

- Upgrade path: Supabase Pro, Railway paid always-on, connection pooling discipline.
- Optional worker service for embeddings / heavy jobs if the web dyno saturates.
- Document data residency choice (region) for legal review; no silent multi-region replication in MVP.

### 6. Privacy tooling (later P5 prompts)

- Firm-admin export/delete of tenant cloud data beyond day-to-day backup export.
- Retention notes and privacy docs for counsel review.
- Session/device revoke polish for staff (and portal sessions).

## Consequences

**Positive**

- Clients get a controlled window into shared files without full LPMS access.
- Staff app remains the system of record.
- Isolation and audit stay enforceable.

**Negative / costs**

- Second auth plane to operate and support.
- Share UX must be clear or firms will over-share.
- Hosting cost rises with paid tiers and portal traffic.

## Non-goals

- Desktop sync protocol or SQLite revival
- Public self-signup mega-SaaS circus
- Full client CRM / full matter editing in portal
- Bank feeds or payment gateways
- Replacing staff LexZim with the portal
- Inventing “first-time cloud” architecture (already live)

## Alternatives considered

| Option | Why not |
|--------|---------|
| Separate portal microservice now | Extra deploy surface for MVP; same Railway service is enough |
| Auto-share all client matters | Violates share-nothing; high breach blast radius |
| Reuse staff user accounts for clients | Confuses RBAC; privilege risk |

## Related docs

- `docs/cloud/THREAT_MODEL.md`
- `docs/TENANT_ARCHITECTURE.md`
- `docs/ARCHITECTURE_PHASE4.md`
- `docs/PHASE5_READY_CHECKLIST.md`

## Handoff

Ready for **P5-02** (portal route skeleton + `DEV_SETUP_PORTAL.md`).
