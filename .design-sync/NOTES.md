# design-sync notes — Noiraé Design System

## What this repo is
NodeTexeure is a **Next.js app, not a component library** — no TypeScript, no
built `dist/`, no Storybook. The converter discovers **0 components** and
(correctly) treats it as a **tokens-only design system**: it ships `styles.css`
(the `--noirae-*` design tokens + the aesop stylesheet) with an empty
`_ds_bundle.js`. The app's React components are page-coupled (next/link,
next-auth, next/navigation, live fetches) and are not bundlable standalone, so
there is nothing to author previews for.

## Required setup for the converter (per clone)
The package isn't installed in its own `node_modules` (npm won't self-install),
so the converter can't resolve `pkg: "nodetexture"`. Create a self-symlink first:

    ln -sfn "$(pwd)" node_modules/nodetexture

Then run the converter with `--node-modules ./node_modules` (react is at the repo
root). **Remove the symlink after building** — a self-referential symlink under
node_modules can confuse `next build`; it's only needed during the converter run.

## Config choices
- `tokensPkg: "nodetexture"` + `tokensGlob: "src/styles/design-tokens.css"` — this
  is what pulls the 123 `--noirae-*` tokens into the closure (tokensGlob does
  nothing without tokensPkg).
- `cssEntry: src/styles/aesop-design-system.css` → `_ds_bundle.css` (the styling).
- `guidelinesGlob: []` — the repo's `docs/*.md` are eng docs (deployment,
  readiness checklist), not design guidance; excluded on purpose.

## Known render warns (non-blocking)
- `[TOKENS_MISSING]` (16 vars: `--noirae-color-background`, `--container-max-width`,
  `--space-24`, `--radius-md`, `--transition-slow`, `--shadow-base`, …) — these are
  **dead references inside aesop-design-system.css**, never defined in src/styles.
  The live token system is `--noirae-*` in design-tokens.css. Safe to ignore.

## Re-sync risks
- The self-symlink must be recreated on every fresh clone (it's under node_modules,
  gitignored) before running the converter.
- This stays tokens-only unless the repo grows a real component-library build
  (TS + dist). If that happens, revisit `shape`/`--entry`.
- `noirae-theme.css` (theme rules, 0 var defs) and page CSS (checkout, searchbar)
  are intentionally NOT in the closure — only tokens + aesop are.
