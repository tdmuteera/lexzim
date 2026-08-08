# Privacy notice template (draft for legal review) — P5-12

**Status:** Template / placeholder. Not legal advice.  
**Mindset:** Zimbabwe Cyber and Data Protection Act (CDPA) style duties: lawful processing, purpose limitation, security, data subject rights, cross-border caution. Replace bracketed text before publishing to clients.

## 1. Who we are

- **Product:** LexZim (legal practice management + AI assistant for Zimbabwe practices)
- **Controller (typical):** [Law firm legal name] (“the Firm”) for client/matter data entered into LexZim
- **Processor / operator:** [LexZim operator legal name] hosts the multi-tenant SaaS on Railway + Supabase
- **Contact for privacy:** [email / DPO placeholder]

## 2. What data we process

| Category | Examples | Typical source |
|----------|----------|----------------|
| Firm staff accounts | Name, email, role, login times | Firm admin invite |
| Client / matter records | Names, IDs, addresses, matter notes, deadlines, billing, trust ledger | Firm staff entry |
| Documents | Uploaded / generated files in firm Storage prefix | Firm staff / portal inbox (after accept) |
| Client portal | Portal login, shares, downloads, optional inbox uploads | Firm invite + client use |
| AI usage | Prompts, answers, citations metadata, usage counters | Staff AI features |
| Technical | Session cookies, IP/user-agent snippets in audit, health metrics | System |

Trust money and fee records are kept separate in product design; both remain confidential.

## 3. Purposes (lawful basis placeholders)

| Purpose | Basis [to confirm] |
|---------|-------------------|
| Provide LPMS to the Firm | Contract / legitimate interests |
| Client portal limited sharing | Firm instructions + consent/contract with client as applicable |
| AI research / drafting assist | Firm instructions; lawyer-in-the-loop; not automated legal advice |
| Security, audit, abuse prevention | Legitimate interests / legal obligation |
| Hosting, backups, support | Contract with Firm |

## 4. AI-specific notices

- LexZim AI is **grounded** on curated Zimbabwe knowledge and firm memory where configured; empty retrieval must not invent law (see `docs/AI.md`).
- AI output is **not** a substitute for professional judgement.
- Conversation text is retained only as long as needed for the feature, then minimized (see `RETENTION.md` and AI retention purge).
- Provider keys may be managed env or firm BYO; keys are not exported in firm ZIP archives.

## 5. Sharing and subprocessors

| Subprocessor | Role | Region [fill] |
|--------------|------|---------------|
| Supabase | Postgres, Auth, Storage, pgvector | [project region] |
| Railway | App hosting | [region] |
| AI providers (Gemini / Claude / OpenAI as configured) | Model inference | [provider regions] |

No sale of personal data. Portal is share-nothing by default (explicit firm shares only).

## 6. Retention and deletion

See `docs/cloud/RETENTION.md`. Summary:

- Firm may export and suspend; ops may hard-purge after typed confirmation.
- Portal users may download “my portal data” (portal-held only).
- AI conversations: default minimize window (configurable); purge job available.
- Hosted backups/PITR may outlive app deletion for a limited period.

## 7. Security measures (high level)

- Firm `firm_id` tenancy isolation; RBAC; portal session separate from staff
- HTTPS; Secure cookies in production; optional ops IP allowlist
- Audit of auth, export, share, purge events
- No matter contents on ops aggregate health APIs

## 8. Data subject rights (placeholders)

Requests are usually handled by **the Firm** as controller. LexZim operator assists under contract:

- Access / export (firm ZIP; portal self-export)
- Rectification (via Firm staff in product)
- Erasure / restriction (suspend + purge workflows)
- Objection / complaint: [regulator contact placeholder]

## 9. Cross-border transfers

[Describe Supabase/Railway/AI regions and transfer safeguards to be confirmed by counsel.]

## 10. Changes

This template will be versioned with product releases. Published client-facing notice requires legal sign-off.

## Related

- `PROCESSING_REGISTER.md`, `RETENTION.md`, `ADMIN.md`, `THREAT_MODEL.md`, `BACKUP.md`, `AI.md`
