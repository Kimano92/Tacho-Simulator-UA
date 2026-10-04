const { t, group, add } = require('./lib.js'), assert = require('assert'), fs = require('fs'), path = require('path');
const { loadApp } = require('./harness.js'), TE = require('../engine.js'), crypto = require('crypto');
const sha = o => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12);
const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, 'scenario-baseline.json'), 'utf8'));
const U = (d, h, m) => Date.UTC(2026, 9, d, h, m), H = 3600000;

group('A. existing scenario assertions (scenario "exp" rows — NOT unit tests)');
(function () {
  const A = loadApp(); let rows = 0;
  t('39 scenarios preserved', () => assert.strictEqual(A.SC.length, 39));
  for (const s of A.SC) {
    t('scenario ' + s.id + ': exp/start unchanged vs Phase 0 baseline; rows preserved', () => {
      const b = BASE.byId[s.id]; assert.ok(b, 'missing in baseline'); assert.strictEqual(sha(s.exp), b.exp); assert.strictEqual(sha(s.start), b.start);
      A.startScn(s.id); assert.strictEqual(A.evalScn(s).length, b.rows);
    });
  }
  t('97 existing exp rows preserved (sum of evalScn rows over 39 scenarios)', () => {
    rows = 0; for (const s of A.SC) { A.startScn(s.id); rows += A.evalScn(s).length; } assert.strictEqual(rows, 97);
  });
})();

group('B. new engine tests');
// TEST 5 — LEGACY PRACTICE no longer touches the clock directly
t('TEST 5: S.sim / S.d / S.ferry are read-only views (assignment throws LEGACY-WRITE-BLOCKED)', () => {
  const A = loadApp(); for (const k of ['sim', 'ferry', 'fs', 'log', 'er', 'auto', 'd']) assert.throws(() => { A.S[k] = 1; }, /LEGACY-WRITE-BLOCKED/);
});
t('TEST 5: shift(+) goes through E.advance (journal grows, replay exact)', () => {
  const A = loadApp(), s0 = A.S.sim, j0 = A.E.info().journal; A.shift(10 * 60000); assert.strictEqual(A.S.sim, s0 + 600000); assert.ok(A.E.info().journal > j0); assert.ok(A.E.verifyReplay());
});
t('TEST 5: shift(-) is a real REWIND (checkpoint+replay, branch recorded), not subtraction', () => {
  const A = loadApp(), s0 = A.S.sim; A.shift(H); A.E.dispatch({ type: 'ACTIVITY', n: 1, mode: 'drive' }); A.shift(-30 * 60000);
  assert.strictEqual(A.S.sim, s0 + 30 * 60000); assert.strictEqual(A.E.info().branches, 1); assert.strictEqual(A.S.d[1].mode, 'rest'); assert.ok(A.E.verifyReplay());
});
t('TEST 5: rewinding before the start of history is refused with a message, clock unchanged', () => {
  const A = loadApp(), s0 = A.S.sim; A.shift(-H); assert.strictEqual(A.S.sim, s0);
});
t('TEST 5: setT forward = advance, backward = rewind (both via engine)', () => {
  const A = loadApp(), s0 = A.S.sim; A.els['#dt'] = A.mk(); A.els['#dt'].value = new Date(s0 + 5 * H).toISOString().slice(0, 16); A.setT(); assert.strictEqual(A.S.sim, s0 + 5 * H);
  A.els['#dt'].value = new Date(s0 + 2 * H).toISOString().slice(0, 16); A.setT(); assert.strictEqual(A.S.sim, s0 + 2 * H); assert.ok(A.E.verifyReplay());
});
t('TEST 5: mkSit(3) is EJECT + 24h ADVANCE journal entries (no teleport)', () => {
  const A = loadApp(); A.E.dispatch({ type: 'CARD_READY', n: 1 }); const s0 = A.S.sim; A.mkSit(3);
  const J = A.E.exportSession().J.map(e => e.a.type); assert.ok(J.indexOf('CARD_EJECT') >= 0 && J.indexOf('ADVANCE') > J.indexOf('CARD_EJECT'));
  assert.strictEqual(A.S.sim, s0 + 24 * H); assert.strictEqual(A.S.d[1].c, 0); assert.strictEqual(A.S.d[1].last, s0); assert.ok(A.E.verifyReplay());
});
t('TEST 5: mkState = jump + PRESET actions (journaled, replay-safe)', () => {
  const A = loadApp(); for (const q of ['#cdt', '#cdr', '#ccd', '#cac', '#ccn']) A.els[q] = A.mk();
  A.els['#cdt'].value = '2026-10-03T20:00'; A.els['#cdr'].value = '2'; A.els['#ccd'].value = '2'; A.els['#cac'].value = 'work'; A.els['#ccn'].value = 'Чехія'; A.mkState();
  assert.strictEqual(A.S.sim, U(3, 20, 0)); assert.strictEqual(A.S.d[2].mode, 'work'); assert.ok(A.E.exportSession().J.some(e => e.a.type === 'PRESET_DRIVER')); assert.ok(A.E.verifyReplay());
});
t('TEST 5: pause/resume and speed go through engine actions', () => {
  const A = loadApp(); A.tog('auto'); assert.strictEqual(A.S.auto, 0); A.spd(600); assert.strictEqual(A.E.state.spd, 600); assert.ok(A.E.verifyReplay());
});
t('TEST 5: app tick uses the real-clock DELTA (background gap not lost)', () => {
  const A = loadApp(); A.setReal(1e9); A.tick(); const s0 = A.S.sim; A.setReal(1e9 + 2 * H); A.tick(); assert.strictEqual(A.S.sim, s0 + 2 * H);
});

// TEST 6 — SCENARIO START goes through the engine
t('TEST 6: every one of the 39 scenarios starts via E.load(): clock=fixture, empty journal, checkpoint0 = legacyStart', () => {
  const A = loadApp();
  for (const s of A.SC) {
    const base = s.start.rel ? A.E.snapshot() : null; A.startScn(s.id);
    const ex = TE.legacyStart(s.start, base); assert.deepStrictEqual(A.E.checkpoint0(), Object.assign(ex, { schema: 2 }), s.id);
    assert.strictEqual(A.E.info().journal, 0, s.id); if (!s.start.rel) assert.strictEqual(A.S.sim, s.start.sim, s.id);
    A.exitScn();
  }
});
t('TEST 6: scenario isolation — exit restores the free-practice session incl. journal', () => {
  const A = loadApp(); A.shift(H); const before = A.E.canonical(), j = A.E.info().journal; A.startScn('s7'); A.E.dispatch({ type: 'CARD_EJECT', n: 1 }); A.exitScn();
  assert.strictEqual(A.E.canonical(), before); assert.strictEqual(A.E.info().journal, j); assert.ok(A.E.verifyReplay());
});
// engine-solved scenarios (explicit action sequences). NOT all 39 — see README.
const SOLVE = {
  s13: E => { E.dispatch({ type: 'CARD_READING', n: 1 }); E.dispatch({ type: 'CARD_READY', n: 1 }); E.dispatch({ type: 'MPERIOD', n: 1, a: 'rest', f: U(2, 20, 0), t: U(5, 7, 0) }); E.dispatch({ type: 'MDONE', n: 1, mode: 'rest', country: 'Польща' }); },
  s3: E => { E.dispatch({ type: 'CARD_READING', n: 1 }); E.dispatch({ type: 'CARD_READY', n: 1 }); E.dispatch({ type: 'MPERIOD', n: 1, a: 'rest', f: U(2, 18, 30), t: U(5, 7, 0) }); E.dispatch({ type: 'MDONE', n: 1, mode: 'rest', country: 'Німеччина' }); },
  s7: E => { E.dispatch({ type: 'CARD_EJECT', n: 1 }); E.dispatch({ type: 'COUNTRY', n: 1, kind: 'ec', v: 'Німеччина' }); },
  s21: E => { E.dispatch({ type: 'CARD_EJECT', n: 1 }); E.dispatch({ type: 'COUNTRY', n: 1, kind: 'ec', v: 'Франція' }); },
  s20: E => { E.dispatch({ type: 'FERRY_START' }); E.dispatch({ type: 'ACTIVITY', n: 1, mode: 'drive' }); E.advance(H); },
  s10: E => { E.dispatch({ type: 'FERRY_START' }); E.advance(600000); E.dispatch({ type: 'FERRY_END' }); },
  s11: E => { E.dispatch({ type: 'ACTIVITY', n: 1, mode: 'rest' }); E.dispatch({ type: 'ACTIVITY', n: 2, mode: 'drive' }); }
};
for (const id of Object.keys(SOLVE)) t('TEST 6: scenario ' + id + ' fails at start and passes after a pure ENGINE action sequence (no UI, no direct state)', () => {
  const A = loadApp(), s = A.SC.find(x => x.id === id); A.startScn(id); assert.ok(!A.evalScn(s).every(r => r[1]), 'already solved at start');
  SOLVE[id](A.E); const rows = A.evalScn(s); assert.ok(rows.every(r => r[1]), JSON.stringify(rows.filter(r => !r[1]))); assert.ok(A.E.verifyReplay());
});
t('TEST 6: scenario runner is separated: start checkpoint / expected / check (LEGACY adapters)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'); assert.ok(/const Scn=\{start:/.test(src) && /LEGACY: scenario fixture/.test(src));
});

// STATE: schema + migration
t('MIGRATION: old tachoUA5 save (pre-engine, fd in seconds) is migrated, old key kept', () => {
  const old = { sim: U(3, 20, 0), auto: 1, ferry: 1, fd: 30, fs: 1, er: 2, log: [{ n: 1, a: 'rest', f: 1, t: 2 }], scr: 'menu', snd: 0, dark: 1, scn: 0, free: '', d: [null, { c: 2, mode: 'work', sc: 'Польща', ec: '', last: 5, unk: 1 }, { c: 0, mode: 'rest', sc: '', ec: '', last: 0, unk: 0 }] };
  const A = loadApp({ storage: { tachoUA5: JSON.stringify(old) } });
  assert.strictEqual(A.S.sim, U(3, 20, 0)); assert.strictEqual(A.E.state.fdMs, 30000); assert.strictEqual(A.S.d[1].sc, 'Польща'); assert.strictEqual(A.S.d[1].unk, 1);
  assert.strictEqual(A.S.snd, 0); assert.strictEqual(A.S.dark, 1); assert.strictEqual(A.S.scr, 'home'); assert.ok(A.ls.tachoUA5, 'old save must not be deleted'); A.save(); assert.strictEqual(JSON.parse(A.ls.tachoUA6).schema, 2);
});
t('MIGRATION: old scenario "free" snapshot (legacy JSON) is restorable via exitScn', () => {
  const free = JSON.stringify({ sim: U(1, 8, 0), auto: 1, ferry: 0, fd: 0, fs: 0, er: 0, log: [], d: [null, { c: 2, mode: 'rest', sc: 'Литва', ec: '', last: 0, unk: 0 }, { c: 0, mode: 'rest', sc: '', ec: '', last: 0, unk: 0 }], scr: 'home', snd: 1, dark: 0, scn: 0, free: '' });
  const A = loadApp({ storage: { tachoUA6: JSON.stringify({ schema: 2, ui: { scn: 's7', free }, session: new (require('../engine.js').createEngine)().exportSession() }) } });
  A.exitScn(); assert.strictEqual(A.S.sim, U(1, 8, 0)); assert.strictEqual(A.S.d[1].sc, 'Литва');
});
t('STATE: saved v2 session round-trips through localStorage (reload keeps history; rewind still works)', () => {
  const A = loadApp(); A.shift(7 * H); A.save(); const B = loadApp({ storage: { tachoUA6: A.ls.tachoUA6 } });
  assert.strictEqual(B.S.sim, A.S.sim); assert.ok(B.E.verifyReplay()); B.shift(-3 * H); assert.strictEqual(B.S.sim, A.S.sim - 3 * H);
});
t('STATE: corrupt save falls back to a clean engine instead of crashing', () => {
  const A = loadApp({ storage: { tachoUA6: '{not json' } }); assert.strictEqual(A.S.d[1].c, 0);
});
