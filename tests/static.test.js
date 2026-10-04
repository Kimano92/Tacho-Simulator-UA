// TEST 4 — NO DIRECT CLOCK WRITES + OWNERSHIP (static scan). Only engine.js step() may write the clock; each engine module writes only its own state.
const { t, group } = require('./lib.js'), assert = require('assert'), fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const W = '(?<![=!<>])=(?!=)';
const CLOCK_WRITE = new RegExp('(\\.|\\b)sim\\s*(\\+=|-=|\\*=|\\/=|' + W + ')|\\.sim\\s*(\\+\\+|--)|\\bfdMs\\b');
const TECH_WRITE = [new RegExp('\\bS\\.(sim|d|ferry|fs|er|log|auto|out|veh)\\s*(\\+=|-=|' + W + '|\\+\\+|--)'), /\bS\.log\.(push|splice|pop|shift)/, new RegExp('\\bD\\([^)]*\\)\\.(c|mode|sc|ec|last|unk|st|act)\\s*(\\+=|-=|' + W + ')'), new RegExp('\\bS\\.d\\[[^\\]]+\\]\\.\\w+\\s*(\\+=|-=|' + W + ')')];
group('B. new engine tests');
t('TEST 4: checker self-test detects forbidden writes and ignores reads', () => {
  for (const bad of ['S.sim += 1000', 'S.sim -= 5', 'x.sim = 7', 'state.sim=1', 'S.sim++', 'S.fdMs += 1']) assert.ok(CLOCK_WRITE.test(bad), bad);
  for (const ok of ['if (S.sim == 3)', 'const a = S.sim', 'sim: t(5,7,0)', 'x.sim === 1', 'a.sim !== b.sim']) assert.ok(!CLOCK_WRITE.test(ok), ok);
});
t('TEST 4: app.js has NO direct clock writes', () => { assert.deepStrictEqual(strip(read('app.js')).split('\n').filter(l => CLOCK_WRITE.test(l)), []); });
t('TEST 4: index.html has no inline script and no clock writes', () => { const h = read('index.html'); assert.ok(!/<script>[\s\S]*\S[\s\S]*<\/script>/.test(h)); assert.ok(!CLOCK_WRITE.test(strip(h))); });
t('TEST 4: engine.js writes the clock only in step() and in fixture/migration builders', () => {
  const L = strip(read('engine.js')).split('\n').filter(l => new RegExp('\\bsim\\s*(\\+=|-=|' + W + ')').test(l)).map(l => l.trim());
  const allowed = [/n\.sim = st\.sim/, /T\.sim = o\.sim/, /T\.sim \+= seg/, /sim: Date\.UTC/]; assert.deepStrictEqual(L.filter(l => !allowed.some(r => r.test(l))), []); assert.ok(L.some(l => /T\.sim \+= seg/.test(l)));
});
t('TEST 4: engine.js is pure (no Date.now, timers, Math.random, DOM) — card/manual timers are simulation time', () => { assert.ok(!/Date\.now|setInterval|setTimeout|Math\.random|document\.|window\./.test(strip(read('engine.js')))); });
t('TEST 4: app.js has NO direct writes of engine-owned state; app.js has no technical setTimeout', () => {
  const src = strip(read('app.js')).split('\n'), hits = []; src.forEach((l, i) => TECH_WRITE.forEach(r => { if (r.test(l)) hits.push((i + 1) + ': ' + l.slice(0, 80)); })); assert.deepStrictEqual(hits, []);
  assert.ok(!/setTimeout\([^)]*(CARD|insert|eject|D2\()/.test(strip(read('app.js'))), 'technical logic must not use real timers');
});
t('TEST 4: app uses only E.advance/E.jumpTo/E.pump/E.dispatch to change time', () => { const a = read('app.js'); for (const k of ['E.advance(', 'E.jumpTo(', 'E.pump(', 'E.dispatch(']) assert.ok(a.includes(k), k); });
// OWNERSHIP: module X may be written only inside its own block (LEGACY block is exempt: fixture/migration builders)
t('OWNERSHIP: no engine module writes the state of another module (static scan of engine.js)', () => {
  const raw = read('engine.js'); const blk = {}; let rest = raw;
  for (const m of ['EVENT', 'LEDGER', 'VEHICLE', 'ACTIVITY', 'FERRY', 'CARD']) { const r = new RegExp('// MODULE:' + m + '[\\s\\S]*?// END:' + m); const x = raw.match(r); assert.ok(x, 'missing block ' + m); blk[m] = strip(x[0]); rest = rest.replace(x[0], ''); }
  rest = strip(rest.replace(/\/\/ LEGACY:BEGIN[\s\S]*?\/\/ LEGACY:END/, ''));
  const OWN = {
    EVENT: new RegExp('\\bT\\.ev(Seq)?\\b\\s*(' + W + '|\\.push|\\+\\+)|\\+\\+T\\.evSeq'),
    LEDGER: new RegExp('T\\.led(\\.\\w+)*(\\[[^\\]]*\\])?\\s*(' + W + '|\\.push)|\\bT\\.led\\.\\w+\\[[^\\]]*\\]\\s*' + W),
    VEHICLE: new RegExp('\\bT\\.veh(\\.\\w+)?\\s*' + W),
    ACTIVITY: new RegExp('\\.(seg|act|fin)\\s*(' + W + '|\\.push|\\.shift|\\+\\+)|\\bT\\.retro(\\.\\w+)?\\s*' + W + '|\\.mode\\s*' + W),
    FERRY: new RegExp('\\bT\\.(ferry|fs|finfo|out)\\s*(' + W + '|\\+\\+)'),
    CARD: new RegExp('\\.(st|due|ses|civ|cardId|hold|man|c|sc|ec|last|unk)\\s*(' + W + '|\\+\\+)|\\bT\\.(log|er)\\b\\s*(' + W + '|\\.push|\\+\\+)')
  };
  const probes = { EVENT: 'T.ev.push(x)', LEDGER: 'T.led.vu[1].push(x)', VEHICLE: 'T.veh.motion = 1', ACTIVITY: 's.seg.push(x)', FERRY: 'T.ferry = 0', CARD: 's.st = 1' };
  for (const m of Object.keys(OWN)) assert.ok(OWN[m].test(probes[m]), 'self-test ' + m);
  for (const m of Object.keys(OWN)) { const others = rest + Object.keys(blk).filter(k => k !== m).map(k => blk[k]).join('\n'); const hits = others.split('\n').filter(l => OWN[m].test(l)).map(l => l.trim().slice(0, 90)); assert.deepStrictEqual(hits, [], m + ' state written outside its module'); }
});
