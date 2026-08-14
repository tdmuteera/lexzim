# Trust accounting (P7-07)

Client trust money is separate from firm fee revenue. Trust ledger entries never mix with `fee_payments` or invoices.

## Four accounts (UI clarity)

| Label | Meaning | GL |
|-------|---------|-----|
| Business vault | Firm operating cash on hand | 1010 |
| Business bank | Firm operating bank | 1010/1020 |
| Trust vault | Client cash held in physical vault | Trust sub-ledger |
| Trust bank | Client money at bank | 1210 (asset) / 2100 (liability) |

## Trust movements

- **Receipt:** increases client trust balance (+). Mandatory reference number (user supplied or auto `TR-0001`).
- **Disbursement:** decreases client trust balance (-). Same reference rules.
- **Transfer:** between trust accounts (no GL mirror in v1).
- **Adjustment:** audited correction (+/−).

### GL mirror (receipt / disbursement)

Posted automatically when a receipt or disbursement is saved:

| Entry | Debit | Credit |
|-------|-------|--------|
| Receipt | 1210 Trust bank | 2100 Trust liability |
| Disbursement | 2100 Trust liability | 1210 Trust bank |

Client and matter ids are stored on journal lines for sub-ledger traceability.

Reference numbers are allocated per firm via `allocateTrustReferenceNumber()` (`TR-0001` sequence).

## UI

**Finance → Trust**

- **Open trust for client:** search by CL number or name, then post receipt/disbursement.
- **Client statement:** running balance with PDF/Word/Excel export (`trust_statement`).
- Vault panel for physical cash counts and bank-ins.

## Exports

| Kind | Params |
|------|--------|
| `trust_statement` | `clientId` |

## Migration

Run before use:

```bash
npm run db:migrate
```

Migration `0021_phase7_trust_ap_petty.sql` adds `reference_number` on trust ledger, petty cash, creditors, and expense GL links.

**Next:** P7-08 CRM birthdays and holidays.
