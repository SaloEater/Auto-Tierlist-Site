// Crafted view layout: a port of the mod's ProgressionHelper column assignment.
// Rows are tiers (lowest at the top); connected items form chains that each get a
// contiguous block of columns, with an output never left of its ingredient.

function namespace(id) {
  return id.split(':')[0];
}

/**
 * Depth of each item below same-tier ingredients: 0 when nothing it is crafted from is in
 * its own tier, otherwise one more than its deepest same-tier ingredient. A tier is drawn
 * with (max depth + 1) sub-rows and each item sits on the sub-row of its depth, so a result
 * crafted from a same-tier ingredient stays in that tier but appears below it.
 * Port of ProgressionHelper.computeSameTierDepths; cycles count as depth 0.
 */
function computeSameTierDepths(ids, graph, tierOf) {
  const depths = new Map();
  const visiting = new Set();

  function depth(id) {
    if (depths.has(id)) return depths.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let d = 0;
    for (const dep of graph.get(id) ?? []) {
      if (tierOf.get(dep) === tierOf.get(id)) d = Math.max(d, depth(dep) + 1);
    }
    visiting.delete(id);
    depths.set(id, d);
    return d;
  }

  for (const id of ids) depth(id);
  return depths;
}

/**
 * Port of ProgressionHelper.assignProgressionColumns.
 *
 * @param ids     item ids of one block
 * @param graph   Map output → Set(ingredient), restricted to ids
 * @param tierOf  Map id → tier
 * @param scoreOf Map id → score
 * @param depthOf Map id → sub-row within the tier
 * @returns Map id → column
 */
function assignProgressionColumns(ids, graph, tierOf, scoreOf, depthOf) {
  const columns = new Map();
  const itemSet = new Set(ids);

  // Reverse graph: ingredient → outputs that use it
  const reverse = new Map();
  for (const [output, ingredients] of graph) {
    for (const ing of ingredients) {
      if (!itemSet.has(ing)) continue;
      if (!reverse.has(ing)) reverse.set(ing, new Set());
      reverse.get(ing).add(output);
    }
  }

  const withDeps = new Set();
  for (const id of ids) {
    const ings = graph.get(id);
    if (ings && [...ings].some(i => itemSet.has(i))) withDeps.add(id);
  }
  const usedAsDeps = new Set(reverse.keys());

  // Items outside any chain; placed after the chains, see the end of this function
  const sequential = ids.filter(id => !withDeps.has(id) && !usedAsDeps.has(id));

  // Chains: items connected through dependencies
  const chains = [];
  const processed = new Set();
  const tierKey = id => tierOf.get(id) ?? Number.MAX_SAFE_INTEGER;

  function buildChain(id, chain) {
    if (chain.has(id)) return;
    if (!withDeps.has(id) && !usedAsDeps.has(id)) return;
    chain.add(id);
    for (const dep of graph.get(id) ?? []) {
      if (itemSet.has(dep) && usedAsDeps.has(dep)) buildChain(dep, chain);
    }
    for (const dependent of reverse.get(id) ?? []) {
      if (itemSet.has(dependent) && withDeps.has(dependent)) buildChain(dependent, chain);
    }
  }

  const sortedWithDeps = [...withDeps].sort((a, b) => tierKey(a) - tierKey(b) || a.localeCompare(b));
  for (const id of sortedWithDeps) {
    if (processed.has(id)) continue;
    const chain = new Set();
    buildChain(id, chain);
    if (chain.size) {
      chains.push(chain);
      for (const c of chain) processed.add(c);
    }
  }
  for (const dep of usedAsDeps) {
    if (!processed.has(dep)) {
      chains.push(new Set([dep]));
      processed.add(dep);
    }
  }

  const minTier = chain => Math.min(...[...chain].map(tierKey));
  chains.sort((a, b) => minTier(a) - minTier(b));

  // Chains first, from column 0
  let nextColumn = 0;
  for (const chain of chains) {
    const start = nextColumn;
    assignChainColumns(chain, columns, graph, tierOf, scoreOf, depthOf, start);
    let maxUsed = start - 1;
    for (const id of chain) if (columns.has(id)) maxUsed = Math.max(maxUsed, columns.get(id));
    nextColumn = maxUsed + 1;
  }

  // Then items without crafting links, packed per tier after the last chain column
  const byTier = new Map();
  for (const id of sequential) {
    const tier = tierOf.get(id) ?? 0;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(id);
  }
  for (const list of byTier.values()) {
    list.sort((a, b) => namespace(a).localeCompare(namespace(b))
      || (scoreOf.get(a) ?? 0) - (scoreOf.get(b) ?? 0)
      || a.localeCompare(b));
    list.forEach((id, i) => columns.set(id, nextColumn + i));
  }

  return columns;
}

/**
 * Port of ProgressionHelper.assignChainColumns, extended with same-tier sub-rows: a cell is
 * a (column, tier, depth) slot, so a result can sit directly below a same-tier ingredient.
 */
function assignChainColumns(chain, columns, graph, tierOf, scoreOf, depthOf, startColumn) {
  const assigned = new Set();
  const tierKey = id => tierOf.get(id) ?? Number.MAX_SAFE_INTEGER;
  const depthKey = id => depthOf.get(id) ?? 0;

  // Ingredients before results, also within a tier
  const items = [...chain].sort((a, b) => tierKey(a) - tierKey(b)
    || depthKey(a) - depthKey(b)
    || (scoreOf.get(a) ?? 0) - (scoreOf.get(b) ?? 0)
    || a.localeCompare(b));

  const occupied = (column, tier, depth) => {
    for (const [id, col] of columns) {
      if (col === column && assigned.has(id)
          && (tierOf.get(id) ?? 0) === tier && depthKey(id) === depth) return true;
    }
    return false;
  };

  let nextColumn = startColumn;
  for (const item of items) {
    if (assigned.has(item)) continue;
    const itemTier = tierOf.get(item) ?? 0;
    const itemDepth = depthKey(item);
    const depsInChain = [...(graph.get(item) ?? [])].filter(d => chain.has(d) && assigned.has(d));

    let column = null;
    if (depsInChain.length) {
      let maxColumn = -1;
      let rightMost = null;
      for (const dep of depsInChain) {
        const depColumn = columns.get(dep);
        // The dependency must be drawn above the item: an earlier tier, or the same tier
        // on a higher sub-row
        const depTier = tierOf.get(dep) ?? 0;
        const above = depTier < itemTier || (depTier === itemTier && depthKey(dep) < itemDepth);
        if (!occupied(depColumn, itemTier, itemDepth) && depColumn > maxColumn && above) {
          maxColumn = depColumn;
          rightMost = dep;
        }
      }
      if (rightMost !== null) column = columns.get(rightMost);
    }

    if (column === null) column = nextColumn++;

    // Never left of any dependency
    if (depsInChain.length) {
      const maxDep = Math.max(...depsInChain.map(d => columns.get(d)));
      if (column < maxDep) {
        column = maxDep;
        while (occupied(column, itemTier, itemDepth)) column++;
        if (column >= nextColumn) nextColumn = column + 1;
      }
    }

    columns.set(item, column);
    assigned.add(item);
  }
}

/**
 * Lay out the crafted view.
 *
 * @param items   array of items of the current type
 * @param scores  Map id → { score, tier, magic }
 * @param edges   [{ output, ingredient, recipeId }]
 * @param maxTier Armageddon tier filter (index) or null
 * @param showNextTier whether the tier after maxTier is shown greyed out rather than hidden
 * @returns { nodes, rows, links, separators, width, height }
 */
export function layoutCrafted(items, scores, edges, maxTier, showNextTier = true) {
  // Filter: tier ≤ N normal, N+1 greyed out (or hidden when showNextTier is off),
  // > N+1 hidden; untagged always normal
  const visible = [];
  const ghost = new Set();
  const current = new Set(); // items of exactly the selected tier, marked with a star
  for (const item of items) {
    const t = item.armageddonTier;
    if (maxTier !== null && t === maxTier) current.add(item.id);
    if (maxTier !== null && t !== null) {
      if (t > maxTier + 1) continue;
      if (t === maxTier + 1) {
        if (!showNextTier) continue;
        ghost.add(item.id);
      }
    }
    visible.push(item);
  }

  const visibleIds = new Set(visible.map(i => i.id));
  const tierOf = new Map();
  const scoreOf = new Map();
  for (const item of visible) {
    const s = scores.get(item.id);
    tierOf.set(item.id, s.tier);
    scoreOf.set(item.id, s.score);
  }

  // Graph restricted to visible items
  const graph = new Map();
  const links = [];
  for (const e of edges) {
    if (!visibleIds.has(e.output) || !visibleIds.has(e.ingredient)) continue;
    if (!graph.has(e.output)) graph.set(e.output, new Set());
    graph.get(e.output).add(e.ingredient);
    links.push({ from: e.ingredient, to: e.output, recipeId: e.recipeId ?? null });
  }

  const blocks = [
    { magic: false, ids: visible.filter(i => !scores.get(i.id).magic).map(i => i.id) },
    { magic: true, ids: visible.filter(i => scores.get(i.id).magic).map(i => i.id) },
  ].filter(b => b.ids.length);

  const nodes = [];
  const rows = [];
  const separators = [];
  let rowIndex = 0;
  let width = 0;

  for (const block of blocks) {
    const blockSet = new Set(block.ids);
    const blockGraph = new Map();
    for (const [out, ings] of graph) {
      if (!blockSet.has(out)) continue;
      const kept = new Set([...ings].filter(i => blockSet.has(i)));
      if (kept.size) blockGraph.set(out, kept);
    }

    const depthOf = computeSameTierDepths(block.ids, blockGraph, tierOf);
    const columns = assignProgressionColumns(block.ids, blockGraph, tierOf, scoreOf, depthOf);

    if (block.magic && rows.length) {
      separators.push(rowIndex);
      rowIndex++; // one empty row between blocks
    }

    // A tier spans one sub-row per same-tier crafting depth
    const spanOfTier = new Map();
    for (const id of block.ids) {
      const tier = tierOf.get(id);
      spanOfTier.set(tier, Math.max(spanOfTier.get(tier) ?? 1, (depthOf.get(id) ?? 0) + 1));
    }

    const tiers = [...spanOfTier.keys()].sort((a, b) => a - b);
    const rowOfTier = new Map();
    for (const tier of tiers) {
      const span = spanOfTier.get(tier);
      rowOfTier.set(tier, rowIndex);
      rows.push({ index: rowIndex, span, tier, magic: block.magic });
      rowIndex += span;
    }

    for (const id of block.ids) {
      const col = columns.get(id) ?? 0;
      width = Math.max(width, col + 1);
      const row = rowOfTier.get(tierOf.get(id)) + (depthOf.get(id) ?? 0);
      nodes.push({ id, col, row, ghost: ghost.has(id), current: current.has(id) });
    }
  }

  return { nodes, rows, links, separators, groups: [], width, height: rowIndex };
}
