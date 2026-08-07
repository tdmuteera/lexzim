# Global search + UX polish (P1-11)

## Global search

Header search (Ctrl+K / Cmd+K):

- Clients (`clients.view`) and matters (`matters.view`)
- Firm-scoped Postgres `ILIKE`
- Matters respect `matters.view_all` vs assigned

API: `GET /api/search?q=`

## Polish

- Zimbabwe-friendly dates: `lib/format/dates.ts` (`en-GB`, `Africa/Harare`)
- Toast provider in app shell
- Shared `EmptyState` on client/matter empty lists
- Search result dropdown styling

## Next

**P1-12:** Export / backup.
