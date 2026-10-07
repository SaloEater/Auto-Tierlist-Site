// Bootstrap: load data, hold state, wire panel → scoring → layout → render.

import { loadData, loadLang, SCHEMA } from './data.js';
import { computeScores } from './scoring.js';
import { layoutCrafted } from './layout-crafted.js';
import { layoutTiered } from './layout-tiered.js';
import { render, renderOverlays, nodeCenter, CELL } from './render.js';
import { buildPalette } from './colors.js';
import { Viewport } from './viewport.js';
import { Interaction } from './interact.js';
import { Panel } from './panel.js';
import { setLanguage, t } from './i18n.js';

const STORAGE_KEY = 'tierlist-viewer';

const refs = {
  canvas: document.getElementById('canvas'),
  viewport: document.getElementById('viewport'),
  rows: document.getElementById('rows'),
  links: document.getElementById('links'),
  linksG: document.getElementById('links-g'),
  nodes: document.getElementById('nodes'),
  labels: document.getElementById('labels'),
  headers: document.getElementById('headers'),
  status: document.getElementById('status'),
  tooltip: document.getElementById('tooltip'),
};

function showStatus(text) {
  refs.status.textContent = text;
  refs.status.hidden = !text;
}

function loadStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch (e) {
    return {};
  }
}

function store(state) {
  try {
    const { lang, mode, type, weights, separateMagic, maxTier, showNextTier, panelOpen } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lang, mode, type, weights, separateMagic, maxTier, showNextTier, panelOpen }));
  } catch (e) {
    // storage unavailable; fine
  }
}

function initialState(data) {
  const stored = loadStored();
  const urlLang = new URLSearchParams(location.search).get('lang');
  const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);

  const lang = pick(urlLang, data.languages, pick(stored.lang, data.languages, data.languages[0]));
  const weights = structuredClone(data.scoring);
  for (const set of ['weapon', 'armor', 'magicArmor']) {
    Object.assign(weights[set], stored.weights?.[set] ?? {});
  }

  return {
    lang,
    mode: pick(stored.mode, ['crafted', 'tiered'], 'crafted'),
    type: pick(stored.type, ['weapons', 'armor'], 'weapons'),
    weights,
    separateMagic: stored.separateMagic ?? data.scoring.separateMagicArmor,
    search: '',
    maxTier: Number.isInteger(stored.maxTier) ? stored.maxTier : null,
    showNextTier: stored.showNextTier ?? true,
    pinned: null,
    // Desktop remembers the panel; on a phone it always starts closed
    panelOpen: isMobile() ? false : (stored.panelOpen ?? true),
  };
}

const mobileQuery = matchMedia('(max-width: 700px)');
export function isMobile() {
  return mobileQuery.matches;
}

async function main() {
  // Site strings first, so loading and errors are shown translated
  const requestedLang = new URLSearchParams(location.search).get('lang') ?? 'en_us';
  await setLanguage(requestedLang, null);
  showStatus(t('loading'));

  let data;
  try {
    data = await loadData();
  } catch (e) {
    showStatus(e.message === 'schema'
      ? t('errorSchema', { v: e.schema, expected: SCHEMA })
      : t('errorLoad', { msg: e.message }));
    return;
  }

  const state = initialState(data);
  await setLanguage(state.lang, await loadLang(state.lang));
  syncUrl(state);
  applyPanelOpen(state);

  let layout = null;
  let scores = null;
  const palette = buildPalette(data.items, data.armageddonTiers);

  const interaction = new Interaction(refs.canvas, refs.tooltip, data.items, palette,
    data.meta.attributes ?? {}, data.meta.mods ?? []);
  const viewport = new Viewport(refs.canvas, refs.viewport, (x, y, k) => {
    if (layout) renderOverlays(layout, data.atlas, refs, x, y, k, palette);
  });

  const itemsOfType = () => {
    const want = state.type === 'weapons' ? 'weapon' : 'armor';
    return Object.values(data.items).filter(i => i.type === want);
  };

  function update() {
    const items = itemsOfType();
    scores = computeScores(data.items, state.type, state.weights, state.type === 'armor' && state.separateMagic);

    layout = state.mode === 'crafted'
      ? layoutCrafted(items, scores, data.lists[state.type].edges ?? [], state.maxTier, state.showNextTier)
      : layoutTiered(items, scores, data.armageddonTiers);

    const rendered = render(layout, data.atlas, refs, palette);
    interaction.bind(layout, rendered, scores);
    applySearch();
    viewport.set(viewport.x, viewport.y, viewport.k);
    showStatus(layout.nodes.length ? '' : t('empty'));
  }

  let matches = [];
  let matchIndex = -1; // match last jumped to with Enter
  function applySearch() {
    matches = interaction.applySearch(state.search);
    // Cycle in reading order: top to bottom, then left to right
    if (layout) {
      const pos = new Map(layout.nodes.map(n => [n.id, n]));
      matches.sort((a, b) => pos.get(a).row - pos.get(b).row || pos.get(a).col - pos.get(b).col);
    }
    matchIndex = -1;
    interaction.setCurrentMatch(null);
    panel.setSearchCount(matches.length, state.search.trim() !== '');
  }

  /** Enter moves to the next match, Shift+Enter to the previous one, wrapping around. */
  function jumpToMatch(step) {
    if (!matches.length || !layout) return;
    matchIndex = matchIndex < 0
      ? (step > 0 ? 0 : matches.length - 1)
      : (matchIndex + step + matches.length) % matches.length;
    const id = matches[matchIndex];
    const node = layout.nodes.find(n => n.id === id);
    if (!node) return;
    const [cx, cy] = nodeCenter(node);
    // On a phone the tooltip sheet covers the bottom ~45% of the screen
    viewport.centerOn(cx, cy, isMobile() ? refs.canvas.getBoundingClientRect().height * 0.45 : 0);
    interaction.setCurrentMatch(id);
    panel.setSearchCount(matches.length, true, matchIndex);
  }

  const panel = new Panel(state, data, async what => {
    if (what === 'lang') {
      await setLanguage(state.lang, await loadLang(state.lang));
      syncUrl(state);
      applyPanelOpen(state); // re-translates the toggle's label
      panel.build();
      update();
    } else if (what === 'search') {
      applySearch();
    } else if (what === 'jump' || what === 'jumpPrev') {
      // On a phone the panel covers the list, so close it to show the match
      if (isMobile()) closePanel();
      jumpToMatch(what === 'jump' ? 1 : -1);
    } else {
      update();
      if (what === 'mode' || what === 'type') fitStart();
    }
    store(state);
  });

  // Settings toggle: shows/hides the side panel; the canvas changes size, so overlays re-fit
  const toggle = document.getElementById('settings-toggle');
  toggle.addEventListener('click', () => {
    state.panelOpen = !state.panelOpen;
    applyPanelOpen(state);
    store(state);
    viewport.set(viewport.x, viewport.y, viewport.k);
  });
  window.addEventListener('resize', () => viewport.set(viewport.x, viewport.y, viewport.k));
  const closePanel = () => {
    if (!state.panelOpen) return;
    state.panelOpen = false;
    applyPanelOpen(state);
    store(state);
    viewport.set(viewport.x, viewport.y, viewport.k);
  };
  document.getElementById('panel-done').addEventListener('click', closePanel);

  panel.build();
  update();
  fitStart();
  store(state);

  /**
   * Starting view: top-left of the layout, just right of the label column and below the
   * header strip. Zoomed out so that about six columns fit when the canvas is narrower
   * than that (phones), or when the layout is wider than the canvas on desktop.
   */
  function fitStart() {
    const labelsW = refs.labels.getBoundingClientRect().width;
    const headersH = refs.headers.getBoundingClientRect().height;
    const canvasW = refs.canvas.getBoundingClientRect().width;
    const usable = Math.max(1, canvasW - labelsW - 16);
    let k = 1;
    const layoutW = (layout?.width ?? 0) * CELL;
    if (isMobile() || layoutW > usable) {
      k = Math.min(1, Math.max(0.25, usable / (6 * CELL)));
    }
    viewport.set(labelsW + 16, headersH + 8, k);
  }
}

function applyPanelOpen(state) {
  document.body.classList.toggle('panel-open', state.panelOpen);
  const toggle = document.getElementById('settings-toggle');
  toggle.setAttribute('aria-expanded', String(state.panelOpen));
  toggle.setAttribute('aria-label', t(state.panelOpen ? 'closeSettings' : 'openSettings'));
  toggle.title = toggle.getAttribute('aria-label');
}

function syncUrl(state) {
  const url = new URL(location.href);
  url.searchParams.set('lang', state.lang);
  history.replaceState(null, '', url);
}

main();
