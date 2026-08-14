# LexZim design system

**Visual source = TPfigu HTML demo; port faithfully.**

Do not invent a purple/navy/teal AI theme. The locked look is cream parchment + gold accent + charcoal text from the T Pfigu Attorneys demo.

## Sources

- `styles/tpfigu.css` — ported from `tpfigu-build/css.js`
- `styles/globals.css` — imports the port + Phase 0 splash helpers
- Original demo: `EXPERIMENTS/TPfigu_Attorneys_Law_Management_System.html`
- Build modules: `EXPERIMENTS/tpfigu-build/`

## Tokens (selected)

| Token | Value | Role |
|---|---|---|
| `--bg-0` | `#EBE8E2` | Page background |
| `--bg-1` / `--bg-2` | `#F6F3EE` | Surfaces |
| `--gold` | `#A07C38` | Accent |
| `--gold-2` | `#7E5F28` | Accent dark |
| `--text` | `#22252B` | Body text |
| `--font-brand` | Palatino / Georgia | Headings / brand |
| `--font-ui` | Segoe UI / system-ui | UI chrome |

## Base React primitives (P0-02)

| Component | Path | Demo classes |
|---|---|---|
| `Button` | `components/ui/Button.tsx` | `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, `.btn-gold` |
| `Input` | `components/ui/Input.tsx` | `.search-input` / form inputs |
| `Label` | `components/ui/Label.tsx` | form labels |
| `Card` | `components/ui/Card.tsx` | `.panel`, `.panel-head`, `.panel-body` |
| `Badge` | `components/ui/Badge.tsx` | `.badge`, status tones |
| `Avatar` | `components/ui/Avatar.tsx` | `.user-chip`, `.user-avatar` |
| `BrandMark` | `components/brand/BrandMark.tsx` | `.login-mark` |

## Next

- **P0-03:** Port sidebar + topbar app shell and module placeholder routes. ✅
- **P0-04:** Supabase + Railway env wiring.
- **P0-09:** Port full `#login-screen` layout for real auth.

## App shell routes (P0-03)

| Path | Module |
|---|---|
| `/dashboard` | Dashboard |
| `/clients` | Clients |
| `/matters` | Matters |
| `/documents` | Documents & Templates |
| `/calendar` | Calendar & Deadlines |
| `/billing` | Billing (fees) |
| `/trust` | Trust (client money) |
| `/staff` | Lawyers & Staff |
| `/reports` | Reports |
| `/ai` | AI Assistant |
| `/audit` | Audit Log |
| `/settings` | Settings |

`/` redirects to `/dashboard`.
