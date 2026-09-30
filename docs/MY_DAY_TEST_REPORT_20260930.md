# My Day: End-to-End Test Report (30 Sep 2026)

## Setup

- **Tester:** automated browser run (Playwright, Chromium, 1920x1080) against the local dev server (`npm run dev`, http://localhost:3000).
- **Account:** training demo user "Tendai Demo" (`training.demo@tpfigu.local`), role `junior_associate` (ordinary staff, not an administrator).
- **Firm:** "Training Demo Firm" (`is_demo = true`), a separate tenant. No T Pfigu client, matter or finance data was read, changed or shown.
- **Data:** fictional sample data created by `npx tsx scripts/training-demo-user.ts` (reset before each run).
- **Database note:** the local app uses the same Supabase database as the live site, so all test data was kept inside the training firm.
- **Test script and screenshots:** `C:\Users\Administrator\Desktop\STUFF\WORK\My Day Training Video\capture\` (`test_myday.py`, `test_drag.py`, `test_shots\`, `test_results.json`).

## Result

24 of 24 features work. One step failed once in automation (drag and drop, see observation 1) and passed 3 of 3 times on a focused retest.

| # | Feature | Expected | Result |
|---|---|---|---|
| 1 | Open My Day | Date hero, progress ring, morning review and board show | Pass |
| 2 | Morning review: push carried item to Tomorrow | Item moves to Tomorrow | Pass |
| 3 | Morning review: dismiss | Panel disappears | Pass |
| 4 | Quick add with priority star and tag | Item in Today with star and tag | Pass |
| 5 | Add with Options (date, time, weekly repeat, notes) | Appears on the day and in Repeating | Pass |
| 6 | Edit via menu (title and time) | Title and time updated | Pass |
| 7 | Edit by double-click (notes) | Notes saved | Pass |
| 8 | Toggle priority star | Star turns on | Pass |
| 9 | Complete an item | Leaves open list, "Show finished today (1)" appears, ring updates | Pass |
| 10 | Review finished items and reopen | Finished list shows item, untick reopens it | Pass |
| 11 | Push to Tomorrow | Moves to Tomorrow | Pass |
| 12 | Push to Next week (Mon) | Appears in Next 14 days | Pass |
| 13 | Push to Someday | Appears in Someday | Pass |
| 14 | Push to a picked date beyond 14 days | Appears under Later with a date chip | Pass |
| 15 | Plan on a day in Next 14 days | Item created on that day | Pass |
| 16 | Add directly to Tomorrow | Item appears in Tomorrow | Pass |
| 17 | Drag an item between days | Item moves | Pass on retest (3 of 3) |
| 18 | Won't do | Item closes | Pass |
| 19 | Move to calendar | Dialog opens, private event created, item leaves the list | Pass |
| 20 | Delete (with confirmation) | Item removed | Pass |
| 21 | Stop a repeating item | Removed from Repeating | Pass |
| 22 | Changes persist after reload | Edits and moves still there | Pass |
| 23 | Dashboard My Day tile | Tile with today's items shows | Pass |
| 24 | Calendar page | My Day strip shows; promoted item is a calendar event | Pass |

## Observations (no code was changed)

1. **Drag and drop, automation only.** In the full run the drop landed while the Options panel was still open, so the Today column had moved. A focused retest (Tomorrow to Today and back, 3 times) passed every time. It's not an app bug, but worth one manual check by a person with a mouse.
2. **New items briefly show a dashed "saving" circle.** Because the database is remote, a newly added item keeps the dashed tick for about 1 to 3 seconds until the server confirms it. It resolves on its own. If staff find it confusing, a short "Saving" tooltip could help.
3. **Date fields follow the browser's language, not the page.** The page shows British dates ("Wednesday, 30 September 2026"), but the date inputs in Options, the item menu and the Move to calendar dialog show the browser's own format (mm/dd/yyyy in the test browser). On staff computers set to English (UK) or English (Zimbabwe) they will show dd/mm/yyyy.
4. **Harmless 403 on the dashboard for ordinary staff.** The dashboard requests `/api/onboarding`, which a junior associate is not allowed to see, so the browser console logs two 403 errors. Nothing visible breaks. Optional fix: only request it for roles that can see onboarding.
5. **Month view hides the fourth event of a day behind "+1 more".** This is by design, but a newly promoted item may not be visible at a glance on busy days. Agenda view shows everything.
6. **Training firm licence.** The training firm gets the standard trial licence. The reset script does not renew it, so if the demo account ever stops signing in after the trial period, renew the training firm's licence in platform admin.

## Demo user

- **Credentials:** `.env.demo-user` in the project root (git-ignored by the `.env.*` rule, never committed).
- **Create or reset (user, password and sample data):** `npx tsx scripts/training-demo-user.ts`
- **Remove the training firm and its login completely:** `npx tsx scripts/training-demo-user.ts --remove`
- The script refuses to run if the training firm slug or the demo email belongs to anything outside the training firm.
