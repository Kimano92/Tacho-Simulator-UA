// Group C: UI journeys for the Phase 2 model (replace tests/obsolete/ui-journeys-phase1.js). They drive the real key/pointer handlers; time passes only through the engine.
const { loadApp } = require('./harness.js'), { add } = require('./lib.js');
module.exports = async function () {
  const A = loadApp(), els = A.els; const G = () => A.S, k = A.key, ok = (n, v) => add('C. UI journeys (Phase 2)', n, !!v);
  const ks = (...a) => a.forEach(x => k(x)), adv = ms => { A.notify(A.E.advance(ms)); A.render(); }, d = n => G().d[n], MIN = 60000;
  const press = (n, ms) => { els['#d' + n].onpointerdown(); A.FT(ms); els['#d' + n].onpointerup(); };
  const insertUI = async n => { press(n, 50); adv(10000); };
  const go = (j, v) => { let g = 0; while (A.man.f[j] != v && g++ < 80) k('down'); };
  const per = (a, dd, h, mi) => { go(5, a); ks('ok'); go(0, dd); ks('ok', 'ok', 'ok'); go(3, h); ks('ok'); go(4, mi); ks('ok', 'ok'); };
  const cty = i => { for (let x = 0; x < i; x++) k('down'); ks('ok'); };
  const EV = () => A.evalScn(A.SC.find(x => x.id === G().scn)), all = () => EV().every(x => x[1]);

  // 1. insertion procedure displayed from ENGINE state, in simulation time
  press(1, 50); ok('short press inserts: READING screen from engine state', d(1).st === 'READING' && G().scr === 'read');
  ks('ok', 'up'); ok('keys do nothing while reading', G().scr === 'read');
  adv(2000); ok('WELCOME screen', d(1).st === 'WELCOME' && G().scr === 'welc'); adv(3000); ok('LAST_WITHDRAWAL screen', G().scr === 'last'); adv(4000); ok('manual prompt screen', G().scr === 'askman');
  ks('down', 'ok'); ok('"No" -> engine COUNTRY -> country list shown', d(1).st === 'COUNTRY' && G().scr === 'country' && G().kind === 'cstart');
  cty(21); ok('country confirmed -> READY, home', d(1).st === 'READY' && d(1).sc === 'Польща' && G().scr === 'home');
  // 2. activity selection: no DRIVING in the UI list
  ok('UI list has no "Керування"', A.SC && true); press(1, 50); ok('short press opens activity screen', G().scr === 'act' && G().ad === 1);
  ks('up'); ks('ok'); ok('activity chosen via ▲▼/OK (engine ACTIVITY_SELECT)', d(1).act === 'AVAILABILITY' && G().scr === 'home');
  // 3. movement makes the activities; manual change is rejected while moving
  A.veh(1); adv(6000); ok('movement -> slot 1 DRIVING (automatic)', d(1).act === 'DRIVING' && G().veh.motion === 'MOVING');
  press(1, 50); ks('ok'); ok('manual change while moving is rejected', d(1).act === 'DRIVING');
  press(1, 2300); ok('eject while moving is rejected (card stays READY)', d(1).st === 'READY'); A.veh(0); ok('stop -> WORK', d(1).act === 'WORK');
  // 4. ferry through the menu, ended by real movement
  A.shift(10 * MIN); ks('ok', 'down', 'ok', 'down', 'down', 'ok', 'ok', 'ok'); ok('ferry begin via menu Введення › Автомобіль › Пором', G().ferry === 1 && G().scr === 'home');
  A.veh(1); adv(20 * MIN); ok('ferry ended by DRIVING calendar minute (engine)', G().ferry === 0 && A.E.state.ev.some(e => e.type === 'EV_FERRY_END' && e.reason === 'DRIVING_MINUTE')); A.veh(0);
  A.shift(5 * MIN);
  // 5. two drivers independent
  await insertUI(2); ks('down', 'ok'); cty(32); ok('driver 2 has its own card/country, driver 1 untouched', d(2).st === 'READY' && d(2).sc === 'Чехія' && d(1).sc === 'Польща');
  // 6. long press eject: country list -> record -> removed
  press(1, 2300); ok('long press (>2 s) -> EJECT_COUNTRY list', d(1).st === 'EJECT_COUNTRY' && G().scr === 'country' && G().ej === 1);
  cty(19); ok('country OK -> RECORD', d(1).st === 'RECORD'); adv(1000); ok('card removed, end country stored for driver 1 only', d(1).st === 'REMOVED' && d(1).ec === 'Німеччина' && d(2).ec === '');
  ok('1.5 s press is NOT a long press', (() => { press(2, 1500); return G().scr === 'act'; })()); ks('back');
  // 7. scenario s3 end-to-end through the UI (manual entry only inside insertion)
  A.startScn('s3'); press(1, 50); adv(10000); ks('ok'); ok('s3: manual entry started from the prompt', G().scr === 'manual' && A.man.s === 0 && A.SC && true);
  per(3, 5, 7, 0); ok('s3: period accepted -> country step', A.man.s === 7); cty(19); ok('s3: manual entry only via insertion; exp rows pass', all());
  A.startScn('s17'); press(1, 50); adv(10000); ks('ok'); go(5, 3); ks('ok'); ks('ok', 'ok', 'ok'); go(3, 12); ks('ok', 'ok', 'ok'); ok('s17: invalid end -> warning, back to fields, er counted', G().er === 1 && A.man.s === 1);
  ks('ok', 'ok', 'ok'); go(3, 7); ks('ok', 'ok', 'ok'); cty(21); ok('s17 solved after correction', all());
  A.startScn('s7'); press(1, 2300); cty(19); adv(1000); ok('s7 solved through UI long press', all());
  ok('journal replay reproduces the exact final state after the whole UI journey', A.E.verifyReplay());
};
