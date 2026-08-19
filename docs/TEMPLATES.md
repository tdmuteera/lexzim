# Templates + merge (P1-08 / P1-09)

Firm template library with Zimbabwe-oriented **placeholder** starters, plus server-side `{{FIELD}}` merge onto matters.

## Disclaimer

PLACEHOLDER TEMPLATE ONLY. A qualified legal practitioner must review and adapt every document before use in a real matter. Starters are illustrative and not legal advice.

## Merge fields

```text
{{CLIENT_NAME}}
{{CLIENT_ADDRESS}}
{{OPPOSING_PARTY}}
{{COURT_NAME}}
{{CASE_NUMBER}}
{{MATTER_TITLE}}
{{FILE_REF}}
{{LAWYER_NAME}}
{{FIRM_NAME}}
{{DATE}}
{{TODAY}}
```

Defaults come from matter, client, firm, responsible lawyer, and the first opposing party on the matter. Users can override any field in the generate UI.

### Unknown-field behaviour

- Tokens **not** in the values map are **left unchanged** in the generated `.docx`.
- Empty string values **clear** the token.
- Response includes `resolvedFields`, `unresolvedFields`, and `leftoverTokens`.

PDF export is out of scope for Phase 1 (DOCX required).

## Starters

| Area | Title |
|---|---|
| Family | Family — Letter of Demand (placeholder) |
| Civil | Civil — Letter of Demand (placeholder) |
| Labour | Labour — Notice / complaint letter (placeholder) |

Seed via UI button or `POST /api/templates` (`templates.manage`).

## Storage paths

```text
firms/{firm_id}/templates/{template_id}/v{version}/{file_name}.docx
firms/{firm_id}/matters/{matter_id}/documents/{document_id}/{file_name}.docx
```

Generated files use `doc_type = generated_template` and link `template_id`.

## UI

- `/documents` → Template library: **Add a template** (Word/PDF), then a lawyer or Managing Partner **Approves**. Seed starters still available.
- Client profile → **Documents** tab: extra files for that client (not tied to a matter).
- Matter detail → **Documents** → upload and **Generate from template** (approved templates).

## API

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/templates` | `templates.view` |
| `POST` | `/api/templates/upload` | `templates.manage` or `documents.manage` |
| `POST` | `/api/templates/[id]/approve` | lawyer or Managing Partner (`templates.view`) |
| `GET`/`POST` | `/api/clients/[id]/documents` | `documents.view` / `documents.manage` |
| `GET` | `/api/templates/[id]/download` | `templates.view` |
| `GET` | `/api/matters/[id]/generate` | `documents.manage` + `templates.view` (preview) |
| `POST` | `/api/matters/[id]/generate` | same (merge + attach) |

## Audit / timeline

- `documents.generate` audit
- Timeline `eventType: document` on generate

## Next

**P1-10:** Dashboard.
