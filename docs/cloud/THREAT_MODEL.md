# Threat model: Phase 5 client portal & scale

**Scope:** Limited client portal, share grants, portal auth, and scale assumptions on the existing Railway + Supabase LexZim SaaS.  
**Not in scope:** Designing first-time cloud sync, desktop agents, or SQLite.

## Assets

| Asset | Sensitivity |
|-------|-------------|
| Matter metadata and shared documents | Privileged / confidential |
| Portal account identity (email ↔ client) | High |
| Staff sessions and RBAC | High |
| Firm export archives | High |
| AI keys and provider traffic | High (staff plane) |
| Trust and fee money data | High (generally **not** portal-exposed in MVP unless explicitly designed later) |

## Actors

- Firm staff (Managing Partner, lawyers, accounts, secretary)
- Invited portal clients (per firm + client)
- Platform / LexZim ops
- External attacker (internet)
- Malicious or compromised portal user
- Curious staff member probing IDOR

## Trust boundaries

```text
Internet
  ├─ Staff app (/…) — Supabase staff auth + RBAC
  └─ Portal (/portal) — portal auth + share grants only
        │
        ▼
Next.js on Railway
        │
        ▼
Supabase (Postgres / Auth / Storage) — firm_id tenancy
```

Portal and staff sessions must not be interchangeable.

## Core controls

1. **Share-nothing default.** No implicit portal visibility.
2. **Tenant isolation.** Every portal query: `firm_id` from session + share row + `client_id` match.
3. **Least privilege.** Portal: read (and optional upload to an inbox) only. No staff admin, no AI settings, no licence, no arbitrary trust posting.
4. **Audit.** Share, revoke, portal login, failed auth, uploads.
5. **TLS in production.** Secure cookies; correct `APP_URL`.
6. **Revocation.** Immediate effect on authorization checks.
7. **Core app independence.** Disabling portal must not break staff LexZim.

## Threats and mitigations

### T1. Portal account takeover

| | |
|--|--|
| **Threat** | Attacker resets or steals portal credentials / magic link |
| **Impact** | Read shared matters/docs for that client |
| **Mitigations** | Short-lived sessions; single-use or expiring magic links; rate-limit auth (`POST /api/portal/auth`, 20/IP/15m); email to known client address only; revoke portal user; audit logins |
| **Residual** | Compromised client mailbox |

### T2. IDOR inside a firm

| | |
|--|--|
| **Threat** | Portal user A guesses matter/document IDs belonging to another client in the same firm |
| **Impact** | Cross-client leak within tenant |
| **Mitigations** | Authorize via share rows for `session.client_id` only; never “matter exists in firm ⇒ visible”; automated tests |
| **Residual** | Buggy share query |

### T3. Cross-tenant access

| | |
|--|--|
| **Threat** | Portal user of firm A accesses firm B objects |
| **Impact** | Severe confidentiality breach |
| **Mitigations** | `firm_id` from portal session on every query; no client-supplied firm override; isolation smoke tests (extend Phase 4 patterns) |
| **Residual** | Engineering defect; treat as S1 |

### T4. Staff session confused with portal

| | |
|--|--|
| **Threat** | Cookie or middleware mixes planes |
| **Impact** | Privilege escalation or lockout |
| **Mitigations** | Separate cookie names / path prefixes; separate `requirePortalSession` vs `requirePermission`; explicit route groups |
| **Residual** | Misconfigured middleware |

### T5. Over-sharing by staff

| | |
|--|--|
| **Threat** | Lawyer shares whole matter including sensitive attachments by mistake |
| **Impact** | Excess disclosure to client |
| **Mitigations** | Explicit share UX; document-level shares; revoke; audit; training in Help docs |
| **Residual** | Human error |

### T6. Upload abuse (when inbox exists)

| | |
|--|--|
| **Threat** | Malware or huge files via portal upload |
| **Impact** | Storage cost, malware pivot to staff viewers |
| **Mitigations** | Size/type limits; virus scan later; uploads land in quarantine inbox not auto-published; staff-only open |
| **Residual** | Zero-day content |

### T7. Storage URL leakage

| | |
|--|--|
| **Threat** | Long-lived public signed URLs forwarded |
| **Impact** | Doc access after revoke |
| **Mitigations** | Short-lived signed URLs; authorize before minting; revoke does not need to scrub old URLs if TTL is short |
| **Residual** | Forwarded URL within TTL |

### T8. Export / delete misuse (privacy tooling)

| | |
|--|--|
| **Threat** | Stolen MP session triggers tenant delete |
| **Impact** | Data loss |
| **Mitigations** | Strong confirmations; audit; optional dual control later; export-before-delete guidance |
| **Residual** | Insider threat |

### T9. Scale / availability

| | |
|--|--|
| **Threat** | Free-tier pause, pool exhaustion, embedding backlog |
| **Impact** | Pilot outage (staff and portal) |
| **Mitigations** | Paid tiers runbook; health checks; worker split if needed; monitoring (P5-13) |
| **Residual** | Provider outages |

## Non-goals (threat model boundary)

- Defending a desktop sync channel (does not exist)
- Making the portal a full LPMS
- Guaranteeing offline portal use
- Assuming AI is exposed to portal users in MVP (default: **no**)

## Verification hooks

- Isolation tests: firm A portal user cannot read firm B shares
- Same-firm IDOR tests: client A cannot read client B shares
- Revoke test: access denied after `revoked_at`
- Staff app smoke still passes with portal disabled
- Auth audit rows present for portal login success/failure

## Related

- `docs/cloud/ADR_PHASE5.md`
- `docs/ops/SUPPORT_TRIAGE.md` (S1 for cross-tenant)
- Phase 5 prompts P5-02 onward implement controls described here
