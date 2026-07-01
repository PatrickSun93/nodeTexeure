# Noiraé — Storefront & Admin Redesign

High-fidelity redesign of the storefront and admin for the `nodeTexeure` e‑commerce app,
built on the **"Champagne & Charcoal"** design direction. Every screen is a single,
self-contained HTML file that opens directly in a browser.

---

## How to view

Open any `*.dc.html` file in a browser. Each page loads its logic from the shared
`support.js` runtime that sits alongside it in this folder, so keep the files together.

- Fonts load from Google Fonts and product imagery from the Unsplash CDN, so an internet
  connection is needed for a pixel-perfect view.
- **Admin pages** include a *"Viewing as: Admin / Staff"* toggle in the top bar that
  demonstrates the role-based permission differences (only Admins can edit roles, manage
  promotions, edit email templates, change settings, etc.).
- Several pages are interactive (variant selection, cart quantities, review moderation,
  the live email-template editor, the email-queue retry, settings toggles).

---

## Design system

**Typography**
- `Cormorant Garamond` — display & headings
- `Jost` — body copy & UI
- `EB Garamond` (italic) — editorial pull-quotes

**Core palette**
| Role | Hex |
|---|---|
| Champagne base | `#F3EBDD` |
| Raised surface | `#F6EFE3` |
| Card / panel | `#FBF6EE` |
| Deep sand | `#EADFCB` |
| Primary ink | `#2A2621` |
| Body text | `#6A6156` |
| Muted text | `#9C9284` |
| Gold accent | `#A8863F` (light `#DCC08A`) |
| Admin sidebar | `#211E1A` |

**Semantic**
| Meaning | Text | Background |
|---|---|---|
| Positive / success | `#4A7A46` | `#DCEBD4` |
| Warning / pending | `#8C7A3F` | `#EFE3CD` |
| Error / danger | `#B5654D` | `#F3DED4` |
| Info / staff | `#4A5578` | `#DEE2EE` |

**Borders:** `#E2D6C1`, `#E7DBC6`, `#EEE4D3`

---

## Pages

**Storefront** — `Home`, `Shop`, `Product`, `Cart`, `Checkout`
**Account** — `Account`, `Orders`, `Wishlist`
**Auth** — `Login`, `Register`, `Forgot Password`
**Content** — `About`, `Contact`, `FAQ`, `Journal`, `Shipping Returns`, `Track Order`
**System** — `404`, `Unsubscribe`
**Admin** — `Admin Dashboard`, `Admin Orders`, `Admin Products`, `Admin Analytics`,
`Admin Revenue Drivers`, `Admin Reviews`, `Admin Promotions`, `Admin Email Templates`,
`Admin Email Queue`, `Admin Users & Roles`, `Admin Settings`

**Reference** — `Noiraé Design Audit` (the audit of the previous UI + rationale for this
redesign). Print / export to PDF for a shareable report.

**Runtime** — `support.js` (page logic), `doc-page.js` (paged-document shell used by the
audit). Do not edit.

---

## Notes before production

- **Imagery** is hot-linked from Unsplash (free to use) for the mockups. Replace with
  self-hosted, licensed assets before shipping.
- **Cross-page links**: the newer pages link by exact hyphen filename; a few of the
  earlier storefront pages use an en-dash filename variant in their `href`s. Normalise the
  filenames/links if you want every prototype link to be click-through.
- These are **design references**, not the production implementation — use them as the
  visual + interaction spec when building the real React/Next components.

---

## Adding to the repo

These files were prepared outside the repo. To commit them:

```bash
# from the repo root, with this folder placed at ./design
git add design
git commit -m "Add Noiraé storefront + admin redesign (Champagne & Charcoal)"
git push
```
