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

- **Create a note.** Click an empty spot on the board for a default-size note, or press, drag and
  release to draw one of the size you want (a dashed outline shows the draft). Very small drawings
  are raised to the minimum size.
- **Move a note.** Press and drag its top strip ("Move note"). The note stays inside the board.
- **Resize a note.** Drag the grip in its bottom-right corner.
- **Delete a note.** Drag it onto the trash strip under the board and release. The strip shows an
  open lid and "Release to delete" while the pointer is over it.
- **Cancel.** Press `Escape` during any drag to put everything back as it was.
- **Big boards scroll.** The board fills the window and grows (with scrollbars) to hold notes that
  sit beyond the visible area, so every note stays reachable at any window size or zoom level.
- **Autosave to localStorage (bonus III).** The default. Notes and the board title are saved
  automatically about 400 ms after the last change; there is no save button. Data is stored as
  `{ version, board }` under one key. If the stored data is unreadable it is copied to a backup key
  and the app starts with an empty board.
- **Async mock REST API (bonus V).** Add `?storage=api` to the URL to switch. A fake server
  (with 300-800 ms latency, its own storage key, and real-looking status codes) replaces
  localStorage behind the same interface. Add `?fail=0.3` to make 30% of requests fail with 503
  (any value from 0 to 1; invalid values are ignored). Failed parts are re-sent on the next save.

## Architecture

### Structure and state

- **Hand-written types first.** `src/domain/board.ts` defines `Board`, `Note`, `Rect` and the rest
  as `readonly` types. `NoteColor` is derived from the `NOTE_COLORS` tuple, so type and list cannot
  drift. `NoteId` is a string branded with a `unique symbol`; the only ways to get one are the
  `isNoteId` guard (UUID format) and `createNoteId()`.
- **Zod schemas are checked against the types.** `noteSchema` and `boardSchema` end in
  `satisfies z.ZodType<Note>` / `z.ZodType<Board>`, so a mismatch is a compile error. `.readonly()`
  on objects and arrays makes the inferred output match the `readonly` types, with no casts.
  Limits, duplicate-id and finite-number checks live in the schemas.
- **One config object per concern.** `src/domain/config.ts` (`noteConfig`, `boardConfig`) holds
  every limit and default; schemas, geometry, reducer and tests all read from it.
- **Pure reducer, past-tense events.** `boardReducer(state, action)` handles `noteCreated`,
  `noteMoved`, `noteResized`, `noteDeleted`, `noteBroughtToFront`, `noteTextChanged`,
  `noteColorChanged`, `titleChanged` and `boardLoaded` in an exhaustive `switch` ending in
  `assertNever`. Move and resize carry the final absolute rect, so pointer and (later) keyboard
  input produce the same action. Unknown ids and no-change actions return the same state object.
- **Z-order is a counter** (`z`), not array position: bring-to-front sets `z = max + 1`, and
  `boardLoaded` compacts z to `1..n`. The array order, and so DOM and Tab order, never changes.
- **Ids come in on actions.** The reducer never calls `crypto` or the clock, so the same
  state and action always give the same result, and tests need no mocks.
- **Async repository interface.** `BoardRepository` has `load()` and `save(board)` for the whole
  board. Both resolve to discriminated unions (`loaded | empty | corrupt | failed`, and
  `saved | failed`) and never throw. Storage is injected as a small `KeyValueStorage` type, so
  tests use an in-memory fake and a throwing `localStorage` (quota, private mode) becomes a
  `failed` result.
- **Versioned envelope and corrupt-data backup.** Data is stored as `{ version: 1, board }`; the
  Zod schema reuses `boardSchema`. Anything that fails to parse or validate is copied, untouched,
  to `<key>:corrupt-backup` (an existing backup is never overwritten) and `load` returns
  `corrupt`, so autosave cannot destroy the only copy.
- **Mock REST server with diff-based CRUD.** `createMockServer` serves `GET/PATCH /board` and
  `POST/PATCH/DELETE /notes`, with random latency and failure rate (both injected, so tests are
  deterministic) and JSON round trips on every body. `createMockApiRepository` remembers the board
  the server last acknowledged and, on each save, sends only the difference: `POST` for a new
  note, `PATCH` for a changed one (including `z`), `DELETE` for a removed one, `PATCH /board` for
  a new title. The remembered board is updated per successful request, so after a partial failure
  the next save re-sends exactly what failed.
- **Save scheduler.** `createSaveScheduler` is plain TypeScript with no React. It keeps only the
  latest board, debounces, and runs one save at a time: changes made during a save are merged
  into one follow-up save of the newest board, so responses cannot arrive out of order and the
  last board always wins. Its status is a union (`idle | pending | saving | saved | error`).
  `useBoardPersistence` is a thin hook over it: it loads once, then schedules every board change,
  and flushes on `pagehide`. `selectRepository` picks the repository from the URL query.

### Interaction model

- **`src/interaction/drag.ts` is a pure state machine** for pointer gestures. `DragState` is a
  union on `kind`: `idle`, `creating`, `moving`, `resizing`. Inputs are plain board-relative points,
  outputs are plain data; no React, no DOM.
- **Transitions:** `startCreating` / `startMoving` / `startResizing` begin a gesture, `update` sets
  the current point (and `overTrash` while moving), `finish` returns the `BoardAction` to dispatch
  or `null`, and `cancel` goes back to `idle` (Escape, `pointercancel`, lost capture).
- **Commit on release only.** While dragging, `previewRect(state, board)` gives the rect to draw,
  and it is the same rect `finish` commits. Nothing reaches the reducer until `finish`.
- **Click vs drag** is decided from `origin` and `current` with `dragConfig.threshold` (4 px), not
  stored. A click on empty board creates a default-size note, a click on a header or handle does
  nothing.
- **Actions carry the final absolute rect**, clamped to the board with the geometry helpers. Trash
  is an input (`overTrash`); it only matters while moving, where it turns the release into
  `noteDeleted`. Note ids come from an injected `newNoteId`, called only when a note is created.
- Covered by unit tests in `drag.test.ts`.
- **React wiring (`useDragController`).** One hook owns the `DragState` (in React state, plus a
  ref copy so handlers see the latest value at once) and calls only the pure functions above.
  A press on the empty canvas, a note's "Move note" button or its resize button calls
  `setPointerCapture` on that element, so move and up events keep arriving even when the pointer
  leaves it (for example over the trash). Pointer moves are only stored; one
  `requestAnimationFrame` per frame turns the latest one into a single state update. On release the
  exact release position is used, `finish` gives the action and it is dispatched once.
  `pointercancel`, `lostpointercapture` and `Escape` (a `window` listener that exists only during a
  gesture) call `cancel()` and dispatch nothing. Listeners and the pending frame are removed when
  the gesture ends or the component unmounts.
- **Coordinates.** Pointer positions are `clientX/Y` minus the canvas rect taken at pointer-down
  (which already accounts for scrolling). The board size given to the drag logic is the canvas size
  at that moment and stays frozen for the whole gesture. The trash hit test compares the pointer
  with the trash strip's `getBoundingClientRect()`; the strip sits below the board, outside its
  rect, so a clamped note can never overlap it.

### Performance and trade-offs

- **Only the dragged note re-renders.** `Note` is wrapped in `React.memo`. While dragging, the
  hook's state changes once per frame, so `Board` renders, but each idle note receives identical
  props: the same `note` object from the reducer, `previewRect={undefined}`, `overTrash={false}`
  and the same two `useCallback` handlers (which read the current notes through a ref). Only the
  dragged note gets a new `previewRect`. Nothing is dispatched to the reducer until release.
- **Why DOM and not canvas.** A note is text, two real buttons and a focusable, labelled element:
  the browser gives us text layout, wrapping, focus rings, tab order, screen-reader semantics and
  zoom for free. A canvas would need all of that rebuilt by hand, for a board with a handful of
  rectangles. Notes are positioned with `left/top/width/height`, which is cheap at this size.


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
- **Board UI (step 6).**
  - Landmarks: a `header` with the `h1` board title, a `main` with the board, and a `section`
    labelled "Trash". On a 1024×768 screen (about a 1024×650 viewport once browser chrome is subtracted) the page has no scrollbar; the board itself has no fixed size, fills the remaining space and scrolls on its own. Checked at 1024×650 and at 200% zoom (512×325 CSS px).
  - Every note has two real `<button>`s ("Move note" and "Resize note"), at least 24x24 px, with
    the shared 2px focus ring drawn inside the note so it is never clipped. Targets are not
    removed from the tab order. Keyboard dragging is not implemented yet (see MVP+1).
  - The trash state is never only a color: idle is a dashed border, while a move is in progress it
    turns solid, and with the pointer over it the icon changes (open lid), the label changes to
    "Release to delete" and the text is bold. The dragged note gets a dashed outline and reduced
    opacity.
  - The board is a scroll container, so at 200% zoom nothing is cut off. Transitions and
    animations are already off under `prefers-reduced-motion`; the board adds none.
  - Notes use `--color-text` on the note color and the existing `--color-*` tokens for borders,
    the draft outline and the trash; no new color values were added.
- `src/styles/base.css` sets the body colors and font, a 2px `--color-focus` ring with 2px offset
  on every `:focus-visible` element, and turns off transitions and animations under
  `prefers-reduced-motion: reduce`.

## Project structure

```
src/
  main.tsx      App entry point
  App.tsx       Page layout: header, main, and the board reducer
  components/   Board (scroll container, notes, draft outline, trash), Note, TrashZone, CSS
  domain/       Pure TypeScript model: types, Zod schemas, geometry, reducer, config (no React/DOM)
  styles/       Global CSS: color tokens (tokens.css), element defaults (base.css),
                contrast math (contrast.ts) and its test
  interaction/  Pure drag state machine (create, move, resize) and its tests (no React/DOM),
                and useDragController, the hook that wires pointer events to it
  persistence/  Async BoardRepository, localStorage and mock-API implementations, save scheduler,
                and the React hook that loads and autosaves the board
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
- **The board has no fixed size.** Its logical size is the larger of the visible area and the
  furthest note edge, measured with a `ResizeObserver`. Drags clamp to the size measured at
  pointer-down. After a window shrinks, notes that now lie outside are kept where they are and
  reached by scrolling, never moved.
- **Only the primary button starts a gesture**, and only one gesture runs at a time (a second
  pointer is ignored). Creating a note needs the press to land on the empty canvas itself.
- **The drag kind is written to `<html data-dragging>`** while a gesture passes the drag
  threshold, so cursor and `user-select: none` rules apply to the whole page. It is removed when
  the gesture ends.
- **The board title is read-only and nothing is saved yet** in this step; the persistence hook
  exists but is not connected until the note-features step.
- **Note labels** are "Note: " plus the first five words of the text, or "Empty note".
- **Note ids are UUIDs** (any version, case-insensitive), as made by `crypto.randomUUID()`.
- **`noteCreated` with an id that already exists is ignored** (same state), to keep ids unique.
- **Text and title are cut by `slice`**, which counts UTF-16 units, so an emoji at the limit
  can be split. Schemas count the same way, so they agree.
- **The reducer does not clamp to the board.** Callers clamp with `clampRectToBoard` before
  dispatching, so the reducer never needs the board size. Width/height minimums are enforced in
  the reducer, but x/y are not limited.
- **`pointInRect` includes the edges.**
- **A drag starts when the pointer has moved at least `dragConfig.threshold`** (straight-line
  distance, `>=`).
- **`previewRect` is `null` below the threshold for all three gestures**, not only create, so
  a click never shows a ghost. Over the trash, a move below the threshold still deletes.
- **Resize near the board edge:** the edge limit is applied first and the minimum size after, so
  a note whose corner is within the minimum size of the edge may extend past it.
- **The contrast test imports `tokens.css` with Vite's `?raw` suffix** instead of `node:fs`, so
  it needs no Node types and app code cannot type-check against Node-only globals like `process`.
  Vitest replaces CSS with an empty string by default, so `vite.config.ts` sets
  `test.css.include` to `tokens.css`.
- **A failed load still starts an empty board and keeps autosave on.** For `corrupt` data the
  backup protects the original. For a `failed` load (for example the network is down), later saves
  may overwrite the title and notes the server already had; the user sees an error message.
- **The mock API cannot back up corrupt server data.** A response that fails validation is
  reported as `corrupt` with no backup, since the client owns no copy. The mock server itself
  answers 500 for its own corrupt storage.
- **`GET /board` answers 404 until the first write**, which the client reads as `empty`.
- **A 404 on `DELETE` counts as success**: the note is already gone.
- **`useBoardPersistence` skips the board it starts with and the loaded board by reference.** If the
  caller rebuilds the loaded board (for example `boardLoaded` renumbers `z`), that one new board is
  saved once; the cost is a single extra save.
- **After a failed save there are no retry timers**; the next change tries again. With the mock
  API the unconfirmed requests are re-sent then, with localStorage the whole board is.

## MVP+1: what's next and where I cut corners

- **Keyboard and button alternatives for dragging.** Cut to stay in the time box; today create,
  move and resize need a pointer. The move and resize handles are already real `<button>`s with
  names, and move/resize actions carry absolute rects, so keyboard handlers can dispatch the same
  `noteMoved` / `noteResized` actions without changing the reducer or the layout.
- **Auto-scroll while dragging near the board edge.** Cut: the board size is frozen for a gesture,
  so a long move across a scrolled board needs the user to scroll first. It would add a scroll
  step inside the existing per-frame update.
- **Dark mode.** Cut to stay in the time box; the app ships a light theme only. Because every
  token is named by role and derived from `--color-primary`, dark mode is one
  `@media (prefers-color-scheme: dark)` block in `tokens.css` that redefines the derived tokens
  with inverted lightness steps, plus a `pnpm contrast` run to prove the new pairs.
- **Undo/redo.** Cut: not needed for the core features. State changes are already small events on
  a pure reducer with absolute rects, so undo can be added as a history of previous states plus a
  `noteRestored` action (for deleted notes) without changing existing actions.
- **Retry with back-off and an offline queue.** Cut: autosave only retries on the next change.
  The scheduler already has one place that handles a save result, so a retry timer is a small
  addition there, and the mock API repository already keeps unconfirmed work between saves.
- **Cross-tab sync and conflict handling.** Cut: two tabs overwrite each other (last write wins).
  The versioned envelope leaves room for a revision number, and the `storage` event could feed
  `boardLoaded`.
- **Schema migrations.** Cut: only version 1 exists. The envelope's `version` field is checked
  strictly now; a migration step would sit between parsing the version and validating the board.
