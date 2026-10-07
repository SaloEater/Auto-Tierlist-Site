// Rebuilds the game's "When in Main Hand:" / "When on Body:" tooltip block from the
// exported attribute modifiers, coloured like the game (ItemStack.getTooltipLines).

import { attributeName, gameFormat } from './i18n.js';

const GRAY = '#aaaaaa';
const DARK_GREEN = '#00aa00';
const BLUE = '#5555ff';
const RED = '#ff5555';

const OPERATION_INDEX = { addition: 0, multiply_base: 1, multiply_total: 2 };

/**
 * Java String.format subset used by Minecraft translations: %s, positional %1$s, and %%.
 */
function formatJava(pattern, args) {
  let next = 0;
  return pattern.replace(/%(?:(\d+)\$)?([s%])/g, (_, pos, kind) => {
    if (kind === '%') return '%';
    const arg = pos ? args[Number(pos) - 1] : args[next++];
    return arg === undefined ? '' : String(arg);
  });
}

/** The game's "#.##" number format: up to two decimals, no trailing zeros. */
function formatNumber(value) {
  if (value === null || !Number.isFinite(value)) return '∞';
  const s = Number(value.toFixed(2)).toString();
  return s === '-0' ? '0' : s;
}

/**
 * Merge modifiers of the same attribute and operation into one, summing their amounts, so
 * e.g. a base "+34" and an extra "-15" attack damage become a single " 20 Attack Damage".
 * A merged modifier is a base one if any of its parts is (base modifiers are additions),
 * and keeps the position of its first part. An infinite part makes the sum infinite.
 */
function mergeModifiers(modifiers) {
  const merged = new Map();
  for (const mod of modifiers) {
    const key = `${mod.attribute}|${mod.operation}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...mod });
      continue;
    }
    current.amount = current.amount === null || mod.amount === null ? null : current.amount + mod.amount;
    if (mod.base) current.base = true;
  }
  return [...merged.values()];
}

/**
 * Lines of the modifier block for one item, as [{ text, color }], or [] when the export
 * has no modifiers or the language file lacks the game's format strings.
 *
 * @param item      items.json entry with `type` and `modifiers`
 * @param catalogue meta.json → attributes (for each attribute's playerBase)
 */
export function modifierLines(item, catalogue) {
  if (!Array.isArray(item.modifiers) || !item.modifiers.length) return [];
  const header = gameFormat(item.type === 'weapon' ? 'item.modifiers.mainhand' : 'item.modifiers.chest');
  if (header === null) return [];

  const lines = [{ text: '', color: null }, { text: header, color: GRAY }];
  for (const mod of mergeModifiers(item.modifiers)) {
    const op = OPERATION_INDEX[mod.operation] ?? 0;
    const name = attributeName(mod.attribute);
    let amount = mod.amount;

    // A weapon's own damage/speed modifier is shown as the player's base value plus the
    // amount, e.g. 4 + (-2.4) = "1.6 Attack Speed"
    if (mod.base) {
      const entry = catalogue[mod.attribute] ?? {};
      amount = amount === null ? null : amount + (entry.playerBase ?? entry.default ?? 0);
    }

    // Percentage operations are shown ×100; knockback resistance additions ×10
    let shown = amount;
    if (amount !== null) {
      if (op !== 0) shown = amount * 100;
      else if (mod.attribute === 'minecraft:generic.knockback_resistance') shown = amount * 10;
    }

    let key;
    let color;
    if (mod.base) {
      key = `attribute.modifier.equals.${op}`;
      color = DARK_GREEN;
    } else if (amount === null || amount > 0) {
      key = `attribute.modifier.plus.${op}`;
      color = BLUE;
    } else if (amount < 0) {
      key = `attribute.modifier.take.${op}`;
      color = RED;
      shown = -shown;
    } else {
      continue; // zero modifiers are not shown
    }

    const pattern = gameFormat(key);
    if (pattern === null) continue;
    const text = formatJava(pattern, [formatNumber(shown), name]);
    lines.push({ text: mod.base ? ` ${text}` : text, color });
  }
  return lines.length > 2 ? lines : [];
}
