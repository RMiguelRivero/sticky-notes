# Sticky Notes

A single-page sticky-notes board built with React and TypeScript, without UI or drag-and-drop
libraries.

## Getting started

Requirements:

- Node.js **24.18.1** (pinned in `package.json` and `.nvmrc`; run `nvm use` if you use nvm)
- pnpm **12.4.2** (pinned through `packageManager`; `corepack enable` picks it up)

```bash
pnpm install
pnpm dev
```

Then open the URL Vite prints (by default http://localhost:5173).

| Command          | What it does                                                   |
| ---------------- | -------------------------------------------------------------- |
| `pnpm dev`       | Start the dev server                                           |
| `pnpm build`     | Type-check and build for production into `dist/`               |
| `pnpm preview`   | Serve the production build locally                             |
| `pnpm test`      | Run the unit tests once (Vitest)                               |
| `pnpm typecheck` | Type-check the project (`tsc -b`)                              |
| `pnpm lint`      | Lint with Biome                                                |
| `pnpm format`    | Format with Biome                                              |
| `pnpm check`     | Everything CI would run: Biome, type-check, tests, build       |
| `pnpm contrast`  | Recompute color contrast from the tokens and write `CONTRAST.md` |

## Features

<!-- Filled in step by step: core features, bonuses, and how to use each. -->

## Architecture

### Structure and state

<!-- Domain model, reducer, persistence. -->

### Interaction model

<!-- Drag state machine and how React wires it up. -->

### Performance and trade-offs

<!-- What keeps drags cheap; DOM vs canvas. -->

## Accessibility and color system

- **One base color.** `--color-primary: oklch(0.55 0.13 150)` in `src/styles/tokens.css` is the
  only hand-picked app color. Every other `--color-*` token (surfaces, borders, text, accent
  states, focus, danger) is derived from it with CSS relative color syntax, e.g.
  `oklch(from var(--color-primary) 0.25 0.03 h)`: the hue is kept (or rotated by `-125` to red for
  danger), and each role sets its own lightness and chroma. Lightness carries the contrast, and
  chroma stays low enough that every token is inside the sRGB gamut.
- **Named by role, not hue** (`--color-text-muted`, `--color-accent-hover`), so changing the base
  green re-themes the whole app.
- **Deliberate exception: note colors.** `--note-yellow` (default), `--note-pink`, `--note-blue`
  and `--note-orange` are content the user picks by hue, not theme, so they are fixed `oklch()`
  literals named by color. All four share lightness 0.94, with chroma near the sRGB limit for each
  hue. Notes reuse `--color-text` and `--color-border`.
- **Contrast is proven, not eyeballed.** `src/styles/contrast.ts` evaluates the token formulas the
  way the browser does, converts OKLCH to sRGB and computes the WCAG ratio. A unit test fails on
  any pair below its threshold or any token out of gamut, and `pnpm contrast` writes
  [CONTRAST.md](CONTRAST.md): all 34 checked pairs pass (text 4.57:1 to 15.84:1, including text on
  every note color; borders, focus ring, accent and danger at least 3.22:1).
- `src/styles/base.css` sets the body colors and font, a 2px `--color-focus` ring with 2px offset
  on every `:focus-visible` element, and turns off transitions and animations under
  `prefers-reduced-motion: reduce`.

## Project structure

```
src/
  main.tsx      App entry point
  App.tsx       Page layout
  styles/       Global CSS: color tokens (tokens.css), element defaults (base.css),
                contrast math (contrast.ts) and its test
scripts/
  contrast.ts   Writes CONTRAST.md from the tokens (`pnpm contrast`)
```

## Tooling and assumptions

- **TypeScript in strict mode**, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
  and `noImplicitReturns`.
- **Biome** is the only formatter and linter. Besides its recommended rules, `any`, non-null
  assertions (`!`) and missing hook dependencies are errors.
- **Vitest** runs in a Node environment: the tests cover pure TypeScript logic, not rendered
  components.
- **Supply-chain guard:** `pnpm-workspace.yaml` refuses any package version published less than
  3 days ago (`minimumReleaseAge`, strict), and pnpm refuses to install on any Node version other
  than the pinned one.
- **Contrast is computed on unrounded sRGB values**, with WCAG 2.x relative luminance. Ratios in
  `CONTRAST.md` are truncated (not rounded) to 2 decimals, so a value shown as passing really
  passes. Relative color syntax needs current Chrome, Edge (119+) and Firefox (128+); no fallback
  is provided for older browsers.
- **`--color-border` is meant for note borders and control outlines** and is the lightest line
  that keeps 3:1 on every surface and note color; `--color-border-strong` is for emphasis.
- **Accent hover and active set their own chroma** (0.11 and 0.09) instead of keeping the
  primary's, so the darker states stay inside sRGB for more base greens. A base green that is
  itself very saturated can still push a token out of gamut; the test then fails and names it.
- **The contrast test imports `tokens.css` with Vite's `?raw` suffix** instead of `node:fs`, so
  it needs no Node types and app code cannot type-check against Node-only globals like `process`.
  Vitest replaces CSS with an empty string by default, so `vite.config.ts` sets
  `test.css.include` to `tokens.css`.

## MVP+1: what's next and where I cut corners

- **Dark mode.** Cut to stay in the time box; the app ships a light theme only. Because every
  token is named by role and derived from `--color-primary`, dark mode is one
  `@media (prefers-color-scheme: dark)` block in `tokens.css` that redefines the derived tokens
  with inverted lightness steps, plus a `pnpm contrast` run to prove the new pairs.
