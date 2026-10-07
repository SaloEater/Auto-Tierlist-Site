// Turning an item's raw attribute modifiers (schema 2 export) into the stats the viewer
// scores: damage, attackSpeed for weapons; armor, toughness, mana, spellPower and
// flatSpellPower for armor. Every interpretation of attribute IDs lives in this file.

/** Stats each item type ends up with; missing ones are 0. */
export const STATS_BY_TYPE = {
  weapon: ['damage', 'attackSpeed'],
  armor: ['armor', 'toughness', 'mana', 'spellPower', 'flatSpellPower'],
};

/**
 * Attribute → stat rules, tried in order; the first rule matching an attribute ID claims it.
 *
 * value:
 *   total    – the attribute's value on a player with only this item:
 *              (default + addition) × (1 + multiply_base) × (1 + multiply_total)
 *   bonus    – what the item adds on top of the default: total − default
 *   fraction – a percentage attribute's bonus relative to its default: (total − default) / default
 * pick 'max' – among all attributes matching rules with this flag for the same stat, only the
 *              largest counts (the best spell school); other rules for a stat are summed.
 */
export const STAT_RULES = [
  // weapons
  { type: 'weapon', stat: 'damage', match: /^minecraft:generic\.attack_damage$/, value: 'total' },
  { type: 'weapon', stat: 'attackSpeed', match: /^minecraft:generic\.attack_speed$/, value: 'total' },
  // armor
  { type: 'armor', stat: 'armor', match: /^minecraft:generic\.armor$/, value: 'bonus' },
  { type: 'armor', stat: 'toughness', match: /^minecraft:generic\.armor_toughness$/, value: 'bonus' },
  { type: 'armor', stat: 'mana', match: /max_mana$/, value: 'bonus' },
  { type: 'armor', stat: 'spellPower', match: /^irons_spellbooks:spell_power$/, value: 'fraction' },
  { type: 'armor', stat: 'spellPower', match: /^irons_spellbooks:\w+_spell_power$/, value: 'fraction', pick: 'max' },
  { type: 'armor', stat: 'flatSpellPower', match: /^ars_nouveau:ars_nouveau\.perk\.spell_damage$/, value: 'bonus' },
];

/** Armor with any of these stats above 0 is magic armor. */
export const MAGIC_STATS = ['mana', 'spellPower', 'flatSpellPower'];

/**
 * Value of one attribute from its summed modifiers, or null when any amount is null
 * (the game reported it as infinite).
 */
/**
 * The value an attribute starts from: for totals the player's own base where the export
 * has it (attack damage 1, not the attribute default 2), otherwise the attribute default.
 */
function baseValue(entry, mode) {
  if (!entry) return 0;
  if (mode === 'total' && typeof entry.playerBase === 'number') return entry.playerBase;
  return entry.default ?? 0;
}

function attributeValue(ops, def, mode) {
  const amounts = [ops.addition, ops.multiply_base, ops.multiply_total];
  if (amounts.some(a => a === null)) return null;
  const [add = 0, base = 0, total = 0] = amounts;

  // Sums per operation are exported, so several multiply_total modifiers are combined as
  // one factor (1 + Σ) rather than Π(1 + amount); exact for a single modifier
  const value = (def + add) * (1 + base) * (1 + total);
  if (mode === 'total') return value;
  if (mode === 'bonus') return value - def;
  return def !== 0 ? (value - def) / def : value; // fraction
}

/**
 * Derive the stats of one item from its `attributes`. A stat is null when one of its
 * attributes is infinite; {@link deriveAllStats} resolves those.
 *
 * @param item      an items.json entry with `type` and `attributes`
 * @param catalogue meta.json → attributes (id → { default })
 */
export function deriveStats(item, catalogue) {
  const keys = STATS_BY_TYPE[item.type] ?? [];
  const sums = Object.fromEntries(keys.map(k => [k, 0]));
  const best = {}; // stat → largest value among pick: 'max' rules

  for (const [id, ops] of Object.entries(item.attributes ?? {})) {
    const rule = STAT_RULES.find(r => r.type === item.type && r.match.test(id));
    if (!rule) continue;
    const value = attributeValue(ops, baseValue(catalogue[id], rule.value), rule.value);

    if (rule.pick === 'max') {
      if (value === null || best[rule.stat] === null) best[rule.stat] = null;
      else best[rule.stat] = Math.max(best[rule.stat] ?? 0, value);
    } else if (value === null || sums[rule.stat] === null) {
      sums[rule.stat] = null;
    } else {
      sums[rule.stat] += value;
    }
  }

  for (const [stat, value] of Object.entries(best)) {
    sums[stat] = value === null || sums[stat] === null ? null : sums[stat] + value;
  }

  // An item with no damage/speed modifiers still has the attributes' defaults
  for (const rule of STAT_RULES) {
    if (rule.type !== item.type || rule.value !== 'total') continue;
    const touched = Object.keys(item.attributes ?? {}).some(id => rule.match.test(id));
    if (!touched) {
      const entry = Object.entries(catalogue).find(([id]) => rule.match.test(id))?.[1];
      const def = entry ? baseValue(entry, 'total') : undefined;
      if (def !== undefined) sums[rule.stat] = def;
    }
  }
  return sums;
}

/**
 * Replace null stats (infinite in game, e.g. infinite attack damage) with the highest
 * finite value of that stat, so the item lands at the top of the list.
 */
export function fillInfiniteStats(items) {
  const maxStat = new Map();
  for (const item of Object.values(items)) {
    for (const [key, value] of Object.entries(item.stats ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        maxStat.set(key, Math.max(maxStat.get(key) ?? 0, value));
      }
    }
  }
  for (const item of Object.values(items)) {
    for (const [key, value] of Object.entries(item.stats ?? {})) {
      if (value === null) item.stats[key] = maxStat.get(key) ?? 0;
    }
  }
}

/**
 * Derive `stats` for every item that has `attributes` (items without them keep their
 * exported `stats`), then resolve infinite values.
 */
export function deriveAllStats(items, catalogue) {
  for (const item of Object.values(items)) {
    if (item.attributes) item.stats = deriveStats(item, catalogue);
  }
  fillInfiniteStats(items);
}
