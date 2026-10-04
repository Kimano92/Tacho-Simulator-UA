const { t, group } = require('./lib.js'), assert = require('assert'), fs = require('fs'), path = require('path');
const { loadApp } = require('./harness.js'), TE = require('../engine.js'), crypto = require('crypto');
const sha = o => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12);
const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, 'scenario-baseline.json'), 'utf8'));
const U = (d, h, m) => Date.UTC(2026, 9, d, h, m), H = 3600000, MIN = 60000;
const readyApp = (A, n) => { A.E.dispatch({ type: 'CARD_INSERT', n }); A.E.advance(9000); A.E.dispatch({ type: 'MANUAL_ANSWER', n, yes: false }); A.E.dispatch({ type: 'COUNTRY_SET', n, kind: 'sc', v: 'Польща' }); };

group('A. existing scenario assertions (scenario "exp" rows — NOT unit tests)');
(function () {
  const A = loadApp();
  t('39 scenarios preserved', () => assert.strictEqual(A.SC.length, 39));
  for (const s of A.SC) t('scenario ' + s.id + ': exp/start unchanged vs Phase 0 baseline; rows preserved', () => {
    const b = BASE.byId[s.id]; assert.ok(b); assert.strictEqual(sha(s.exp), b.exp); assert.strictEqual(sha(s.start), b.start); A.startScn(s.id); assert.strictEqual(A.evalScn(s).length, b.rows);
  });
  t('97 existing exp rows preserved (sum of evalScn rows over 39 scenarios)', () => { let rows = 0; for (const s of A.SC) { A.startScn(s.id); rows += A.evalScn(s).length; } assert.strictEqual(rows, 97); });
  t('INVALID-MODEL / PREMISE-UNC scenarios are marked LEGACY, not bent: ' + 'exp untouched', () => { const L = A.SC.filter(s => s.legacy).map(s => s.id).sort(); assert.deepStrictEqual(Array.from(L), ['e2', 'e4', 's11', 's14', 's18', 's20', 's22', 's23', 's25', 's9', 'w7'].sort()); });
})();

group('B. new engine tests');
t('TEST 5: S.sim / S.d / S.ferry / S.out are read-only views (assignment throws LEGACY-WRITE-BLOCKED)', () => { const A = loadApp(); for (const k of ['sim', 'ferry', 'fs', 'log', 'er', 'auto', 'd', 'out', 'veh']) assert.throws(() => { A.S[k] = 1; }, /LEGACY-WRITE-BLOCKED/); });
t('TEST 5: shift(+) goes through E.advance; shift(-) is a REWIND (branch recorded), not subtraction', () => {
  const A = loadApp(), s0 = A.S.sim; A.shift(H); assert.strictEqual(A.S.sim, s0 + H); A.E.dispatch({ type: 'ACTIVITY_SELECT', n: 1, act: 'WORK' }); A.shift(-30 * MIN);
  assert.strictEqual(A.S.sim, s0 + 30 * MIN); assert.strictEqual(A.E.info().branches, 1); assert.strictEqual(A.S.d[1].mode, 'rest'); assert.ok(A.E.verifyReplay());
});
t('TEST 5: rewinding before the start of history is refused; setT forward = advance, backward = rewind', () => {
  const A = loadApp(), s0 = A.S.sim; A.shift(-H); assert.strictEqual(A.S.sim, s0); A.els['#dt'] = A.mk();
  A.els['#dt'].value = new Date(s0 + 5 * H).toISOString().slice(0, 16); A.setT(); assert.strictEqual(A.S.sim, s0 + 5 * H); A.els['#dt'].value = new Date(s0 + 2 * H).toISOString().slice(0, 16); A.setT(); assert.strictEqual(A.S.sim, s0 + 2 * H); assert.ok(A.E.verifyReplay());
});
t('TEST 5: mkSit(3) = real engine commands (EJECT_REQUEST, COUNTRY_SET, time) + 24 h ADVANCE; no teleport', () => {
  const A = loadApp(); readyApp(A, 1); A.E.advance(MIN); const s0 = A.S.sim; A.mkSit(3);
  const J = A.E.exportSession().J.map(e => e.a.type); assert.ok(J.indexOf('EJECT_REQUEST') >= 0 && J.lastIndexOf('COUNTRY_SET') > J.indexOf('EJECT_REQUEST') && J.lastIndexOf('ADVANCE') > J.indexOf('EJECT_REQUEST'));
  assert.strictEqual(A.S.d[1].st, 'REMOVED'); assert.ok(A.S.sim >= s0 + 24 * H); assert.ok(A.E.verifyReplay());
});
t('TEST 5: mkState = jump + PRESET commands (journaled, replay-safe, clock untouched directly)', () => {
  const A = loadApp(); for (const q of ['#cdt', '#cdr', '#ccd', '#cac', '#ccn']) A.els[q] = A.mk();
  A.els['#cdt'].value = '2026-10-03T20:00'; A.els['#cdr'].value = '2'; A.els['#ccd'].value = '2'; A.els['#cac'].value = 'work'; A.els['#ccn'].value = 'Чехія'; A.mkState();
  assert.strictEqual(A.S.sim, U(3, 20, 0)); assert.strictEqual(A.S.d[2].mode, 'work'); assert.strictEqual(A.S.d[2].st, 'READY'); assert.ok(A.E.exportSession().J.some(e => e.a.type === 'PRESET_DRIVER')); assert.ok(A.E.verifyReplay());
});
t('TEST 5: pause/resume, speed and vehicle input are engine commands; tick uses the real-clock DELTA (background gap not lost)', () => {
  const A = loadApp(); A.tog('auto'); assert.strictEqual(A.S.auto, 0); A.tog('auto'); A.spd(600); assert.strictEqual(A.E.state.spd, 600); A.spd(1); A.veh(1); A.E.advance(6000); assert.strictEqual(A.S.veh.motion, 'MOVING'); A.veh(0);
  A.setReal(1e9); A.tick(); const s0 = A.S.sim; A.setReal(1e9 + 2 * H); A.tick(); assert.strictEqual(A.S.sim, s0 + 2 * H); assert.ok(A.E.verifyReplay());
});
// TEST 6 — scenario start goes through the engine
t('TEST 6: every one of the 39 scenarios starts via E.load(): checkpoint0 = legacyStart(fixture), empty journal, clock = fixture', () => {
  const A = loadApp();
  for (const s of A.SC) { const base = s.start.rel ? A.E.snapshot() : null; A.startScn(s.id); assert.deepStrictEqual(A.E.checkpoint0(), TE.legacyStart(s.start, base), s.id); assert.strictEqual(A.E.info().journal, 0, s.id); if (!s.start.rel) assert.strictEqual(A.S.sim, s.start.sim, s.id); A.exitScn(); }
});
t('TEST 6: scenario isolation — exit restores the free-practice session incl. journal and checkpoints', () => {
  const A = loadApp(); A.shift(H); const before = A.E.canonical(), j = A.E.info().journal; A.startScn('s7'); A.E.dispatch({ type: 'EJECT_REQUEST', n: 1 }); A.exitScn(); assert.strictEqual(A.E.canonical(), before); assert.strictEqual(A.E.info().journal, j); assert.ok(A.E.verifyReplay());
});
const cardIn = (E, c) => { E.dispatch({ type: 'CARD_INSERT', n: 1 }); E.advance(9000); E.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: true }); const ins = E.state.d[1].man.ins; E.dispatch({ type: 'MANUAL_PERIOD', n: 1, act: 'BREAK_REST', end: ins }); E.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'sc', v: c }); };
const ejectE = (E, c) => { E.dispatch({ type: 'EJECT_REQUEST', n: 1 }); E.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'ec', v: c }); E.advance(1000); };
const SOLVE = {      // scenarios solved by PURE engine command sequences (no UI): 7 of 39 [engine-verified]. Others: start-state + UI journeys only.
  s13: E => cardIn(E, 'Польща'), s3: E => cardIn(E, 'Німеччина'), s7: E => ejectE(E, 'Німеччина'), s21: E => ejectE(E, 'Франція'),
  s10: E => { E.dispatch({ type: 'FERRY_BEGIN' }); E.advance(10 * MIN); E.dispatch({ type: 'FERRY_END' }); },
  s20: E => { E.dispatch({ type: 'FERRY_BEGIN' }); E.dispatch({ type: 'VEHICLE_INPUT', moving: true }); E.advance(20 * MIN); },       // old text said "choose Driving"; the engine way is REAL movement
  s12: E => E.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'sc', v: 'Литва' })
};
for (const id of Object.keys(SOLVE)) t('TEST 6: scenario ' + id + ' fails at start and passes after a pure ENGINE command sequence [engine-verified]', () => {
  const A = loadApp(), s = A.SC.find(x => x.id === id); A.startScn(id); assert.ok(!A.evalScn(s).every(r => r[1]), 'already solved at start'); SOLVE[id](A.E);
  const rows = A.evalScn(s); assert.ok(rows.every(r => r[1]), JSON.stringify(rows.filter(r => !r[1]))); assert.ok(A.E.verifyReplay());
});
t('TEST 6: s11 (INVALID-MODEL) cannot be solved through the engine: DRIVING is not selectable and slot 2 never drives', () => {
  const A = loadApp(), s = A.SC.find(x => x.id === 's11'); A.startScn('s11'); A.E.dispatch({ type: 'ACTIVITY_SELECT', n: 2, act: 'DRIVING' });
  assert.ok(A.E.state.ev.some(e => e.type === 'EV_INVALID_OPERATION' && e.reason === 'DRIVING_NOT_SELECTABLE')); A.E.dispatch({ type: 'ACTIVITY_SELECT', n: 1, act: 'BREAK_REST' }); assert.ok(!A.evalScn(s).every(r => r[1]));
});
t('TEST 6: scenario runner is separated: start checkpoint / check (LEGACY adapters) and exp values untouched', () => { const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'); assert.ok(/const Scn=\{start:/.test(src) && /LEGACY: scenario fixture/.test(src)); });
// STATE / MIGRATION
t('MIGRATION: pre-engine save (tachoUA5, fd in seconds) -> v3; the 60 s counter is dropped, old key kept', () => {
  const old = { sim: U(3, 20, 0), auto: 1, ferry: 1, fd: 30, fs: 1, er: 2, log: [{ n: 1, a: 'rest', f: 1, t: 2 }], scr: 'menu', snd: 0, dark: 1, scn: 0, free: '', d: [null, { c: 2, mode: 'work', sc: 'Польща', ec: '', last: 5, unk: 1 }, { c: 0, mode: 'rest', sc: '', ec: '', last: 0, unk: 0 }] };
  const A = loadApp({ storage: { tachoUA5: JSON.stringify(old) } }); assert.strictEqual(A.S.sim, U(3, 20, 0)); assert.strictEqual(A.S.d[1].st, 'READY'); assert.strictEqual(A.S.d[1].act, 'WORK'); assert.strictEqual(A.S.ferry, 1); assert.ok(!('fdMs' in A.E.state));
  assert.strictEqual(A.S.snd, 0); assert.strictEqual(A.S.dark, 1); assert.strictEqual(A.S.scr, 'home'); assert.ok(A.ls.tachoUA5); A.save(); assert.strictEqual(JSON.parse(A.ls.tachoUA6).schema, 3);
});
t('MIGRATION: Phase-1 save (schema 2, engine state with fdMs) -> v3: state kept, history reset, ui kept', () => {
  const p1 = { schema: 2, ui: { scr: 'menu', snd: 0, dark: 1, scn: 0, free: '' }, session: { T: { schema: 2, sim: U(4, 9, 0), auto: 1, spd: 1, d: [null, { c: 2, mode: 'rest', sc: 'Чехія', ec: '', last: U(3, 20, 0), unk: 0 }, { c: 0, mode: 'rest', sc: '', ec: '', last: 0, unk: 0 }], ferry: 1, fdMs: 30000, fs: 1, log: [], er: 0, ev: [] }, J: [], CP: [], BR: [] } };
  const A = loadApp({ storage: { tachoUA6: JSON.stringify(p1) } }); assert.strictEqual(A.S.sim, U(4, 9, 0)); assert.strictEqual(A.S.d[1].sc, 'Чехія'); assert.strictEqual(A.S.d[1].last, U(3, 20, 0)); assert.strictEqual(A.S.ferry, 1); assert.strictEqual(A.E.info().journal, 0); assert.strictEqual(A.S.dark, 1);
});
t('MIGRATION: scenario "free" snapshot in the pre-engine format is restorable via exitScn', () => {
  const free = JSON.stringify({ sim: U(1, 8, 0), auto: 1, ferry: 0, fd: 0, fs: 0, er: 0, log: [], d: [null, { c: 2, mode: 'rest', sc: 'Литва', ec: '', last: 0, unk: 0 }, { c: 0, mode: 'rest', sc: '', ec: '', last: 0, unk: 0 }], scr: 'home', snd: 1, dark: 0, scn: 0, free: '' });
  const A = loadApp({ storage: { tachoUA6: JSON.stringify({ schema: 3, ui: { scn: 's7', free }, session: TE.createEngine().exportSession() }) } }); A.exitScn(); assert.strictEqual(A.S.sim, U(1, 8, 0)); assert.strictEqual(A.S.d[1].sc, 'Литва');
});
t('STATE: v3 save round-trips through localStorage (history kept, rewind works); corrupt save falls back to a clean engine', () => {
  const A = loadApp(); A.shift(7 * H); A.save(); const B = loadApp({ storage: { tachoUA6: A.ls.tachoUA6 } }); assert.strictEqual(B.S.sim, A.S.sim); assert.ok(B.E.verifyReplay()); B.shift(-3 * H); assert.strictEqual(B.S.sim, A.S.sim - 3 * H);
  const C = loadApp({ storage: { tachoUA6: '{not json' } }); assert.strictEqual(C.S.d[1].st, 'REMOVED');
});
