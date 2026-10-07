// Armageddon tier colours. meta.json gives each tier a Minecraft formatting-code character;
// these are the game's own colours for those codes.

const FORMATTING_COLORS = {
  '0': '#000000', '1': '#0000aa', '2': '#00aa00', '3': '#00aaaa',
  '4': '#aa0000', '5': '#aa00aa', '6': '#ffaa00', '7': '#aaaaaa',
  '8': '#555555', '9': '#5555ff', 'a': '#55ff55', 'b': '#55ffff',
  'c': '#ff5555', 'd': '#ff55ff', 'e': '#ffff55', 'f': '#ffffff',
};

/** Hex colour of a formatting code, or null for an unknown code. */
export function formattingColor(code) {
  return FORMATTING_COLORS[String(code ?? '').toLowerCase()] ?? null;
}

/** The colour as rgba() with the given alpha. */
export function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Build lookups from the export: `tier(index)` → hex for an Armageddon tier and
 * `item(id)` → hex for an item's Armageddon tier. Both return null when there is none.
 */
export function buildPalette(items, armageddonTiers) {
  const byIndex = new Map(armageddonTiers.map(t => [t.index, formattingColor(t.color)]));
  const tier = index => (index === null || index === undefined ? null : byIndex.get(index) ?? null);
  return {
    tier,
    item: id => tier(items[id]?.armageddonTier ?? null),
  };
}
