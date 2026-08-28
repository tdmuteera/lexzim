# LexZim developer authority agreement

This folder documents how the **project developer** may authorise AI agents (Cursor and similar) to perform privileged work on this codebase and its linked databases.

It is **not** a product feature for firm staff. Firm Managing Partners still cannot hard-delete live financial history from the LexZim UI. Platform purge and developer unlock are separate operator paths.

## Parties

- **Developer:** the person who controls this repository and the `DEVELOPER_UNLOCK_PASSWORD` secret.
- **Agent:** any AI coding agent working inside this project folder with tools that can edit code or run scripts against the database.

## Grant

When this project folder is open and the developer issues a prompt that asks for a system change (code, config, or data), the agent **may** carry out that change **after** the unlock steps below succeed.

Ordinary product coding (features, UI, docs) does not require unlock. Unlock is required for **privileged** actions.

## Privileged actions (unlock required)

Ask for the developer unlock password and wait for it before doing any of the following:

1. Hard-delete or purge clients, matters, invoices, payments, trust ledgers, or other financial history
2. Delete or demote the Managing Partner (or last `users.manage` holder)
3. Force-delete staff users outside normal product flows
4. Run one-off SQL or scripts that rewrite production or shared pilot data
5. Reset Auth passwords / issue temporary passwords for forgotten accounts
6. Change or rotate secrets in `.env.local` (except when the developer explicitly asks to add a named key)
7. Disable safety guards (purge confirm phrases, ops IP allowlists) without an explicit request

## Unlock procedure (agents must follow)

1. State what you are about to do and what will be destroyed or changed.
2. Ask the developer to provide the unlock password in the chat (or confirm that `.env.local` already holds `DEVELOPER_UNLOCK_PASSWORD` and that they authorise this exact action).
3. Verify with `npm run developer:unlock -- --check` (reads env) or by running the intended script, which itself calls `assertDeveloperUnlock`.
4. Never write the password into committed files, docs, rules, or git history.
5. Never echo the password back in summaries.
6. Prefer `scripts/developer-*.ts` entry points over ad-hoc SQL.

## Passwords and Auth accounts

Supabase Auth does **not** store recoverable plaintext login passwords. Agents must not claim they can “read the password from the database.”

With unlock confirmed, an agent **may**:

- Look up the user email / id in `users`
- Reset or set a temporary password via the admin Auth API (and tell the developer the temporary value once)
- Point the developer at Settings → Security password-reset flows when that is enough

## Local secret

```env
# .env.local only (gitignored)
DEVELOPER_UNLOCK_PASSWORD=your-secret-here
```

See `.env.example` for the key name. Rotate the password if it was ever pasted into a shared chat or committed by mistake.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run developer:unlock -- --check` | Confirm env password is set and verifier works |
| `npm run developer:purge-client -- …` | Hard-purge one client by firm + name/number after unlock |

## Acceptance

By placing `DEVELOPER_UNLOCK_PASSWORD` in `.env.local` and using this agreement, the developer accepts that agents following `.cursor/rules/developer-unlock.mdc` are authorised to perform privileged work **only** when unlock succeeds for that request.
