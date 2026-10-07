// DOM rendering of a layout: row stripes, links (SVG), nodes, and the overlays that
// live outside the transform (tier labels, group headers).

import { t, tierName } from './i18n.js';
import { withAlpha } from './colors.js';

export const CELL = 64;   // column pitch
export const ROW = 72;    // row pitch
export const NODE = 48;   // node size, must match --node in style.css

const SVG_NS = 'http://www.w3.org/2000/svg';

export function nodeCenter(node) {
  return [node.col * CELL + CELL / 2, node.row * ROW + ROW / 2];
}

function iconStyle(el, atlas, id, size) {
  const icon = atlas.icons[id];
  if (!icon) {
    el.style.backgroundImage = '';
    return false;
  }
  const scale = size / atlas.size;
  el.style.backgroundImage = `url(${atlas.base}atlas_${icon.page}.png?v=${atlas.version ?? ''})`;
  el.style.backgroundPosition = `${-icon.x * scale}px ${-icon.y * scale}px`;
  el.style.backgroundSize = `${atlas.columns * atlas.size * scale}px auto`;
  return true;
}

/**
 * Render a layout into the viewport. Returns { nodeEls: Map id → el, linkEls: [{el, from, to}] }.
 */
export function render(layout, atlas, refs, palette) {
  const { rows, nodes, links, linksG } = refs;

  rows.replaceChildren();
  nodes.replaceChildren();
  linksG.replaceChildren();

  const totalWidth = Math.max(1, layout.width) * CELL;

  // Row stripes and separators
  layout.rows.forEach((row, i) => {
    const el = document.createElement('div');
    el.className = `tier-row ${i % 2 ? 'b' : 'a'}`;
    el.style.top = `${row.index * ROW}px`;
    el.style.height = `${(row.span ?? 1) * ROW}px`;
    rows.appendChild(el);
  });
  for (const rowIndex of layout.separators) {
    const el = document.createElement('div');
    el.className = 'block-sep';
    el.style.top = `${rowIndex * ROW + ROW / 2}px`;
    rows.appendChild(el);
  }
  // Armageddon group columns (tiered view) tinted with the tier's colour, reaching to the
  // separators on either side
  for (const group of layout.groups) {
    const color = palette.tier(group.key);
    if (!color) continue;
    const el = document.createElement('div');
    el.className = 'group-bg';
    el.style.left = `${group.startCol * CELL - CELL / 2}px`;
    el.style.width = `${(group.endCol - group.startCol + 2) * CELL}px`;
    el.style.top = '0';
    el.style.height = `${layout.height * ROW}px`;
    el.style.background = withAlpha(color, 0.1);
    rows.appendChild(el);
  }
  for (const group of layout.groups) {
    if (group.startCol === 0) continue;
    const el = document.createElement('div');
    el.className = 'group-sep';
    el.style.left = `${group.startCol * CELL - CELL / 2}px`;
    el.style.top = '0';
    el.style.height = `${layout.height * ROW}px`;
    rows.appendChild(el);
  }

  // Nodes
  const nodeEls = new Map();
  const nodeById = new Map(layout.nodes.map(n => [n.id, n]));
  for (const node of layout.nodes) {
    const el = document.createElement('div');
    el.className = 'node' + (node.ghost ? ' ghost' : '') + (node.current ? ' current-tier' : '');
    el.dataset.id = node.id;
    el.tabIndex = 0;
    const [cx, cy] = nodeCenter(node);
    el.style.left = `${cx - NODE / 2}px`;
    el.style.top = `${cy - NODE / 2}px`;
    if (!iconStyle(el, atlas, node.id, NODE)) el.classList.add('no-icon');
    const color = palette.item(node.id);
    if (color) el.style.backgroundColor = withAlpha(color, 0.3);
    nodes.appendChild(el);
    nodeEls.set(node.id, el);
  }

  // Links: ingredient (bottom centre) → output (top centre), vertical tangents
  const linkEls = [];
  for (const link of layout.links) {
    const a = nodeById.get(link.from);
    const b = nodeById.get(link.to);
    if (!a || !b) continue;
    const [x1, y1c] = nodeCenter(a);
    const [x2, y2c] = nodeCenter(b);
    const down = y2c >= y1c;
    const y1 = y1c + (down ? NODE / 2 : -NODE / 2);
    const y2 = y2c + (down ? -NODE / 2 - 4 : NODE / 2 + 4);
    const dy = (y2 - y1) / 2;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`);
    path.dataset.from = link.from;
    path.dataset.to = link.to;
    linksG.appendChild(path);
    linkEls.push({ el: path, from: link.from, to: link.to });
  }

  refs.links.setAttribute('width', totalWidth);
  refs.links.setAttribute('height', layout.height * ROW);

  return { nodeEls, linkEls };
}

/**
 * Position the overlays (tier labels, group headers) for the current transform.
 */
export function renderOverlays(layout, atlas, refs, x, y, k, palette) {
  const { labels, headers } = refs;
  labels.replaceChildren();
  headers.replaceChildren();

  const labelsW = labels.getBoundingClientRect().width;

  for (const row of layout.rows) {
    const el = document.createElement('div');
    el.className = 'tier-label' + (row.magic ? ' magic' : '');
    el.style.top = `${y + row.index * ROW * k}px`;
    el.style.height = `${(row.span ?? 1) * ROW * k}px`;
    el.textContent = String(row.tier);
    el.title = row.magic ? t('magicBlock') : '';
    labels.appendChild(el);
  }
  for (const rowIndex of layout.separators) {
    const el = document.createElement('div');
    el.className = 'tier-label magic';
    el.style.top = `${y + rowIndex * ROW * k}px`;
    el.style.height = `${ROW * k}px`;
    el.style.fontSize = '11px';
    el.textContent = t('magicBlock');
    labels.appendChild(el);
  }

  for (const group of layout.groups) {
    const el = document.createElement('div');
    el.className = 'group-header';
    const color = palette.tier(group.key);
    if (color) el.style.color = color;
    const centerCol = (group.startCol + group.endCol + 1) / 2;
    el.style.left = `${x + centerCol * CELL * k}px`;
    if (group.headerItem) {
      const icon = document.createElement('span');
      icon.className = 'icon';
      if (iconStyle(icon, atlas, group.headerItem, 32)) el.appendChild(icon);
    }
    const label = group.key === null ? t('other') : tierName(group.key);
    const text = document.createElement('span');
    text.textContent = label;
    el.title = label;
    // Narrow groups when zoomed out: fall back to the icon or the tier's letter so
    // neighbouring headers do not overlap
    const screenWidth = (group.endCol - group.startCol + 1) * CELL * k;
    if (screenWidth < 150 && group.label) text.textContent = group.label;
    if (screenWidth >= 150 || !el.firstChild) el.appendChild(text);
    el.style.visibility = (x + centerCol * CELL * k) < labelsW ? 'hidden' : 'visible';
    headers.appendChild(el);
  }
}
