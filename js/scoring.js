// Weights → score → tier, as specified in EXPORT.md "Scoring".

import { MAGIC_STATS } from './stats.js';

export const STATS = {
  weapons: ['damage', 'attackSpeed'],
  armor: ['armor', 'toughness', 'mana', 'spellPower', 'flatSpellPower'],
};

/** Armor is magic when any of the stats in MAGIC_STATS (stats.js) is above 0. */
export function isMagic(item) {
  return MAGIC_STATS.some(stat => (item.stats[stat] ?? 0) > 0);
}

function weightedProduct(stats, weights, keys) {
  let score = 1;
  for (const key of keys) score *= Math.pow(Math.max(0, stats[key] ?? 0), weights[key] ?? 0);
  return score;
}

function weightedSum(stats, weights, keys) {
  let score = 0;
  for (const key of keys) score += (stats[key] ?? 0) * (weights[key] ?? 0);
  return score;
}

/**
 * Score every item of the given type.
 *
 * @param items    items.json object
 * @param type     'weapons' | 'armor'
 * @param weights  { weapon, armor, magicArmor }
 * @param separateMagic whether magic armor uses the magicArmor weights and its own block
 * @returns Map id → { score, tier, magic }
 */
export function computeScores(items, type, weights, separateMagic) {
  const result = new Map();
  const wantType = type === 'weapons' ? 'weapon' : 'armor';
  const keys = STATS[type];

  for (const item of Object.values(items)) {
    if (item.type !== wantType) continue;

    let magic = false;
    let set = type === 'weapons' ? weights.weapon : weights.armor;
    if (type === 'armor' && separateMagic && isMagic(item)) {
      magic = true;
      set = weights.magicArmor;
    }

    // Weapons are rated by DPS with each stat raised to its weight (0–1): at weight 0 the
    // stat contributes a neutral factor of 1, at weight 1 its full value. The product is
    // divided by the tier multiplier so the default weights match the chapter.
    // Armor is a weighted sum of its stats.
    const score = type === 'weapons'
      ? weightedProduct(item.stats, set, keys) / (weights.weaponTierMultiplier ?? 1)
      : weightedSum(item.stats, set, keys);
    const tier = Math.floor(Math.max(0, score));
    result.set(item.id, { score, tier, magic });
  }
  return result;
}
