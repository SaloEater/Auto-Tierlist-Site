// Tiered view layout: rows are tiers, columns are grouped by Armageddon tier with an
// "Other" group first for untagged items. No links.

const GROUP_GAP = 1; // empty columns between groups
const MAX_PER_LINE = 15; // items side by side in one group before wrapping

/**
 * @param items          array of items of the current type
 * @param scores         Map id → { score, tier, magic }
 * @param armageddonTiers meta.json → armageddonTiers
 * @returns { nodes, rows, links: [], separators, groups, width, height }
 */
export function layoutTiered(items, scores, armageddonTiers) {
  // Group order: untagged items first, then Armageddon tiers in meta order
  const groupDefs = [{ key: null }, ...armageddonTiers.map(t => ({ key: t.index, tier: t }))];
  const tierKey = item => `${scores.get(item.id).magic}:${scores.get(item.id).tier}`;

  // Items of each group per tier, ordered by score
  const cells = new Map(); // group key → Map(tierKey → items)
  for (const def of groupDefs) {
    const byTier = new Map();
    for (const item of items) {
      if ((item.armageddonTier ?? null) !== def.key) continue;
      const key = tierKey(item);
      if (!byTier.has(key)) byTier.set(key, []);
      byTier.get(key).push(item);
    }
    for (const list of byTier.values()) {
      list.sort((a, b) => scores.get(a.id).score - scores.get(b.id).score || a.id.localeCompare(b.id));
    }
    if (byTier.size) cells.set(def.key, byTier);
  }

  // A group holds at most MAX_PER_LINE items side by side; more wrap onto further lines
  // within the same tier, which grows to the tallest group's line count
  const spanOf = new Map(); // tierKey → lines
  for (const byTier of cells.values()) {
    for (const [key, list] of byTier) {
      spanOf.set(key, Math.max(spanOf.get(key) ?? 1, Math.ceil(list.length / MAX_PER_LINE)));
    }
  }

  // Rows: regular tiers, then (when magic armor is separated) a separator row and the magic
  // tiers with their own numbering, the same block structure as the crafted view
  const rows = [];
  const separators = [];
  const rowOf = new Map(); // tierKey → first row index
  let rowIndex = 0;

  for (const magic of [false, true]) {
    const tiers = [...new Set(items
      .filter(i => scores.get(i.id).magic === magic)
      .map(i => scores.get(i.id).tier))].sort((a, b) => a - b);
    if (!tiers.length) continue;

    if (magic && rows.length) {
      separators.push(rowIndex);
      rowIndex++; // one empty row between blocks
    }
    for (const tier of tiers) {
      const key = `${magic}:${tier}`;
      const span = spanOf.get(key) ?? 1;
      rowOf.set(key, rowIndex);
      rows.push({ index: rowIndex, span, tier, magic });
      rowIndex += span;
    }
  }

  // Columns: each group is as wide as its longest line, capped at MAX_PER_LINE; group
  // columns are shared by both blocks so separators and headers line up throughout
  const nodes = [];
  const groups = [];
  let nextCol = 0;

  for (const def of groupDefs) {
    const byTier = cells.get(def.key);
    if (!byTier) continue;

    let width = 1;
    for (const [key, list] of byTier) {
      list.forEach((item, i) => nodes.push({
        id: item.id,
        col: nextCol + (i % MAX_PER_LINE),
        row: rowOf.get(key) + Math.floor(i / MAX_PER_LINE),
        ghost: false,
      }));
      width = Math.max(width, Math.min(list.length, MAX_PER_LINE));
    }

    groups.push({
      key: def.key,
      startCol: nextCol,
      endCol: nextCol + width - 1,
      headerItem: def.tier?.headerItem ?? null,
      label: def.tier?.label ?? null,
    });
    nextCol += width + GROUP_GAP;
  }

  const width = groups.length ? groups[groups.length - 1].endCol + 1 : 0;
  return { nodes, rows, links: [], separators, groups, width, height: rowIndex };
}
