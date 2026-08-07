# P0-09 Auth UI manual test

## Prerequisites

```powershell
cd C:\Users\Administrator\Desktop\Projects\EXPERIMENTS\lexzim
npm run dev
```

Open http://localhost:3000

## Scenario A: Existing platform (firms already exist)

1. Visit `/` → should redirect to `/login` (if logged out) or `/dashboard` (if session cookie present).
2. **Login page** (`/login`): TPfigu-style dark panel + cream form; LexZim branding.
3. Sign in with your user (e.g. `mp@lexzim.local` / `<set-in-env>`).
4. Land on `/dashboard` with app shell.
5. Sidebar shows **your firm name** (e.g. T Pfigu Attorneys).
6. Top bar shows **full name**, **role**, and **firm name**.
7. Click **Sign out** → returns to `/login`.
8. Try `/dashboard` while logged out → redirects to `/login`.

## Scenario B: Fresh platform (empty database)

Use a new Supabase project or clear `firms` / `users` / auth users (dev only).

1. Visit `/` → redirects to `/setup`.
2. Complete setup wizard (firm name, MP name, email, password 10+ chars, confirm password).
3. Lands on `/dashboard` signed in.
4. `/setup` is no longer accessible (redirects to `/login`).
5. Logout → `/login` works with new credentials.

## Scenario C: Deep links

| URL while logged out | Expected |
|---|---|
| `/clients` | Redirect to `/login` |
| `/setup` (firms exist) | Redirect to `/login` |

| URL while logged in | Expected |
|---|---|
| `/login` | Redirect to `/dashboard` |

## Password reset (MVP)

No self-service reset UI. Login page notes: contact Managing Partner or platform admin.
