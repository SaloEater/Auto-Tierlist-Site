// Compare the stats the viewer derives from raw attributes (stats.js) with the stats the
// mod exported, item by item. Not loaded by the site; run from the repository root or site/:
//
//   node site/tools/compare-stats.mjs [path/to/export]
//
// The export directory defaults to site/data. Needs a schema 2 export (items with
// `attributes` and the attribute catalogue in meta.json).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveStats } from '../js/stats.js';

const EPSILON = 1e-6;
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2] ?? path.join(here, '..', 'data'));

function readJson(file) {
  // Older exports wrote infinite values as bare Infinity/NaN, which is not valid JSON
  const text = fs.readFileSync(path.join(dir, file), 'utf8').replace(/:\s*-?(?:Infinity|NaN)\b/g, ': null');
  return JSON.parse(text);
}

const meta = readJson('meta.json');
const items = readJson('items.json');
const withAttributes = Object.values(items).filter(item => item.attributes);

if (!withAttributes.length) {
  console.log(`No items in ${dir} have \`attributes\` (export schema ${meta.schema}); nothing to compare.`);
  console.log('Regenerate with the current mod to get a schema 2 export.');
  process.exit(0);
}

const catalogue = meta.attributes ?? {};
let itemsWithDiffs = 0;
let statDiffs = 0;

for (const item of withAttributes) {
  const derived = deriveStats(item, catalogue);
  const lines = [];
  for (const [stat, exported] of Object.entries(item.stats ?? {})) {
    const mine = derived[stat];
    const same = (exported === null && mine === null)
      || (typeof exported === 'number' && typeof mine === 'number' && Math.abs(exported - mine) <= EPSILON);
    if (!same) lines.push(`  ${stat}: exported ${exported}, derived ${mine}`);
  }
  if (lines.length) {
    itemsWithDiffs++;
    statDiffs += lines.length;
    console.log(`${item.id} (${item.type})`);
    for (const line of lines) console.log(line);
  }
}

console.log(`\n${withAttributes.length} items compared, ${itemsWithDiffs} with differences (${statDiffs} stats).`);
