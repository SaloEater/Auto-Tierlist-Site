// Loading and validation of the export described in ../EXPORT.md.

import { deriveAllStats, fillInfiniteStats } from './stats.js';

/** Newest export schema this viewer knows. */
export const SCHEMA = 2;
/** Schemas this viewer can load: 1 (derived stats only) and 2 (raw attributes). */
const SUPPORTED_SCHEMAS = [1, 2];

// Defaults from EXPORT.md, used when meta.json predates the weights layout.
export const DEFAULT_SCORING = {
  separateMagicArmor: true,
  weaponTierMultiplier: 1.6,
  weapon: { damage: 1.0, attackSpeed: 1.0 },
  armor: { armor: 1.0, toughness: 0.6, mana: 0.0, spellPower: 0.0, flatSpellPower: 0.0 },
  magicArmor: { armor: 0.5, toughness: 0.3, mana: 0.02, spellPower: 20.0, flatSpellPower: 0.2 },
};

async function fetchJson(path) {
  // Always revalidate: a new export replaces these files in place, and a cached copy would
  // silently show the previous export
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  // Older exports wrote infinite stats as bare Infinity/NaN, which is not valid JSON
  const text = (await res.text()).replace(/:\s*-?(?:Infinity|NaN)\b/g, ': null');
  return JSON.parse(text);
}

/**
 * Load meta, items, both type files and the atlas index. Throws on a schema mismatch.
 */
export async function loadData(base = 'data/') {
  const meta = await fetchJson(base + 'meta.json');
  if (!SUPPORTED_SCHEMAS.includes(meta.schema)) {
    const err = new Error('schema');
    err.schema = meta.schema;
    throw err;
  }

  const [items, weapons, armor, atlas] = await Promise.all([
    fetchJson(base + 'items.json'),
    fetchJson(base + 'weapons.json'),
    fetchJson(base + 'armor.json'),
    // The atlas is optional: an export whose icon step failed still has usable data
    fetchJson(base + 'icons/atlas.json').catch(() => {
      console.warn('No icon atlas in the export, showing placeholders');
      return { size: 64, columns: 1, pages: 0, icons: {} };
    }),
  ]);

  // Tolerate exports that predate armageddonTier on items
  for (const item of Object.values(items)) {
    if (item.armageddonTier === undefined) item.armageddonTier = null;
  }

  // Schema 2: stats come from the raw attribute modifiers (see stats.js). Schema 1: the
  // exported stats are used as they are. Either way, infinite (null) values become the
  // highest finite value of that stat.
  if (meta.schema >= 2) {
    deriveAllStats(items, meta.attributes ?? {});
  } else {
    fillInfiniteStats(items);
  }

  const scoring = {
    separateMagicArmor: meta.scoring?.separateMagicArmor ?? DEFAULT_SCORING.separateMagicArmor,
    weaponTierMultiplier: meta.scoring?.weaponTierMultiplier ?? DEFAULT_SCORING.weaponTierMultiplier,
    weapon: { ...DEFAULT_SCORING.weapon, ...(meta.scoring?.weapon ?? {}) },
    armor: { ...DEFAULT_SCORING.armor, ...(meta.scoring?.armor ?? {}) },
    magicArmor: { ...DEFAULT_SCORING.magicArmor, ...(meta.scoring?.magicArmor ?? {}) },
  };

  const languages = meta.languages ?? ['en_us', 'ru_ru'];

  return {
    meta,
    scoring,
    languages,
    armageddonTiers: meta.armageddonTiers ?? [],
    items,
    lists: { weapons, armor },
    // The export timestamp versions the atlas images, so a new export is not hidden behind
    // cached pages of the old one
    atlas: { ...atlas, base: base + 'icons/', version: encodeURIComponent(meta.generated ?? '') },
  };
}

/**
 * Load one export language file; returns null when the file is missing.
 */
export async function loadLang(code, base = 'data/') {
  try {
    return await fetchJson(`${base}lang/${code}.json`);
  } catch (e) {
    return null;
  }
}
