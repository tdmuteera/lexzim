# Support triage

How LexZim ops triages pilot tickets. Prefer facts over guesswork. Never ask for full matter contents in email if a diagnostics file and steps will do.

## Severity

| Level | Meaning | Response target [TBD] |
|-------|---------|------------------------|
| S1 | Firm-wide outage (no login / blank site) | Same business day, urgent |
| S2 | Major feature down (billing, trust, AI for all users) | Within 1 business day |
| S3 | Single user or workaround exists | Within 2 business days |
| S4 | How-to / training | Queue / Help docs |

## First five minutes

1. Firm name or slug, approximate time (with timezone), who is affected
2. Can **you** open `https://<host>/api/health`?
3. Ask MP for **Settings → About → Download diagnostics** (optional). No auto-upload. No matter text inside.
4. Browser and whether others at the firm are fine
5. Recent change: new user, licence, AI key, deploy

## Symptom → path

### Site down / Railway

- Health 503 or refused → `PILOT_RUNBOOK.md` Railway section; redeploy last good
- Health ok but UI broken → hard refresh; check browser console; recent frontend deploy

### Cannot log in

- Confirm correct HTTPS URL
- Caps Lock / old password / deactivated user
- Supabase Auth / paused project
- Cookie / Secure URL mismatch (`NEXT_PUBLIC_APP_URL`)

### Seat or invite errors

- Licence seats full → raise seats or deactivate a user (`docs/EDITIONS.md`)
- Wrong permission on Lawyers & Staff

### Licence / cannot create matter

- Expired or revoked licence blocks **new** matters
- Export still works. Renew licence; do not “fix” by deleting data

### AI errors

| User report | Check |
|-------------|--------|
| Provider error / 401 | Key missing or invalid (BYO or env) |
| Budget message | Soft budget hit |
| Empty / weak answer | Normal limitation |
| “Not found” / no sources | RAG miss: see runbook; not always an outage |
| Matter assist disabled | Firm matter context off in Settings → AI |

### Billing vs trust confusion

- Fee payment did not change trust → expected
- Point to Help → Billing and trust (`/help/billing`)

### Export

- Permission `settings.manage` required
- If export fails: check disk/network, server logs (redacted), try again
- Remind: store archive securely

### Wrong firm data / isolation fear

- Users only see their `firm_id` tenant
- If a user somehow sees another firm’s data: treat as **S1**, revoke sessions, capture diagnostics, escalate engineering immediately

## What not to do

- Paste API keys, JWTs, or connection strings into tickets or chat
- Ask the firm to email full client files for a login bug
- Promise offline AI or desktop install
- Invent legal answers when RAG misses

## Hand off to engineering

Include:

- Diagnostics JSON (if provided)
- Health JSON screenshot or copy
- Firm slug, app version, edition
- Steps to reproduce
- Whether staging or production

Use `ISSUE_TEMPLATE.md`.
