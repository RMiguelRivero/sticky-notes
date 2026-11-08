# Sticky Notes

A single-page sticky-notes board built with React and TypeScript, without UI or drag-and-drop
libraries. All 4 core features and all 5 bonuses are implemented.

**Live demo:** https://sticky-notes-five-psi.vercel.app/ (add `?storage=api` to try the async
mock REST API, and `&fail=0.3` to make 30% of its requests fail).

**Where to find what the grading covers:**

- Architecture and design: [Architecture](#architecture), [Project structure](#project-structure)
- Performance: the third paragraph of [Architecture](#architecture)
- Code quality and static typing: [Architecture](#architecture) and
  [Tooling and assumptions](#tooling-and-assumptions) (strict TypeScript, no `any`, no casts,
  Zod schemas checked against hand-written types, 231 unit tests)
- Usability: [Features](#features) and [Accessibility and color system](#accessibility-and-color-system)
- What I left out and why: [MVP+1](#mvp1-whats-next-and-where-i-cut-corners)

## Getting started

Requirements:

- Node.js **24.18.1** (pinned in `package.json` and `.nvmrc`; run `nvm use` if you use nvm)
- pnpm **12.4.2** (pinned through `packageManager`; `corepack enable` picks it up)

```bash
pnpm install
pnpm dev
```

Then open the URL Vite prints (by default http://localhost:5173).

| Command          | What it does                                                     |
| ---------------- | ---------------------------------------------------------------- |
| `pnpm dev`       | Start the dev server                                             |
| `pnpm build`     | Type-check and build for production into `dist/`                 |
| `pnpm preview`   | Serve the production build locally (http://localhost:4173)       |
| `pnpm test`      | Run the unit tests once (Vitest)                                 |
| `pnpm test:coverage` | Run the tests with a coverage report (text, plus HTML in `coverage/`) |
| `pnpm typecheck` | Type-check the project (`tsc -b`)                                |
| `pnpm lint`      | Lint with Biome                                                  |
| `pnpm format`    | Format with Biome                                                |
| `pnpm check`     | Everything CI would run: Biome, type-check, tests, build         |
| `pnpm contrast`  | Recompute color contrast from the tokens and write `CONTRAST.md` |

## Features

Everything is used with the mouse; there are no save buttons.

Core features (all 4):

- **Create a note at a given position and size.** Press on an empty spot of the board, drag and
  release to draw the note (a dashed outline shows the draft). A plain click adds a default-size
  (200×200) note with its top-left corner at the click. Very small drawings are raised to the minimum size (120×90).
- **Resize by dragging.** Drag the grip in the note's bottom-right corner.
- **Move by dragging.** Press and drag the note's top strip ("Move note"). The note stays inside
  the board.
- **Delete by dropping on the trash.** Move a note onto the trash strip under the board and
  release. While a note is moving the strip turns solid; with the pointer over it, it shows an
  open lid and "Release to delete".

Bonuses (all 5):

- **I. Text editing.** Click into a note's body and type; it is always an editable text area
  (2000 characters max). Only the top strip and the resize grip start drags, so selecting text
  never moves a note.
- **II. Bring to front.** Pressing anywhere on a note raises it above the others.
- **III. localStorage.** The default. Notes and the board title are saved automatically about
  400 ms after the last change. Data is stored as `{ version, board }` under one key. If the stored
  data is unreadable it is copied to a backup key and the app starts with an empty board.
- **IV. Note colors.** Each note has four swatches at the bottom (yellow, pink, blue, orange);
  click one. The chosen one gets a check mark and a thicker border.
- **V. Async mock REST API.** Add `?storage=api` to the URL to switch. A fake server (300–800 ms
  latency, its own storage key, real-looking status codes) replaces localStorage behind the same
  interface. Add `?fail=0.3` to make 30% of requests fail with 503 (values outside 0–1 are clamped,
  non-numbers ignored). Failed parts are re-sent on the next save.

Also:

- **Editable board title.** Click the title in the header (an input styled like the heading) and
  type; it autosaves (debounced), and leaving the field trims it and saves at once.
- **Cancel a drag.** Press `Escape` during any drag to put everything back as it was.
- **Big boards scroll.** The board fills the window and grows (with scrollbars) to hold notes that
  sit beyond the visible area, so every note stays reachable at any window size or zoom level.
- **Save status.** The header shows "Loading…", "Saving…", "All changes saved" or the error
  ("Couldn't save: ...", in the danger color and in words).

## Supported environment

- Desktop, minimum **screen** resolution 1024×768. With browser chrome that leaves about a
  1024×650 viewport, and the layout fits it with no page scrollbar. This is a screen size, not a
  board size: the board has no fixed size.
- Latest Chrome, Firefox and Edge.
- **Tested by hand** in Chrome 157, Firefox 159 and Edge 157, each at 200% zoom, plus a 1024×650
  viewport in Brave 1.98 (Chromium 156), my everyday browser.
- **Also checked in Safari 26.6**, outside the required browsers, with the same result.

## Architecture

The code is split into layers with one direction of dependency. `src/domain` is pure TypeScript
with no React or DOM: hand-written `readonly` types (`Board`, `Note`, `Rect`; `NoteColor` derived
from the `NOTE_COLORS` tuple; `NoteId` a string branded with a `unique symbol`, obtainable only
through the `isNoteId` UUID guard or `createNoteId()`), Zod schemas that end in
`satisfies z.ZodType<Note>` / `z.ZodType<Board>` so any drift from the types is a compile error,
geometry helpers, and all limits and defaults in `config.ts`. State has one source of truth: a pure
`boardReducer` over past-tense events (`noteCreated`, `noteMoved`, `noteResized`, `noteDeleted`,
`noteBroughtToFront`, `noteTextChanged`, `noteColorChanged`, `titleChanged`, `boardLoaded`) in an
exhaustive `switch` ending in `assertNever`. Ids come in on actions, so the reducer never calls
`crypto` or the clock and tests need no mocks; unknown ids and no-change actions return the same
state object. Move and resize carry the final absolute rect, so pointer input today and keyboard
input later produce the same action. Z-order is a counter (`z`, bring-to-front sets `max + 1`,
`boardLoaded` compacts it to `1..n`), so array, DOM and Tab order never change.

Pointer gestures are a pure state machine in `src/interaction/drag.ts`: `DragState` is a union
(`idle | creating | moving | resizing`), `update` takes board-relative points and an `overTrash`
flag, `previewRect` gives the rect to draw, and `finish` returns the one `BoardAction` to dispatch
(the same rect as the preview; a move released over the trash becomes `noteDeleted`) or `null`.
A click and a drag are told apart by a 4 px threshold. The `useDragController` hook is the only
React wiring: it calls `setPointerCapture` on the pressed element, turns pointer moves into at most
one state update per `requestAnimationFrame`, and cancels on `Escape`, `pointercancel` or lost
capture; nothing reaches the reducer until release. Persistence sits behind an async
`BoardRepository` (`load()` / `save(board)`) whose results are discriminated unions
(`loaded | empty | corrupt | failed`, `saved | failed`) and never throw. The localStorage version
stores a versioned envelope and backs up unreadable data to `<key>:corrupt-backup` before anything
can overwrite it. The mock API version talks to an in-memory REST server (`GET/PATCH /board`,
`POST/PATCH/DELETE /notes`, injected latency and failure rate, JSON round trips) and sends only the
diff from the board the server last acknowledged, so after a partial failure the next save re-sends
exactly what failed. A plain-TypeScript save scheduler debounces, keeps only the latest board and
runs one save at a time, so responses cannot arrive out of order; `useBoardPersistence` is a thin
hook over it that loads once and flushes on `pagehide`. Storage is injected (`KeyValueStorage`), so
tests use in-memory fakes.

Performance: during a drag only the dragged note re-renders. `Note` is `React.memo`, and idle notes
get identical props every frame: the same `note` object from the reducer, `previewRect={undefined}`,
`overTrash={false}`, the stable `dispatch`, and the same two `useCallback` handlers (which read the
current notes through a ref). Notes are DOM elements positioned with `left/top/width/height`, not a
canvas, because a note is text plus real buttons: the browser then provides text layout, focus,
tab order, screen-reader semantics and zoom for free, which a canvas would have to rebuild for a
board of a handful of rectangles. Typing updates the reducer on every keystroke so the screen always
shows what was typed, and only the save is debounced (400 ms), so a burst of typing is one write.
Debouncing `onChange` itself would need local state per input kept in sync with the reducer, could
lose the last characters and would make "Saving…" lag, for the gain of skipping re-renders of one
memoized note; if profiling ever showed a cost, the fix is a debounced hook with local state and a
flush on blur.

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
- **Landmarks and layout.** A `header` with the `h1` board title, a `main` with the board, and a
  `section` labelled "Trash". The board is its own scroll container, so at 200% zoom (512×325 CSS
  px) nothing is cut off.
- **Real buttons.** Every note has two `<button>`s ("Move note" and "Resize note"), at least
  24×24 px, with the shared 2px focus ring drawn inside the note so it is never clipped. They stay
  in the tab order. Keyboard dragging is not implemented yet (see MVP+1).
- **Never color alone.** The trash is a dashed border when idle, solid while a move is in progress,
  and with the pointer over it the icon changes (open lid), the label changes to "Release to delete"
  and the text is bold. The dragged note gets a dashed outline and reduced opacity. Errors use the
  danger color plus words.
- **One live region.** The header status is a `<p role="status">` (implicit `aria-live="polite"`)
  and is the only live region. It announces "Loading…", "Saving…", "All changes saved" and
  "Couldn't save: <reason>". A load error stays visible until a save error replaces it, so a later
  "saved" never suggests the lost data is safe. It is a plain component taking a status, so note
  announcements can feed the same element later.
- **Accessible names.** Title input "Board title"; note text area "Note text"; color group "Note
  color" (visually hidden legend) with radios "Yellow", "Pink", "Blue", "Orange". Swatches are
  24×24, with the selection shown by a check mark and a thicker border. Each note is an `article`
  labelled "Note: " plus the first five words of its text (with "…" if longer), or "Empty note".
- `src/styles/base.css` sets a 2px `--color-focus` ring with 2px offset on every `:focus-visible`
  element and turns off transitions and animations under `prefers-reduced-motion: reduce`.

## Project structure

```
src/
  main.tsx      App entry point
  App.tsx       Page layout: header, main, the board reducer and persistence wiring
  components/   Board (scroll container, notes, draft outline, trash), Note, TrashZone,
                BoardTitle (editable h1), ColorPicker (radio swatches), StatusBar (live region), CSS
  domain/       Pure TypeScript model: types, Zod schemas, geometry, reducer, config (no React/DOM)
  interaction/  Pure drag state machine (create, move, resize) and its tests (no React/DOM),
                and useDragController, the hook that wires pointer events to it
  persistence/  Async BoardRepository, localStorage and mock-API implementations, mock server,
                save scheduler, and the React hook that loads and autosaves the board
  styles/       Global CSS: color tokens (tokens.css), element defaults (base.css),
                contrast math (contrast.ts) and its test
  utils/        assertNever and an XOR type helper for exclusive unions
scripts/
  contrast.ts   Writes CONTRAST.md from the tokens (`pnpm contrast`)
```

## Tooling and assumptions

- Built with Claude Code as a pair programmer: I wrote the specs and rules for each step,
  reviewed every change, and made the design decisions.
- **Vercel Web Analytics** (cookieless, anonymous) is enabled on the deployed demo through a
  two-line script in `index.html`, with no npm dependency. Locally the script is simply not found
  (404), which has no effect on the app.
- About 6 hours in total, including planning. I stopped at the 6-hour limit the assignment sets;
  the MVP+1 section lists what I deferred.
- **TypeScript in strict mode**, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
  and `noImplicitReturns`. No `any`, no `as` casts, no non-null `!`.
- **Biome** is the only formatter and linter. Besides its recommended rules, `any`, non-null
  assertions (`!`) and missing hook dependencies are errors.
- **Vitest** runs in a Node environment: the tests cover pure TypeScript logic (domain, drag state
  machine, persistence, contrast), not rendered components.
- **Coverage** (`pnpm test:coverage`, `@vitest/coverage-v8`): the logic modules (everything except
  React components, `App.tsx` and the two React hooks) are at 96.5% statements, 91.9% branches
  and 100% functions; most uncovered lines are the unreachable `assertNever` defaults. Counting
  every source file, including the untested React layer, the total is 64% statements.
- **Supply-chain guard:** `pnpm-workspace.yaml` refuses any package version published less than
  3 days ago (`minimumReleaseAge`, strict), and pnpm refuses to install on any Node version other
  than the pinned one.
- **Contrast is computed on unrounded sRGB values**, with WCAG 2.x relative luminance. Ratios in
  `CONTRAST.md` are truncated (not rounded) to 2 decimals, so a value shown as passing really
  passes. Relative color syntax needs current Chrome, Edge (119+), Firefox (128+) and Safari
  (18+); no fallback is provided for older browsers.
- **`--color-border` is meant for note borders and control outlines** and is the lightest line
  that keeps 3:1 on every surface and note color; `--color-border-strong` is for emphasis.
- **Accent hover and active set their own chroma** (0.11 and 0.09) instead of keeping the
  primary's, so the darker states stay inside sRGB for more base greens. A base green that is
  itself very saturated can still push a token out of gamut; the test then fails and names it.
- **The board has no fixed size.** Its logical size is the larger of the visible area and the
  furthest note edge, measured with a `ResizeObserver`. Drags clamp to the size measured at
  pointer-down, which stays frozen for the gesture. After a window shrinks, notes that now lie
  outside are kept where they are and reached by scrolling, never moved.
- **Coordinates** are `clientX/Y` minus the canvas rect taken at pointer-down (which already
  accounts for scrolling). The trash hit test uses the trash strip's `getBoundingClientRect()`; the
  strip sits below the board, so a clamped note can never overlap it.
- **Only the primary button starts a gesture**, and only one gesture runs at a time (a second
  pointer is ignored). Creating a note needs the press to land on the empty canvas itself; a click
  on a note's strip or grip does nothing.
- **The drag kind is written to `<html data-dragging>`** once a gesture passes the drag threshold, so cursor and
  `user-select: none` rules apply to the whole page.
- **Autosave flushes immediately** when the title field loses focus and on `pagehide`. The note
  text area relies on the 400 ms debounce.
- **The title is saved untrimmed while typing** (trimming on every change would strip the space
  just typed) and trimmed on blur.
- **At the minimum note width (120 px)** the four 24 px swatches overlap the resize grip by about
  2 px; the grip is drawn on top.
- **`dispatch` is passed as a prop, not through a context.** The tree is at most three levels deep
  and every component that receives it calls it, so nothing only forwards it. It is a stable
  reference, so memoized notes are unaffected. If components that only forward it appear, a
  `DispatchContext` is the next step.
- **Note ids are UUIDs** (any version, case-insensitive), as made by `crypto.randomUUID()`.
- **`noteCreated` with an id that already exists is ignored** (same state), to keep ids unique.
- **Text and title are cut by `slice`**, which counts UTF-16 units, so an emoji at the limit
  can be split. Schemas count the same way, so they agree.
- **The reducer does not clamp to the board.** Callers clamp with `clampRectToBoard` before
  dispatching, so the reducer never needs the board size. Width/height minimums are enforced in
  the reducer, but x/y are not limited.
- **`pointInRect` includes the edges.** A drag starts when the pointer has moved at least
  `dragConfig.threshold` (straight-line distance, `>=`).
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
- **`GET /board` answers 404 until the first write**, which the client reads as `empty`. A 404 on
  `DELETE` counts as success: the note is already gone.
- **After a failed save there are no retry timers**; the next change tries again. With the mock
  API the unconfirmed requests are re-sent then, with localStorage the whole board is.

## MVP+1: what's next and where I cut corners

Everything here was cut to stay inside the time box; each item says how the current design
prepares for it.

- **Keyboard and button alternatives for dragging (WCAG 2.5.7, 2.1.1).** Today create, move and
  resize need a pointer. The move and resize handles are already real, named `<button>`s, and
  move/resize actions carry absolute rects, so arrow-key handlers can dispatch the same
  `noteMoved` / `noteResized` actions without changing the reducer or the layout.
- **"New note" button.** I left creation to the board itself. A button would dispatch the same
  `noteCreated` action at a default position, and would also give keyboard users a way to create
  notes.
- **Bring to front on focus (WCAG 2.4.11).** I only raise a note on pointer press, so a focused
  note can sit partly under another. Calling the existing `noteBroughtToFront` action from
  `onFocus` is the whole change; Tab order does not move, because z-order is a counter.
- **Announcements for note changes (WCAG 4.1.3).** I only announce save status. The status bar is
  already the single live region and takes plain data, so "Note moved", "Note deleted" and so on
  can feed the same element.
- **Undo for delete.** I accepted that a dropped note is gone. State changes are small events on a
  pure reducer, so undo is a history of previous states (or a `noteRestored` action) without
  changing existing actions; the full undo/redo can grow from there.
- **Dark mode.** I ship a light theme only. Every token is named by role and derived from
  `--color-primary`, so dark mode is one `@media (prefers-color-scheme: dark)` block in
  `tokens.css` with inverted lightness steps, plus a `pnpm contrast` run to prove the new pairs.
- **Auto-scroll while dragging near the board edge.** The board size is frozen for a gesture, so a
  long move across a scrolled board needs the user to scroll first. It would be one scroll step
  inside the existing per-frame update.
- **Automated browser and accessibility tests with Playwright.** My unit tests cover pure logic and
  color contrast only, and I checked the browsers by hand. Playwright would run the drag flows
  (create, move, resize, delete) in Chromium, Firefox, Edge (a branded Chromium) and WebKit (close
  to Safari) on every change, at a 1024×650 viewport and at 200% zoom, and run an accessibility check
  with axe-core on the rendered page. Drags use Pointer Events, which Playwright's mouse produces, and
  notes are reachable by their buttons and labels, so the app needs no test hooks.
- **Screen reader testing.** I have not tested with VoiceOver or NVDA. The app uses native
  elements, one status live region and descriptive labels, so I expect few issues, but I have not
  checked.
- **Avoid the one extra save right after load.** `boardLoaded` renumbers `z` and returns a new
  object, and `useBoardPersistence` skips only the loaded board by reference, so one unchanged
  board is saved after every load. Fixing it means skipping a board equal in content, or having
  the hook expose the normalized board; it is a single, cheap write, so I left it.
- **Retry with back-off and an offline queue.** Autosave only retries on the next change. The
  scheduler has one place that handles a save result, so a retry timer is a small addition there,
  and the mock API repository already keeps unconfirmed work between saves.
- **Cross-tab sync and conflict handling.** Two tabs overwrite each other (last write wins). The
  versioned envelope leaves room for a revision number, and the `storage` event could feed
  `boardLoaded`.
- **Schema migrations.** Only version 1 exists. The envelope's `version` field is checked strictly
  now; a migration step would sit between parsing the version and validating the board.
