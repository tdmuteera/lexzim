# Pilot runbook

Operational steps to stand up and run a LexZim pilot on Railway. Web only. No desktop install.

## Before kickoff

1. Confirm staging or production Railway URL and Supabase project (never point staging at production Postgres).
2. Confirm env vars per `docs/RAILWAY.md` and `docs/PRODUCTION_SECRETS.md`.
3. Run migrations (`npx drizzle-kit migrate` with `DIRECT_URL` when needed).
4. Issue or confirm licence: `npm run licence:issue -- --firm-slug … --edition firm --seats … --days …`
5. Create Managing Partner (or confirm existing pilot firm such as `t-pfigu-attorneys`).
6. Share HTTPS URL, MP login, and in-app **Help** with the firm sponsor.
7. Agree success criteria from `docs/sales/PILOT_OFFER.md`.

## Kickoff day

1. MP signs in; open Dashboard checklist (optional) and **Settings → Firm profile**.
2. Set currency and invoice prefix.
3. **Settings → Licence**: confirm edition and seats.
4. **Lawyers & Staff**: invite users within seat limit.
5. **Settings → AI**: keys and provider; leave web lookup **off** unless agreed.
6. Walk one path: create a client, then open a matter.
7. Show Billing vs Trust (fee note ≠ trust receipt).
8. **Settings → Backup & Export**: run one export into the firm’s custody.
9. **Settings → About**: note version; optionally **Download diagnostics** (safe JSON, no matter contents).

## Weekly while the pilot runs

- Check Railway deploy health: `GET /api/health` → `ok: true`
- Skim audit log for auth failures and licence/seat errors
- Ask whether AI soft budget was hit
- Remind firm to keep a recent export

## Railway down or bad deploy

1. Open `https://<host>/api/health`. If 503 or connection refused, app or env is unhealthy.
2. Railway → service → Deployments: check latest build logs and crash loops.
3. **Redeploy** the last known good deployment (rollback). See `docs/RAILWAY.md`.
4. Confirm variables still present after redeploy (`DATABASE_URL`, Supabase keys, `NEXT_PUBLIC_APP_URL`).
5. Notify the firm sponsor with ETA. Do not paste secrets into the ticket.

## Supabase issues

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Login fails for everyone | Auth or project paused | Supabase dashboard: project status, Auth providers |
| Intermittent slow first request | Free project slept | Wake project; consider paid tier for live pilots |
| DB errors in app logs | Pooler / connection string | Verify `DATABASE_URL` (pooler) vs `DIRECT_URL` (migrate) |
| Uploads fail | Storage bucket / RLS | Check bucket name and service role on server only |
| “Invalid API key” | Rotated keys not updated | Update Railway vars; redeploy |

Never put `service_role` in the browser or in chat screenshots.

## Auth (firm users)

- Password minimum: 10 characters
- Wrong firm URL is a common false “outage”
- MP or ops resets temporary passwords; do not share passwords in public channels
- Session cookies require correct `NEXT_PUBLIC_APP_URL` and HTTPS in production

## AI keys and budgets

- BYO keys: Settings → AI (encrypted at rest). Managed keys: Railway env (`GEMINI_API_KEY`, etc.)
- Soft monthly budget soft-blocks new LLM calls; raise or clear budget in Settings → AI
- Provider switch: change default provider and confirm key status per provider
- Web lookup stays off unless MP enables it

## RAG / “not found” confusion

Users often report “AI is broken” when the answer says material was not found.

1. Confirm AI is reachable (key present, budget not exceeded).
2. Explain: grounding miss ≠ outage. Knowledge pack may not cover that topic.
3. Check Settings → About: embeddings ready and chunk counts.
4. Rephrase with Zimbabwe statute or practice keywords.
5. Do not invent citations for the user.

## Export

- Always available, including after licence expiry
- Contains confidential data: firm stores it securely
- Binary files listed by path; full restore is support-assisted
- Recommend export before licence changes, major deploys, and pilot end

## Pilot end

1. Review success criteria with the sponsor.
2. Convert licence, extend, or exit (`docs/LICENSING.md`, `docs/sales/PILOT_OFFER.md`).
3. Confirm latest export is with the firm.
4. Close open support tickets; note version and firm slug in the handoff.

## Contacts [TBD]

- LexZim ops: **[TBD]**
- Escalation: **[TBD]**
- Firm sponsor: per pilot sheet
