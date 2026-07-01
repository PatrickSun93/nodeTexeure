# Noiraé design system — conventions

Noiraé is the design language of a luxury silk & cashmere bedding storefront:
quiet, editorial, lots of whitespace, serif display type over a warm neutral
palette. This is a **tokens + stylesheet** design system (no importable React
components) — you build the UI yourself and dress it in these tokens and the
shipped component classes so every screen is on-brand.

## The styling idiom

Style through **CSS custom properties** (`var(--noirae-*)`), never hard-coded
values. The full stylesheet ships in the bound `styles.css` closure
(`tokens/design-tokens.css` defines the tokens; `_ds_bundle.css` holds the
component/section styles). Read those two files before styling — they are the
source of truth.

Two layers work together:
1. **Tokens** — the design language, as `--noirae-*` custom properties. Use them
   for every color, font, size, and spacing decision.
2. **Semantic classes** — the shipped stylesheet defines section/component classes
   (`noirae-*`, `aesop-*`) already wired to the tokens. Prefer these for common
   parts; when you write your own markup, style it with the tokens directly.

## Token vocabulary (real names — use `var(--…)`)

**Color**
- Surfaces: `--noirae-bg-white`, `--noirae-bg-cream` (warm page background),
  `--noirae-bg-light`, `--noirae-bg-overlay`
- Ink: `--noirae-charcoal` (primary dark), `--noirae-dark-charcoal`,
  `--noirae-text-primary`, `--noirae-text-secondary`, `--noirae-text-muted`,
  `--noirae-text-light`
- Accents (use sparingly): `--noirae-accent-gold`, `--noirae-accent-bronze`,
  `--noirae-accent-rose-gold`
- Borders: `--noirae-border-light`, `--noirae-border-medium`, `--noirae-border-dark`
- Status: `--noirae-error`, `--noirae-success`, `--noirae-info`

**Typography**
- Families: `--noirae-font-serif` (display / headings — the editorial voice),
  `--noirae-font-sans` (body, UI)
- Scale: `--noirae-text-xs`, `-sm`, `-base`, `-lg`, `-xl`, `-2xl` … through
  `-7xl` (hero display)

**Layout & shape**
- `--noirae-container-max-width`, `--noirae-container-padding`,
  `--noirae-grid-gap`, `--noirae-header-height`
- Components: `--noirae-button-height`, `--noirae-button-padding-x`,
  `--noirae-card-border-radius`, `--noirae-card-padding`, `--noirae-card-shadow`
- Breakpoints: `--noirae-breakpoint-sm` … `--noirae-breakpoint-2xl`

## Semantic classes (from `_ds_bundle.css`)

Reusable, already token-styled — read the stylesheet for the full set. Common ones:
`aesop-container` (page width wrapper), `noirae-btn-primary` (primary CTA button),
`noirae-product-card`, `noirae-price`, `noirae-hero`, plus section kits
`noirae-shop`, `noirae-collection`, `noirae-filter`, `aesop-cart`, `aesop-header`.
Grep `_ds_bundle.css` for a family before inventing your own class.

## Idiomatic snippet

```jsx
// A product card, styled entirely in the Noiraé language.
<article
  style={{
    background: 'var(--noirae-bg-white)',
    border: '1px solid var(--noirae-border-light)',
    borderRadius: 'var(--noirae-card-border-radius)',
    padding: 'var(--noirae-card-padding)',
    fontFamily: 'var(--noirae-font-sans)',
  }}
>
  <img src="/product.jpg" alt="" style={{ width: '100%', objectFit: 'cover' }} />
  <h3 style={{ fontFamily: 'var(--noirae-font-serif)', fontSize: 'var(--noirae-text-lg)', color: 'var(--noirae-charcoal)' }}>
    RND Cotton Bed Sheet Set
  </h3>
  <p style={{ color: 'var(--noirae-text-muted)' }}>$200.00</p>
  <button className="noirae-btn-primary">Add to Cart</button>
</article>
```

Rules of thumb: serif for display headings, sans for everything else; cream/white
surfaces with charcoal ink; accents are rare, gold-family only; generous
whitespace (`--noirae-container-padding`, `--noirae-grid-gap`).
