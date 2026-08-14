# CRM: client relationships (P7-08)

Practice CRM for client care, not marketing automation.

## Scope

**Practice → CRM** (`/crm`)

- **Birthdays this month / next month** from `clients.date_of_birth`
- Count cards; table rows link to client profile
- Optional filter: responsible lawyer (via `matters.responsible_lawyer_id`)
- **Public holidays this month** from `firm_holidays` (Zimbabwe seed on first visit)

No automated birthday emails in this phase (manual greetings may come in P7-11).

## Permissions

| Code | Who | Use |
|------|-----|-----|
| `crm.view` | Lawyers, secretary, accounts, MP | View birthdays and holidays |
| `crm.manage` | MP, secretary, accounts | Add/remove firm holidays |

Re-seed RBAC after deploy:

```bash
npm run db:seed:rbac
```

## Holidays

Table `firm_holidays`: date, name, country (default `ZW`).

On first CRM load per firm, static Zimbabwe holidays for the current and next calendar year are inserted from `lib/crm/zw-holidays.ts`.

## Export

Kind `birthday_list` with query params:

- `month` (1 to 12, required)
- `responsibleLawyerId` (optional)

PDF, Word, and Excel via the standard export engine.

## Migration

```bash
npm run db:migrate
```

Creates `firm_holidays` (`0022_phase7_crm_holidays.sql`).

**Next:** P7-09 calendar meetings and dashboard widgets.
