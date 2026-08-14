# Support issue template

Copy into email, Linear, GitHub, or chat. Delete unused sections.

---

## Summary

One line: what is broken or unclear.

## Severity

- [ ] S1 Firm-wide outage
- [ ] S2 Major feature down
- [ ] S3 Single user / workaround exists
- [ ] S4 How-to / training

## Environment

- Firm name:
- Firm slug:
- App URL (staging / production):
- App version (Settings → About):
- Edition / licence status:
- Approximate time of issue (timezone):

## Who is affected

- [ ] All users
- [ ] One role (which):
- [ ] One user (email, no password):

## What happened

Steps to reproduce:

1.
2.
3.

Expected:

Actual:

## Checks already done

- [ ] `/api/health` result (paste `ok` / `version` only, no secrets):
- [ ] Diagnostics JSON attached (Settings → About → Download diagnostics)
- [ ] Hard refresh / different browser
- [ ] Another user at the same firm tried

## Feature area

- [ ] Auth / login
- [ ] Users / seats
- [ ] Licence / new matters blocked
- [ ] Clients / matters / documents
- [ ] Calendar / reminders
- [ ] Billing (fees)
- [ ] Trust
- [ ] AI / RAG
- [ ] Export / backup
- [ ] Other:

## AI-specific (if relevant)

- Provider (gemini / claude / openai / unknown):
- BYO or managed key:
- Soft budget message? (yes/no):
- Web lookup enabled? (yes/no; default is no):
- Exact user-visible message (no pasted API keys):

## Attachments

- Diagnostics JSON: yes / no (preferred; contains version, firm id, edition; **no matter contents**)
- Screenshots: yes / no (redact client names if possible for non-S1)
- Do **not** attach: `.env`, API keys, full export zip unless ops requested it on a secure channel

## Impact and workaround

Business impact:

Temporary workaround (if any):

## Reporter

- Name:
- Role at firm:
- Contact:
- LexZim ops owner:

---

Ops: triage with `SUPPORT_TRIAGE.md`. Pilot lifecycle: `PILOT_RUNBOOK.md`.
