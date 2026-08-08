# FAQ

Short answers for Zimbabwe pilot users.

## Password reset

LexZim uses email and password sign-in (Supabase Auth).

- If you know your password but cannot sign in, confirm you are on the correct firm URL.
- If you forgot your password, ask your **Managing Partner** or LexZim ops to issue a new temporary password (admin invite or auth reset flow your host supports).
- Passwords must meet the firm minimum length (at least 10 characters).

Never send passwords through public chat channels.

## I cannot see a menu item

Your role lacks that permission. Ask the Managing Partner to change your role or explain firm policy. This is normal multi-user design, not a bug.

## Export and backup

- **Settings → Backup & Export** (Managing Partner / settings permission).
- Export remains available if the licence expires.
- Store archives securely. They contain confidential data.
- Full restore into a fresh firm is support-assisted in the MVP.

## Licence expired

- You can still sign in and export.
- Opening **new matters** (including intake conversion) may be blocked until renewal.
- Existing matters and documents remain available for work and review subject to your permissions.

## AI says not found / no grounding

- The knowledge pack or firm memory may not cover that topic.
- Web lookup may be off (default). Turning it on is an admin decision.
- Rephrase with Zimbabwe statutes or practice area keywords.
- Research the point yourself. Do not invent authorities.

## AI completely unavailable

Check: API key present, soft budget not exceeded, edition includes AI, provider status, and firm AI settings. See `AI_Assistant_Guide.md`.

## App feels down or slow

LexZim is hosted (typically Railway + Supabase).

- Confirm your internet connection.
- Try `/api/health` on your firm URL if you have been shown that check.
- Free or paused database projects can sleep after inactivity and take a minute to wake.
- Managing Partners can download **Settings → About → Download diagnostics** (version, firm id, edition only) and send it to support. Nothing uploads automatically.
- If the site stays down, contact LexZim ops with the time, your firm name, and a screenshot.

## Trust vs fees

Fee notes and fee payments live under **Billing**. Client money lives under **Trust**. They never auto-mix. See `Billing_Trust_Quickstart.md`.

## Demo or sample data

Optional sample client/matter loading is environment-gated and is for training only. Production pilots usually leave it off. Ask ops before loading samples on a live firm.

## Where are the full guides?

In the app: **Help**.

In the repo: `docs/user/` (this FAQ and the guides listed in `README.md`).
