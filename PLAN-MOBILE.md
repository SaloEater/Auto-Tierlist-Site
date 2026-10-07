# Tierlist viewer — mobile plan

Make the viewer usable on phones and tablets without changing the desktop experience.
Desktop keeps the fixed side panel and mouse interaction; mobile gets a full-screen
settings panel behind a cogwheel, touch pan/zoom, and tap-based tooltips.

"Mobile" means a viewport narrower than 700 px (`@media (max-width: 700px)`). Everything
else is desktop. Touch support (step 2) applies to any device that sends touch pointers,
including desktop touchscreens.

## Step 1 — Cogwheel and collapsible panel

**Button.** A fixed `button.settings-toggle` in the top-left corner (inline SVG cogwheel,
44 × 44 px tap target, `aria-expanded`, `aria-controls="panel"`). Clicking it toggles
`body.panel-open`.

**Desktop.** `panel-open` is on by default. The grid is `grid-template-columns: 280px 1fr`
when open and `0 1fr` when closed, with the panel `overflow: hidden` so it collapses
cleanly and the tierlist takes the full width. The cogwheel sits over the panel's top-left
corner; the panel title moves right to make room.

**Mobile.** The panel becomes `position: fixed; inset: 0; z-index` above the tierlist,
hidden unless `panel-open`. Closed by default on every load. While open, the cogwheel turns
into a close icon and stays on top of the panel. The panel's own scroll is kept.

**Re-fit.** Tier labels and group headers are positioned from the tierlist area's size, so
toggling the panel calls the viewport's existing resize path (`viewport.set(x, y, k)`)
after the transition ends.

**State.** Desktop open/closed is saved in `localStorage` with the other settings; mobile
ignores the saved value and always starts closed.

Files: `index.html` (button + icon), `style.css` (grid, media query, panel overlay),
`main.js` (toggle, persistence, re-fit), `i18n` (`settings`, `close` labels for
`aria-label`).

## Step 2 — Touch pan and pinch-zoom

`viewport.js` tracks only one pointer; a two-finger pinch is ignored.

- Keep a `Map` of active pointers from `pointerdown`/`pointermove`/`pointerup`/`pointercancel`.
- One pointer: pan, as now.
- Two pointers: on each move compute the distance and midpoint of the pair; scale `k` by
  `distance / startDistance` and translate so the world point under the start midpoint
  stays under the current midpoint. Clamp `k` to the same 0.25–3 range.
- When a finger lifts during a pinch, re-anchor the remaining finger as a fresh pan so
  the view does not jump.
- `touch-action: none` on the canvas so the browser does not scroll or zoom the page
  itself; `<meta name="viewport" ... user-scalable=no>` is **not** used (accessibility),
  `touch-action` is enough inside the canvas.
- A tap (pointerdown/up with < 6 px movement, < 300 ms) is not a drag; it reaches the
  click handlers in `interact.js`.

Files: `viewport.js`, `style.css`.

## Step 3 — Tap instead of hover

Phones never fire hover, so tooltips and chain highlights never appear.

- Tapping a node pins it (existing click → pin) **and** shows its tooltip. Tapping the same
  node again, or empty space, unpins and hides the tooltip. Esc still works with a keyboard.
- On desktop nothing changes: hover shows the tooltip, click pins, pinned items keep their
  tooltip until unpinned (today the tooltip hides on pointer-out even when pinned; with this
  change a pinned node keeps its tooltip, which is also better with a mouse).
- Detection is by pointer type (`e.pointerType === 'touch'`), not by screen size, so a
  touchscreen laptop behaves like a phone for taps and like a desktop for the mouse.

Files: `interact.js`.

## Step 4 — Tooltip as a bottom sheet on mobile

Beside-the-node placement rarely fits on a narrow screen.

- Under the mobile media query the tooltip is `position: fixed; left: 0; right: 0;
  bottom: 0`, max-height 45 vh, scrollable, with a small drag handle look and a close
  affordance (tap outside or tap the node again).
- `interact.js` skips `placeAwayFromRelated`/`moveTooltip` when the sheet layout is active
  (`matchMedia('(max-width: 700px)').matches`), so CSS alone positions it.
- The canvas gets `padding-bottom` equal to the sheet height while a tooltip is shown, so
  the pinned node can still be panned into view above the sheet.

Files: `style.css`, `interact.js`.

## Step 5 — Panel ergonomics on mobile

- Larger controls: 44 px minimum height on buttons, selects and slider thumbs; 16 px
  inputs (prevents iOS auto-zoom on focus).
- The two toggle groups (Crafted/Tiered, Weapons/Armor) stay side by side; weight groups
  stack with a bit more spacing.
- A "Done" button at the bottom of the mobile panel that closes it, in addition to the
  cogwheel, so users do not have to scroll back up.
- Search: pressing Enter on a phone keyboard jumps and closes the panel so the match is
  visible; the match counter stays in the panel.

Files: `style.css`, `index.html`, `panel.js`, `i18n`.

## Step 6 — Starting view and fit

- On first load, and when switching mode/type, fit the view so that about six columns are
  visible: `k = clamp(canvasWidth / (6 × CELL), 0.25, 1)`, positioned at the top-left of
  the layout. On desktop the current 1:1 start is kept unless the layout is wider than the
  canvas, in which case the same fit rule applies.
- `centerOn` (search jump) pans as now; on mobile it also ensures the node is not under
  the bottom sheet.

Files: `viewport.js`, `main.js`.

## Step 7 — Verification

Desktop (Chrome, device-mode off): panel toggles and collapses, labels/headers re-fit, no
behaviour change in hover/pin/search.

Desktop device mode (Chrome DevTools, iPhone and iPad presets): cogwheel opens the
full-screen panel, "Done" closes it, tap pins and shows the bottom-sheet tooltip, tap on
empty space clears it, one-finger pan works. Pinch-zoom cannot be tested in device mode.

Real device (any Android or iOS phone on the same network, `python3 -m http.server`):
pinch-zoom around the fingers' midpoint, no page zoom/scroll fighting the canvas, tap
targets in the panel usable with a thumb.

## Out of scope

- Landscape-specific layouts and tablets with a mouse (treated as desktop by width).
- Offline/PWA packaging.
- Reworking the crafted layout for narrow screens; it stays wide and is navigated by
  pan/zoom.

## Order and size

1. Cogwheel and panel — small, independent, visible immediately.
2. Touch pan/zoom — medium; the core of phone usability.
3. Tap-to-pin tooltips — small.
4. Bottom-sheet tooltip — small.
5. Panel ergonomics — small.
6. Starting view — small.

Steps 1–3 together make the site usable on a phone; 4–6 make it comfortable.
