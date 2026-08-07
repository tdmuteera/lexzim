# Design reference — T Pfigu Attorneys demo

LexZim Phase 0+ UI must port this demo, not invent a new theme.

## Source files (on this machine)

| File | Role |
|---|---|
| `../../TPfigu_Attorneys_Law_Management_System.html` | Built single-file demo (open in browser) |
| `../../tpfigu-build/css.js` | CSS tokens and component styles |
| `../../tpfigu-build/body.js` | Login + app shell markup |
| `../../tpfigu-build/app.js` | Demo UI behaviour |
| `../../tpfigu-build/data.js` | Fake demo data (UI reference only until real seeds) |
| `../../tpfigu-build/build.js` | Builds the HTML from the modules above |

Absolute paths (Administrator desktop layout):

- `C:\Users\Administrator\Desktop\Projects\EXPERIMENTS\TPfigu_Attorneys_Law_Management_System.html`
- `C:\Users\Administrator\Desktop\Projects\EXPERIMENTS\tpfigu-build\`

## Porting plan

- **P0-02:** CSS variables and base primitives from `css.js`
- **P0-03:** Sidebar / topbar / view shell from `body.js`
- **P0-09:** Login screen from demo `#login-screen`
- Later phases: replace `data.js` with Supabase-backed data

Do not copy production secrets into this folder.
