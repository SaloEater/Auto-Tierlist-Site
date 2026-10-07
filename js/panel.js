// Side panel controls. Reads and writes `state`, calls `onChange(what)` after a change.

import { t, tierName } from './i18n.js';
import { STATS } from './scoring.js';

// Slider ranges per stat
const RANGES = {
  damage: [0, 1, 0.05],
  attackSpeed: [0, 1, 0.05],
  armor: [0, 3, 0.05],
  toughness: [0, 3, 0.05],
  mana: [0, 0.1, 0.001],
  spellPower: [0, 50, 0.5],
  flatSpellPower: [0, 5, 0.05],
};

// Stats that only get a slider in some weight sets. Flat spell power only appears on magic
// armor, so the regular armor set does not offer it.
const SET_ONLY = {
  flatSpellPower: ['magicArmor'],
};

/**
 * Name of a language in that language itself, e.g. "English", "Русский". Uses the
 * browser's own names, so any exported language works without a table here.
 */
function languageName(code) {
  const [lang, region] = code.split('_');
  const tag = region ? `${lang}-${region.toUpperCase()}` : lang;
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language' }).of(lang);
    if (name && name !== lang) return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1);
  } catch (e) {
    // Unknown tag: fall through to the raw code
  }
  return code;
}

export class Panel {
  constructor(state, data, onChange) {
    this.state = state;
    this.data = data;
    this.onChange = onChange;

    this.el = {
      lang: document.getElementById('lang'),
      mode: document.getElementById('mode'),
      type: document.getElementById('type'),
      search: document.getElementById('search'),
      searchCount: document.getElementById('search-count'),
      tierFilterControl: document.getElementById('tier-filter-control'),
      tierFilter: document.getElementById('tier-filter'),
      showNextTier: document.getElementById('show-next-tier'),
      weights: document.getElementById('weights'),
      reset: document.getElementById('reset-weights'),
      separateMagicControl: document.getElementById('separate-magic-control'),
      separateMagic: document.getElementById('separate-magic'),
    };

    this.el.lang.addEventListener('change', () => {
      state.lang = this.el.lang.value;
      onChange('lang');
    });

    for (const key of ['mode', 'type']) {
      this.el[key].addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        state[key] = btn.dataset.value;
        this.syncToggles();
        this.buildWeights();
        this.syncVisibility();
        onChange(key);
      });
    }

    this.el.search.addEventListener('input', () => {
      state.search = this.el.search.value;
      onChange('search');
    });
    this.el.search.addEventListener('keydown', e => {
      if (e.key === 'Enter') onChange(e.shiftKey ? 'jumpPrev' : 'jump');
    });

    this.el.tierFilter.addEventListener('change', () => {
      const v = this.el.tierFilter.value;
      state.maxTier = v === '' ? null : Number(v);
      onChange('maxTier');
    });

    this.el.showNextTier.addEventListener('change', () => {
      state.showNextTier = this.el.showNextTier.checked;
      onChange('maxTier');
    });

    this.el.separateMagic.addEventListener('change', () => {
      state.separateMagic = this.el.separateMagic.checked;
      this.buildWeights();
      onChange('weights');
    });

    this.el.reset.addEventListener('click', () => {
      state.weights = structuredClone(data.scoring);
      state.separateMagic = data.scoring.separateMagicArmor;
      this.el.separateMagic.checked = state.separateMagic;
      this.buildWeights();
      onChange('weights');
    });
  }

  /** (Re)build everything that depends on language or data. */
  build() {
    const { state, data } = this;

    this.el.lang.replaceChildren();
    for (const code of data.languages) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = languageName(code);
      this.el.lang.appendChild(opt);
    }
    this.el.lang.value = state.lang;

    this.el.tierFilter.replaceChildren();
    const all = document.createElement('option');
    all.value = '';
    all.textContent = t('all');
    this.el.tierFilter.appendChild(all);
    for (const tier of data.armageddonTiers) {
      const opt = document.createElement('option');
      opt.value = String(tier.index);
      opt.textContent = tierName(tier.index);
      this.el.tierFilter.appendChild(opt);
    }
    this.el.tierFilter.value = state.maxTier === null ? '' : String(state.maxTier);
    this.el.showNextTier.checked = state.showNextTier;

    this.el.search.value = state.search;
    this.el.separateMagic.checked = state.separateMagic;

    this.syncToggles();
    this.buildWeights();
    this.syncVisibility();
  }

  syncToggles() {
    for (const key of ['mode', 'type']) {
      for (const btn of this.el[key].querySelectorAll('button')) {
        btn.classList.toggle('active', btn.dataset.value === this.state[key]);
      }
    }
  }

  syncVisibility() {
    this.el.tierFilterControl.hidden = this.state.mode !== 'crafted';
    this.el.separateMagicControl.hidden = this.state.type !== 'armor';
  }

  buildWeights() {
    const { state } = this;
    const container = this.el.weights;
    container.replaceChildren();

    const sets = state.type === 'weapons'
      ? [['weapon', 'weaponWeights']]
      : state.separateMagic
        ? [['armor', 'armorWeights'], ['magicArmor', 'magicWeights']]
        : [['armor', 'armorWeights']];

    for (const [setKey, labelKey] of sets) {
      const group = document.createElement('div');
      group.className = 'weight-group';
      const h = document.createElement('h3');
      h.textContent = t(labelKey);
      group.appendChild(h);

      for (const stat of STATS[state.type]) {
        if (SET_ONLY[stat] && !SET_ONLY[stat].includes(setKey)) continue;
        const [min, max, step] = RANGES[stat];
        const row = document.createElement('div');
        row.className = 'weight';
        const nameEl = document.createElement('span');
        nameEl.className = 'name';
        nameEl.textContent = t(`stat.${stat}`);
        const value = document.createElement('span');
        value.className = 'value';
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        const current = state.weights[setKey][stat] ?? 0;
        input.value = String(current);
        value.textContent = format(current);
        input.addEventListener('input', () => {
          const v = Number(input.value);
          state.weights[setKey][stat] = v;
          value.textContent = format(v);
          this.onChange('weights');
        });
        row.append(nameEl, value, input);
        group.appendChild(row);
      }
      container.appendChild(group);
    }
  }

  /**
   * @param n       number of matches
   * @param active  whether a query is entered
   * @param current index of the match jumped to with Enter, or -1
   */
  setSearchCount(n, active, current = -1) {
    this.el.searchCount.textContent = !active ? ''
      : !n ? t('noMatches')
      : current >= 0 ? t('matchPosition', { i: current + 1, n })
      : t('matches', { n });
  }
}

function format(v) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}
