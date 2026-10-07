# Tierlist viewer — build plan

A static website that renders the export described in `../EXPORT.md`. No build step, no
backend: plain HTML, CSS and ES modules, served from any static host (GitHub Pages) or
a local `python -m http.server`.

## Layout

```
┌──────────────┬───────────────────────────────────────────────┐
│ Side panel   │ Tierlist area (scrolls both ways)             │
│ (fixed)      │                                               │
│              │  tier 3 │ ▢ ▢ ▢      ▢                        │
│ language     │  tier 4 │   ▢ → ▢    ▢ ▢                      │
│ view toggles │  tier 5 │       ▢ → ▢                         │
│ weights      │  …                                            │
│ search       │  ── magic armor ──────────────────────────    │
│ tier filter  │  tier 0 │ ▢ ▢                                 │
└──────────────┴───────────────────────────────────────────────┘
```

## Files

```
site/
├── index.html
├── style.css
├── i18n/
│   ├── en_us.json          site strings
│   └── ru_ru.json
├── data/                   copy of <game dir>/tierlist_export/ (not committed; see below)
└── js/
    ├── main.js             bootstrap, state, wiring
    ├── data.js             load + validate the export (schema check)
    ├── scoring.js          weights → score → tier, magic detection
    ├── layout-crafted.js   chains and columns from edges
    ├── layout-tiered.js    groups by Armageddon tier
    ├── render.js           nodes, links (SVG), tier labels, separators
    ├── viewport.js         pan and zoom of the tierlist area
    ├── interact.js         hover/pin highlight, tooltip, search dimming
    ├── panel.js            side panel controls
    └── i18n.js             site strings + export lang files
```

`data/` is populated by copying the export; a tiny `copy-export.sh` does that from the
dev instance. The viewer refuses to start on a `schema` it does not know.

## State

One `state` object. Only the language is reflected in the URL (`?lang=ru_ru`), so a link
opens in the right language; everything else is kept in `localStorage` or not at all:

| Key | Values | Persisted |
|---|---|---|
| `lang` | language code present in `data/lang/` | URL + localStorage |
| `mode` | `crafted` / `tiered` | localStorage |
| `type` | `weapons` / `armor` | localStorage |
| `weights` | per type, per weight set | localStorage |
| `separateMagic` | bool | localStorage |
| `search` | string | — |
| `maxTier` | Armageddon tier index or `null` | localStorage |
| `pinned` | item id or `null` | — |

Any change re-runs: score → filter → layout → render. All steps are pure functions of
`state` + data; ~600 nodes re-render in a few ms, so no incremental updates are needed.

## Side panel

1. **Language** — `<select>` listing `data/lang/*.json` (from `meta.json`, which the mod
   will list under `languages`; until then, try the configured codes). Switching reloads
   item names/tooltips and site strings.
2. **View** — two segmented toggles: Crafted | Tiered and Weapons | Armor.
3. **Search** — text input; matches item name in the current language or the item id,
   case-insensitive substring. Non-matching nodes are dimmed, layout unchanged. Enter
   scrolls the first match into view. Count of matches shown.
4. **Weights** — one slider per weight of the selected type, label + numeric value +
   "Reset". For armor, a "Separate magic armor" checkbox; when on, a second slider group
   for the `magicArmor` set appears. Defaults from `meta.json → scoring`.
5. **Armageddon tier** (crafted only) — `<select>` of keeper names in `meta.json` order
   plus "All". With tier *N* selected: items of tier ≤ N are normal, tier N+1 is greyed
   out (still laid out, links kept, not hoverable), tier > N+1 is hidden and the layout
   is recomputed without them. Items with no tier are always normal.

## Tierlist area

Shared: rows are tiers, lowest tier at the top; a label column on the left shows the
tier number; node = icon from the atlas (`background-position`), fixed size; hover
tooltip with name, in-game tooltip lines and computed score. Rows alternate background
like the chapter.

**Pan and zoom** (`viewport.js`, no library): nodes and the link SVG live in one
`.viewport` element with `transform: translate(x, y) scale(k)` and `will-change:
transform`. Wheel zooms around the cursor (`k` clamped to 0.25–3, keeping the point
under the cursor fixed); dragging empty space pans, via pointer events with
`setPointerCapture`; plain trackpad scroll pans, ctrl+wheel / pinch zooms. Nodes stay
ordinary elements inside the transform, so hover and click keep working. The tier label
column and the tiered-view group headers sit outside the transform and are positioned
from the same `x`/`y`/`k` so they stay visible while panning. Tooltips are fixed to the
page and never scale. Icons use `image-rendering: pixelated`. Search "jump to match"
pans the viewport to the node.

**Crafted**

- `layout-crafted.js`: union-find over `edges` → chains. Each chain gets a contiguous
  column block; inside it, items are placed in topological order so an output is never
  left of its ingredient, reusing an ingredient's column when free in that tier (port of
  `ProgressionHelper.assignChainColumns`). Items with no edges are packed after the
  chains. Magic armor (when enabled) is a second row block below with its own tiers and
  the same column algorithm run independently.
- Links in an SVG layer under the nodes: ingredient → output, cubic curve, arrowhead at
  the output.
- Hover a node: it, its parents, its children and the links between them are
  highlighted; everything else dims. Click pins the highlight; click again or Esc unpins.

**Tiered**

- `layout-tiered.js`: columns grouped by Armageddon tier in `meta.json` order, an
  "Other" group first for untagged items. Each group: header with header-item icon and
  keeper name, vertical separator line, items in a tier ordered by score ascending.
- No links, no tier filter.

## Scoring (`scoring.js`)

Straight from `EXPORT.md`: pick weight set (`weapon`, `armor`, or `magicArmor` when
`separateMagic` and `mana > 0 || spellPower > 0`), `score = Σ stat × weight`,
`tier = floor(max(0, score))` (weapons multiply stat^weight). Returns `{id, score, tier, magic}` per item.

## i18n (`i18n.js`)

- Site strings: `site/i18n/<code>.json`, flat `key → string`, English as fallback.
- Item strings: `data/lang/<code>.json` (`items`, `armageddonTiers`).
- One `t(key)` for site strings, `name(id)`, `tooltip(id)`, `tierName(index)` for data.

## Build order

1. Skeleton: `index.html`, panel markup, data loading, schema check, scoring, state.
2. Tiered view: groups, separators, headers, nodes from the atlas, tooltips; pan and zoom.
3. Crafted view: chain layout, links, magic block.
4. Interaction: hover/pin highlight, search dimming and scroll, Armageddon tier filter.
5. Weights UI with persistence and reset.
6. i18n: site strings in EN and RU, language switch; `?lang=` in the URL.
7. Polish: row striping, keyboard focus on nodes, empty states, `copy-export.sh`.

Each step ends with the page working in a browser with the real export; steps 2–4 are
checked against the in-game chapter for the same data.

## Out of scope for this version

- Mod filter (search by id covers most cases).
- Items that are both weapon and armor (exported as weapons only).
- Community overrides (step 5 of the overall roadmap).
- Mobile layout; the page targets a desktop browser.
