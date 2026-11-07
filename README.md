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

<!-- Color tokens derived from one base green, contrast checks (CONTRAST.md), WCAG coverage. -->

## Project structure

```
src/
  main.tsx      App entry point
  App.tsx       Page layout
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

## MVP+1: what's next and where I cut corners

<!-- Every deliberate time-box cut, why, and how the design prepares for it. -->
