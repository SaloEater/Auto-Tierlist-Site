// Hover and pin highlighting, tooltips, search dimming.

import { name, tooltip, modifiersAt, t, tierName } from './i18n.js';
import { modifierLines } from './modifiers.js';

const sheetQuery = matchMedia('(max-width: 700px)');
/** Narrow screens show the tooltip as a bottom sheet instead of beside the node. */
function isSheet() {
  return sheetQuery.matches;
}

export class Interaction {
  /**
   * @param items   items.json, for each item's Armageddon tier
   * @param palette colour lookups from colors.js
   */
  constructor(canvas, tooltipEl, items, palette, catalogue = {}, mods = []) {
    this.items = items;
    this.catalogue = catalogue;
    // Mod id → display name, from meta.json → mods
    this.modNames = new Map(mods.map(m => [m.id, m.name]));
    this.palette = palette;
    this.canvas = canvas;
    this.tooltipEl = tooltipEl;
    this.pinned = null;
    this.hovered = null;
    this.nodeEls = new Map();
    this.linkEls = [];
    this.parents = new Map();  // id → Set(ingredient ids)
    this.children = new Map(); // id → Set(output ids)
    this.scores = new Map();

    // Touch has no hover: a tap pins the node and shows its tooltip (see onClick)
    canvas.addEventListener('pointerover', e => { if (e.pointerType !== 'touch') this.onOver(e); });
    canvas.addEventListener('pointerout', e => { if (e.pointerType !== 'touch') this.onOut(e); });
    canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') this.moveTooltip(e); });
    canvas.addEventListener('pointerdown', e => { this.lastPointerType = e.pointerType; });
    canvas.addEventListener('click', e => this.onClick(e));
    canvas.addEventListener('emptyclick', () => this.unpin());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.unpin();
    });
  }

  /** Bind to a freshly rendered layout. */
  bind(layout, rendered, scores) {
    this.nodeEls = rendered.nodeEls;
    this.linkEls = rendered.linkEls;
    this.scores = scores;
    this.parents = new Map();
    this.children = new Map();
    for (const link of layout.links) {
      if (!this.parents.has(link.to)) this.parents.set(link.to, new Set());
      this.parents.get(link.to).add(link.from);
      if (!this.children.has(link.from)) this.children.set(link.from, new Set());
      this.children.get(link.from).add(link.to);
    }
    if (this.pinned && !this.nodeEls.has(this.pinned)) this.pinned = null;
    // The hovered element was just replaced, so no pointerout will arrive for it
    this.hovered = null;
    this.applyHighlight();
    if (this.pinned) this.showTooltip(this.pinned);
    else this.hideTooltip();
  }

  nodeOf(e) {
    const el = e.target.closest?.('.node');
    return el ? el.dataset.id : null;
  }

  onOver(e) {
    const id = this.nodeOf(e);
    if (!id) return;
    this.hovered = id;
    this.applyHighlight();
    this.showTooltip(id, e);
  }

  onOut(e) {
    if (!this.nodeOf(e)) return;
    this.hovered = null;
    this.applyHighlight();
    // A pinned node keeps its tooltip until unpinned
    if (this.pinned) this.showTooltip(this.pinned, e);
    else this.hideTooltip();
  }

  onClick(e) {
    const id = this.nodeOf(e);
    if (!id) return;
    if (this.pinned === id) {
      this.unpin();
      return;
    }
    this.pinned = id;
    this.applyHighlight();
    this.showTooltip(id, e);
  }

  unpin() {
    if (this.pinned === null) return;
    this.pinned = null;
    this.applyHighlight();
    if (this.hovered && this.lastPointerType !== 'touch') this.showTooltip(this.hovered);
    else this.hideTooltip();
  }

  applyHighlight() {
    const focus = this.pinned ?? this.hovered;
    for (const el of this.nodeEls.values()) el.classList.remove('hl', 'hl-in', 'hl-self');
    for (const { el } of this.linkEls) el.classList.remove('hl', 'hl-in');
    this.canvas.classList.toggle('highlighting', focus !== null);
    if (focus === null) return;

    // Inputs (what the focused item is crafted from) and outputs (what it is used in)
    // are highlighted in different colours
    for (const id of this.parents.get(focus) ?? []) this.nodeEls.get(id)?.classList.add('hl-in');
    for (const id of this.children.get(focus) ?? []) this.nodeEls.get(id)?.classList.add('hl');
    this.nodeEls.get(focus)?.classList.add('hl-self');
    for (const { el, from, to } of this.linkEls) {
      if (to === focus) el.classList.add('hl-in');
      else if (from === focus) el.classList.add('hl');
    }
  }

  showTooltip(id, e) {
    const el = this.tooltipEl;
    el.replaceChildren();
    const title = document.createElement('div');
    title.className = 'name';
    title.textContent = name(id);
    // Name in the colour of the item's Armageddon tier, like the tier line at the bottom
    const nameColor = this.palette.tier(this.items[id]?.armageddonTier ?? null);
    if (nameColor) title.style.color = nameColor;
    el.appendChild(title);

    // The game's modifier block was cut out at export; rebuild it from the modifiers at the
    // same place. Older exports keep the original lines and get no rebuilt block.
    const lines = tooltip(id).map(text => ({ text, color: null }));
    const at = modifiersAt(id);
    if (at !== null && this.items[id]) {
      lines.splice(Math.min(at, lines.length), 0, ...modifierLines(this.items[id], this.catalogue));
    }

    // First tooltip line repeats the name
    for (const line of lines.slice(1)) {
      const div = document.createElement('div');
      div.className = 'line';
      div.textContent = line.text;
      if (line.color) div.style.color = line.color;
      el.appendChild(div);
    }

    // Mod name closes the item part, as in game (where the export removed it)
    const modId = this.items[id]?.mod ?? id.split(':')[0];
    const modLine = document.createElement('div');
    modLine.className = 'line mod';
    modLine.textContent = this.modNames.get(modId) ?? modId;
    el.appendChild(modLine);

    const s = this.scores.get(id);
    if (s) {
      const div = document.createElement('div');
      div.className = 'score';
      div.textContent = `${t('score')}: ${s.score.toFixed(2)} · ${t('tier')}: ${s.tier}`;
      el.appendChild(div);
    }

    // Armageddon tier at the bottom, in that tier's colour
    const armageddonTier = this.items[id]?.armageddonTier ?? null;
    if (armageddonTier !== null) {
      const div = document.createElement('div');
      div.className = 'armageddon';
      div.textContent = tierName(armageddonTier);
      div.style.color = this.palette.tier(armageddonTier) ?? '';
      el.appendChild(div);
    }

    el.hidden = false;
    // On narrow screens CSS lays the tooltip out as a bottom sheet; nothing to position
    if (isSheet()) {
      this.anchored = true;
      el.style.left = '';
      el.style.top = '';
      this.canvas.classList.add('sheet-open');
      return;
    }
    // With crafting links, pin the tooltip next to the node, away from its closest related
    // node, so it does not cover the chain; otherwise it follows the cursor
    this.anchored = this.placeAwayFromRelated(id);
    if (!this.anchored && e) this.moveTooltip(e);
    else if (!this.anchored) this.placeBesideNode(id);
  }

  /** Place the tooltip beside a node when there is no cursor position to follow (taps). */
  placeBesideNode(id) {
    const nodeEl = this.nodeEls.get(id);
    if (!nodeEl) return;
    const n = nodeEl.getBoundingClientRect();
    const el = this.tooltipEl;
    const t = el.getBoundingClientRect();
    const pad = 12;
    let x = n.right + pad;
    let y = n.top;
    if (x + t.width > window.innerWidth) x = Math.max(0, n.left - pad - t.width);
    if (y + t.height > window.innerHeight) y = Math.max(0, window.innerHeight - t.height);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  /**
   * Place the tooltip beside the node on the side opposite its closest parent or child.
   * Returns false when the node has no related nodes on screen.
   */
  placeAwayFromRelated(id) {
    const nodeEl = this.nodeEls.get(id);
    const related = [...(this.parents.get(id) ?? []), ...(this.children.get(id) ?? [])]
      .map(rid => this.nodeEls.get(rid))
      .filter(Boolean);
    if (!nodeEl || !related.length) return false;

    const n = nodeEl.getBoundingClientRect();
    const ncx = n.left + n.width / 2;
    const ncy = n.top + n.height / 2;

    let closest = null;
    let best = Infinity;
    for (const relEl of related) {
      const r = relEl.getBoundingClientRect();
      const dx = r.left + r.width / 2 - ncx;
      const dy = r.top + r.height / 2 - ncy;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        closest = { dx, dy };
      }
    }

    const el = this.tooltipEl;
    const t = el.getBoundingClientRect();
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

    // Candidate positions on each side of the node, best side first: opposite the closest
    // related node along its dominant direction, then the other opposite side, then the rest
    const sides = {
      left:  { x: n.left - pad - t.width, y: n.top },
      right: { x: n.right + pad, y: n.top },
      above: { x: n.left, y: n.top - pad - t.height },
      below: { x: n.left, y: n.bottom + pad },
    };
    const horizontal = closest.dx < 0 ? 'right' : 'left';
    const vertical = closest.dy < 0 ? 'below' : 'above';
    const order = Math.abs(closest.dx) > Math.abs(closest.dy)
      ? [horizontal, vertical, horizontal === 'left' ? 'right' : 'left', vertical === 'above' ? 'below' : 'above']
      : [vertical, horizontal, vertical === 'above' ? 'below' : 'above', horizontal === 'left' ? 'right' : 'left'];

    const fits = p => p.x >= 0 && p.y >= 0 && p.x + t.width <= vw && p.y + t.height <= vh;
    const pos = order.map(side => sides[side]).find(fits) ?? sides[order[0]];

    el.style.left = `${clamp(pos.x, 0, Math.max(0, vw - t.width))}px`;
    el.style.top = `${clamp(pos.y, 0, Math.max(0, vh - t.height))}px`;
    return true;
  }

  moveTooltip(e) {
    const el = this.tooltipEl;
    if (el.hidden) return;
    // Anchored tooltips follow the node rather than the cursor, e.g. while panning
    const focus = this.pinned ?? this.hovered;
    if (this.anchored && focus) {
      if (!isSheet()) this.placeAwayFromRelated(focus);
      return;
    }
    const pad = 14;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    const r = el.getBoundingClientRect();
    if (x + r.width > window.innerWidth) x = e.clientX - pad - r.width;
    if (y + r.height > window.innerHeight) y = e.clientY - pad - r.height;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  hideTooltip() {
    this.tooltipEl.hidden = true;
    this.canvas.classList.remove('sheet-open');
  }

  /** Mark the search match that Enter last jumped to, or clear the mark with null. */
  setCurrentMatch(id) {
    for (const el of this.nodeEls.values()) el.classList.remove('current-match');
    if (id) this.nodeEls.get(id)?.classList.add('current-match');
  }

  /**
   * Dim nodes that do not match the query. Returns the ids of the matches in layout order.
   */
  applySearch(query) {
    const q = query.trim().toLowerCase();
    const matches = [];
    for (const [id, el] of this.nodeEls) {
      const hit = q && (id.toLowerCase().includes(q) || name(id).toLowerCase().includes(q));
      el.classList.toggle('match', !!hit);
      if (hit) matches.push(id);
    }
    this.canvas.classList.toggle('searching', !!q);
    return matches;
  }
}
