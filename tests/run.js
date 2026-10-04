// node tests/run.js  — runs everything and prints counts per group. No dependencies.
const L = require('./lib.js');
require('./engine.test.js'); require('./static.test.js'); require('./app.test.js');
require('./ui-journeys.js')().then(() => {
  const g = {}; for (const r of L.results) { (g[r.grp] = g[r.grp] || []).push(r); }
  let bad = 0;
  for (const k of Object.keys(g)) { const p = g[k].filter(x => x.ok).length; console.log(`\n== ${k}: ${p}/${g[k].length} passed`); for (const r of g[k]) if (!r.ok) { bad++; console.log('  FAIL ' + r.name + (r.err ? '\n       ' + r.err.split('\n')[0] : '')); } }
  const tot = L.results.length, pass = L.results.filter(x => x.ok).length; console.log(`\nTOTAL ${tot}  PASS ${pass}  FAIL ${tot - pass}`);
  process.exit(bad ? 1 : 0);
}).catch(e => { console.error('RUNNER ERROR', e); process.exit(2); });
