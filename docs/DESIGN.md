# Design — "Champagne & Charcoal"

The Noiraé storefront's visual language: quiet, editorial, luxury. Lots of
whitespace, serif display type over a warm champagne palette, gold used sparingly.
The full high-fidelity mockups for every screen live in [`../design/`](../design/)
(open the `.dc.html` files in a browser).

## Typography

| Role | Font |
|------|------|
| Display / headings | **Cormorant Garamond** (serif) |
| Body / UI | **Jost** (sans) |
| Editorial pull-quotes | **EB Garamond** (italic) |

Loaded via `next/font` in `src/app/layout.js`; referenced through the tokens
`--noirae-font-serif` / `--noirae-font-sans` / `--noirae-font-editorial`.

## Palette (light)

| Role | Token | Hex |
|------|-------|-----|
| Champagne base (page) | `--noirae-bg-cream` | `#F3EBDD` |
| Raised surface | `--noirae-bg-light-gray` | `#F6EFE3` |
| Card / panel | `--noirae-bg-white` | `#FBF6EE` |
| Deep sand | `--noirae-bg-sand` | `#EADFCB` |
| Primary ink / text | `--noirae-text-primary` / `--noirae-charcoal` | `#2A2621` |
| Body text | `--noirae-text-secondary` | `#6A6156` |
| Muted text | `--noirae-text-muted` | `#9C9284` |
| Gold accent | `--noirae-accent-gold` | `#A8863F` |
| Borders | `--noirae-border-light / -medium / -dark` | `#EEE4D3 / #E7DBC6 / #E2D6C1` |

Semantic (text / soft bg): success `#4A7A46`/`#DCEBD4`, warning `#8C7A3F`/`#EFE3CD`,
error `#B5654D`/`#F3DED4`, info `#4A5578`/`#DEE2EE`.

## How theming works

Everything styles through the `--noirae-*` custom properties in
`src/styles/design-tokens.css`. Because of that, **one block re-skins the whole
app** — there is no per-component color.

- **Light** is the `:root` default (champagne).
- **Dark** ("Charcoal & Candlelight") is a `[data-theme='dark']` block that flips
  the semantic tokens to warm espresso surfaces + champagne text. Toggle in the
  header (`src/components/ThemeToggle.js`, persisted to `localStorage`); a no-flash
  script in `layout.js` applies the saved theme before first paint.

### Using the design (for contributors)
- Never write a raw hex or a Tailwind gray utility. Use a token:
  `style={{ background: 'var(--noirae-bg-white)', color: 'var(--noirae-charcoal)' }}`
  or the shipped `noirae-*` / `aesop-*` classes.
- Serif for display headings, Jost for everything else. Gold is an accent, not a
  fill. Keep generous whitespace.
- New surfaces get their color from a token so dark mode works for free.

## Imagery

Product/collection imagery is real (not gray placeholders): stored in the
`product_images` table and served from `public/images/bedding/`. The
`/api/placeholder/[w]/[h]?seed=<id>` route resolves any remaining placeholder slot
to a real bedding photo, stable per seed.
