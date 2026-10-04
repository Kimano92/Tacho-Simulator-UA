// Group B: new engine tests (Phase 2). Tags: [UNC-pinned] = asserts the CURRENT value of an unconfirmed parameter, not a VDO fact.
const { t, group } = require('./lib.js'), assert = require('assert');
const { createEngine } = require('../engine.js');
const T0 = Date.UTC(2026, 9, 5, 10, 0, 0), MIN = 60000, H = 3600000;
const TE = require('../engine.js');
const mk = init => createEngine(Object.assign({ sim: T0, auto: 1 }, init || {}));
const mkL = (l1, l2) => { const s = TE.initial({ sim: T0, auto: 1 }); s.d[1].last = l1 || 0; s.d[2].last = l2 || 0; return createEngine(s); };
const ready = (e, n) => { e.dispatch({ type: 'CARD_INSERT', n }); e.advance(9000); e.dispatch({ type: 'MANUAL_ANSWER', n, yes: false }); e.dispatch({ type: 'COUNTRY_SET', n, kind: 'sc', v: 'Польща' }); };
const eject = (e, n, c) => { e.dispatch({ type: 'EJECT_REQUEST', n }); e.dispatch({ type: 'COUNTRY_SET', n, kind: 'ec', v: c || 'Німеччина' }); e.advance(1000); };
const mv = (e, on) => e.dispatch({ type: 'VEHICLE_INPUT', moving: on });
const evs = (e, type) => e.state.ev.filter(x => x.type === type);
const align = e => e.advance(Math.ceil(e.state.sim / MIN) * MIN - e.state.sim);
function runTo(e, mode, target) {       // five ways to move the clock; all must be equivalent
  if (mode === 'jump') { e.advance(target - e.state.sim); return; }
  if (mode === 'step60') { while (e.state.sim < target) e.advance(Math.min(MIN, target - e.state.sim)); return; }
  const m = { x1: 1, x60: 60, x600: 600 }[mode]; e.dispatch({ type: 'SET_SPEED', v: m }); let real = 1e9; e.pump(real);
  while (e.state.sim < target) { real += 1000; e.pump(real); } assert.strictEqual(e.state.sim, target);
}
group('B. new engine tests');

// ---- VEHICLE
t('VM-01 stopped -> moving exactly after 5 s of input; not before', () => { const e = mk(); mv(e, true); e.advance(4999); assert.strictEqual(e.state.veh.motion, 'STOPPED'); e.advance(1); assert.strictEqual(e.state.veh.motion, 'MOVING'); assert.strictEqual(evs(e, 'EV_VEH_MOTION_START')[0].t, T0 + 5000); });
t('VM-02 moving -> stopped as soon as input stops', () => { const e = mk(); mv(e, true); e.advance(6000); mv(e, false); assert.strictEqual(e.state.veh.motion, 'STOPPED'); assert.strictEqual(evs(e, 'EV_VEH_MOTION_STOP').length, 1); });
t('VM-03 5-second threshold: a 4.9 s input never becomes MOVING', () => { const e = mk(); mv(e, true); e.advance(4900); mv(e, false); e.advance(60000); assert.strictEqual(e.state.veh.motion, 'STOPPED'); assert.strictEqual(evs(e, 'EV_VEH_MOTION_START').length, 0); assert.strictEqual(e.state.d[1].act, 'BREAK_REST'); });
t('VM-04 movement across a minute boundary is ledgered per calendar minute', () => { const e = mk(); e.advance(58000); mv(e, true); e.advance(MIN + 70000); mv(e, false); e.advance(5 * MIN); const vu = e.state.led.vu[1]; assert.ok(vu.some(r => r.a === 'DRIVING')); vu.forEach(r => { assert.strictEqual(r.s % MIN, 0); assert.strictEqual(r.e % MIN, 0); }); });
// ---- ACTIVITY
t('AC-01/02/03 slot 1 DRIVING, slot 2 AVAILABILITY while moving; slot 1 WORK after stop; slot 2 KEEP [UNC-pinned]', () => {
  const e = mk(); mv(e, true); e.advance(5000); assert.strictEqual(e.state.d[1].act, 'DRIVING'); assert.strictEqual(e.state.d[2].act, 'AVAILABILITY');
  mv(e, false); assert.strictEqual(e.state.d[1].act, 'WORK'); assert.strictEqual(e.state.d[2].act, 'AVAILABILITY');
});
t('AC-04 retro 120 s: first manual BREAK_REST within the window is back-dated to the stop; history events are not rewritten', () => {
  const e = mk(); mv(e, true); e.advance(5000); mv(e, false); const stop = e.state.sim; const before = JSON.stringify(e.state.ev); e.advance(100000);
  e.dispatch({ type: 'ACTIVITY_SELECT', n: 1, act: 'BREAK_REST' }); const sg = e.state.d[1].seg; assert.strictEqual(sg[sg.length - 1].from, stop); assert.strictEqual(sg[sg.length - 1].src, 'MANUAL_RETRO');
  assert.ok(JSON.stringify(e.state.ev).startsWith(before.slice(0, -1))); assert.strictEqual(evs(e, 'EV_ACT_RETRO_CORRECTION').length, 1);
});
t('AC-04b outside the window / second change: no back-dating', () => {
  const a = mk(); mv(a, true); a.advance(5000); mv(a, false); a.advance(120000); a.dispatch({ type: 'ACTIVITY_SELECT', n: 1, act: 'BREAK_REST' }); assert.strictEqual(evs(a, 'EV_ACT_RETRO_CORRECTION').length, 0);
  const b = mk(); mv(b, true); b.advance(5000); mv(b, false); b.advance(10000); b.dispatch({ type: 'ACTIVITY_SELECT', n: 1, act: 'AVAILABILITY' }); b.advance(10000); b.dispatch({ type: 'ACTIVITY_SELECT', n: 1, act: 'BREAK_REST' });
  assert.strictEqual(evs(b, 'EV_ACT_RETRO_CORRECTION').length, 1);
});
t('AC-05 DRIVING cannot be selected manually (any slot)', () => { const e = mk(); for (const n of [1, 2]) e.dispatch({ type: 'ACTIVITY_SELECT', n, act: 'DRIVING' }); assert.strictEqual(evs(e, 'EV_INVALID_OPERATION').length, 2); assert.strictEqual(e.state.d[1].act, 'BREAK_REST'); });
t('AC-06 manual change is rejected while the vehicle moves; accepted when stopped', () => { const e = mk(); mv(e, true); e.advance(5000); e.dispatch({ type: 'ACTIVITY_SELECT', n: 2, act: 'WORK' }); assert.strictEqual(evs(e, 'EV_INVALID_OPERATION')[0].reason, 'MOVING'); mv(e, false); e.dispatch({ type: 'ACTIVITY_SELECT', n: 2, act: 'WORK' }); assert.strictEqual(e.state.d[2].act, 'WORK'); });
const tl = segs => { const s = require('../engine.js').initial({ sim: T0 }); s.d[1].seg = segs.map(([a, from]) => ({ a, from, src: 'X' })); s.d[1].act = segs[segs.length - 1][0]; return createEngine(s); };
t('AC-07 minute classification (52)/(51): single, longest, tie->latest, both neighbours DRIVING, one neighbour [UNC: neighbour mode]', () => {
  const M = 100, a = M * MIN;
  assert.strictEqual(tl([['WORK', -1e12]]).classMinute(1, M), 'WORK');
  assert.strictEqual(tl([['WORK', -1e12], ['DRIVING', a + 20000]]).classMinute(1, M), 'DRIVING');                 // 40 s driving > 20 s work
  assert.strictEqual(tl([['WORK', -1e12], ['DRIVING', a + 30000]]).classMinute(1, M), 'DRIVING');                 // 30/30 tie -> latest
  assert.strictEqual(tl([['DRIVING', -1e12], ['WORK', a + 10000], ['DRIVING', a + 20000]]).classMinute(1, M), 'DRIVING');
  assert.strictEqual(tl([['DRIVING', -1e12], ['WORK', a + 10000], ['DRIVING', a + 70000]]).classMinute(1, M), 'DRIVING');   // (51): both neighbours DRIVING => whole minute DRIVING even though WORK is longest inside it
  assert.strictEqual(tl([['WORK', -1e12], ['DRIVING', a + 50000]]).classMinute(1, M), 'WORK');     // previous minute not DRIVING => plain (52)
  assert.strictEqual(tl([['DRIVING', -1e12], ['WORK', a - 10000], ['DRIVING', a + 60000 + 5000]]).classMinute(1, M), 'DRIVING');   // all-WORK minute between DRIVING minutes
  assert.strictEqual(tl([['DRIVING', -1e12], ['WORK', a + 25000], ['DRIVING', a + 30000]]).classMinute(1, M), 'DRIVING');    // WORK 5 s only; also DRIVING neighbours
});
t('AC-08 delayed finalization: minute M reaches the ledger only after M+1 has elapsed', () => { const e = mk(); e.advance(2 * MIN - 1); assert.strictEqual(e.state.led.vu[1].length, 0); e.advance(1); assert.strictEqual(e.state.led.vu[1].length, 1); assert.strictEqual(e.state.led.vu[1][0].e, T0 + MIN); });
t('AC-09 a slot without a card is still monitored and ledgered (VU store)', () => { const e = mk(); mv(e, true); e.advance(10 * MIN); assert.ok(e.state.led.vu[1].some(r => r.a === 'DRIVING')); assert.strictEqual(e.state.d[1].st, 'REMOVED'); });
t('AC-10 retro hold: minutes touching the window are not finalized until it closes (retroWindowFinalizationHold=true)', () => {
  const e = mk(); mv(e, true); e.advance(3 * MIN); mv(e, false); e.advance(100000); const lenA = e.state.led.vu[1].length; const lastE = e.state.led.vu[1].length && e.state.led.vu[1][e.state.led.vu[1].length - 1].e;
  assert.ok(lastE <= T0 + 3 * MIN); e.advance(60000); const r = e.state.led.vu[1]; assert.ok(r[r.length - 1].e > T0 + 3 * MIN);
});
// ---- FERRY / OUT
t('FE-01 begin stores activityAtBegin / msSinceActivityChange; effectiveAt is not invented', () => { const e = mk(); e.advance(1000); e.dispatch({ type: 'FERRY_BEGIN' }); assert.strictEqual(e.state.ferry, 1); const ev = evs(e, 'EV_FERRY_BEGIN')[0]; assert.strictEqual(ev.activityAtBegin, 'BREAK_REST'); assert.strictEqual(ev.msSinceActivityChange, null); });
t('FE-02 begin rejected while OUT is open', () => { const e = mk(); e.dispatch({ type: 'OUT_BEGIN' }); e.dispatch({ type: 'FERRY_BEGIN' }); assert.strictEqual(e.state.ferry, 0); assert.strictEqual(evs(e, 'EV_INVALID_OPERATION')[0].reason, 'OUT_OPEN'); });
t('FE-03 manual end', () => { const e = mk(); e.dispatch({ type: 'FERRY_BEGIN' }); e.dispatch({ type: 'FERRY_END' }); assert.strictEqual(e.state.ferry, 0); assert.strictEqual(evs(e, 'EV_FERRY_END')[0].reason, 'MANUAL'); });
t('FE-04 ferry ends through REAL movement (DRIVING calendar minute); observedAt = finalization, effectiveAt null [UNC-pinned]', () => {
  const e = mk(); align(e); e.dispatch({ type: 'FERRY_BEGIN' }); const b = e.state.sim; mv(e, true); e.advance(20 * MIN);
  const f = evs(e, 'EV_FERRY_END')[0]; assert.strictEqual(f.reason, 'DRIVING_MINUTE'); assert.strictEqual(f.effectiveAt, null); assert.strictEqual(f.observedAt, b + 2 * MIN);
});
t('FE-05 short movement (not a DRIVING calendar minute) does not end the ferry', () => { const e = mk(); align(e); e.dispatch({ type: 'FERRY_BEGIN' }); e.advance(40000); mv(e, true); e.advance(10000); mv(e, false); e.advance(5 * MIN); assert.strictEqual(e.state.ferry, 1); });
t('FE-06 card removal: slot 1 closes the ferry, slot 2 does not [UNC-pinned: ferryEndOnEject=DRIVER_SLOT_ONLY]', () => {
  const a = mk(); ready(a, 1); ready(a, 2); a.dispatch({ type: 'FERRY_BEGIN' }); eject(a, 2); assert.strictEqual(a.state.ferry, 1); eject(a, 1); assert.strictEqual(a.state.ferry, 0); assert.strictEqual(evs(a, 'EV_FERRY_END')[0].reason, 'CARD_EJECT');
  const b = mk(); ready(b, 1); ready(b, 2); b.dispatch({ type: 'SET_CFG', key: 'ferryEndOnEject', value: 'ANY_SLOT' }); b.dispatch({ type: 'FERRY_BEGIN' }); eject(b, 2); assert.strictEqual(b.state.ferry, 0);
});
t('FE-07 re-insertion does not resume the ferry', () => { const e = mk(); ready(e, 1); e.dispatch({ type: 'FERRY_BEGIN' }); eject(e, 1); ready(e, 1); assert.strictEqual(e.state.ferry, 0); });
t('FE-08 OUT closes the ferry; card insert/removal closes OUT', () => { const e = mk(); e.dispatch({ type: 'FERRY_BEGIN' }); e.dispatch({ type: 'OUT_BEGIN' }); assert.strictEqual(e.state.ferry, 0); assert.strictEqual(evs(e, 'EV_FERRY_END')[0].reason, 'OUT'); e.dispatch({ type: 'CARD_INSERT', n: 1 }); assert.strictEqual(e.state.out, 0); });
t('FE-09 ferryBeginRequiresCard=true rejects without a card; default allows [UNC-pinned]', () => { const e = mk(); e.dispatch({ type: 'FERRY_BEGIN' }); assert.strictEqual(e.state.ferry, 1); const f = mk(); f.dispatch({ type: 'SET_CFG', key: 'ferryBeginRequiresCard', value: true }); f.dispatch({ type: 'FERRY_BEGIN' }); assert.strictEqual(f.state.ferry, 0); });
t('FE-10 old rule is gone: 60 s of driving ACTIVITY (no movement) cannot end a ferry; fdMs does not exist', () => { const e = mk(); e.dispatch({ type: 'FERRY_BEGIN' }); e.state.d[1].act; e.advance(10 * MIN); assert.strictEqual(e.state.ferry, 1); assert.ok(!('fdMs' in e.state)); });
// ---- CARD
t('CD-01 insertion state machine in SIMULATION time', () => {
  const e = mk(); e.dispatch({ type: 'CARD_INSERT', n: 1 }); const st = () => e.state.d[1].st; assert.strictEqual(st(), 'READING'); e.advance(1999); assert.strictEqual(st(), 'READING'); e.advance(1); assert.strictEqual(st(), 'WELCOME');
  e.advance(3000); assert.strictEqual(st(), 'LAST_WITHDRAWAL'); e.advance(4000); assert.strictEqual(st(), 'MANUAL_PROMPT'); e.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: false }); assert.strictEqual(st(), 'COUNTRY');
  e.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'sc', v: 'Чехія' }); assert.strictEqual(st(), 'READY'); assert.strictEqual(e.state.d[1].sc, 'Чехія');
});
t('CD-02 ejection: request -> country -> record -> removed; last withdrawal stored', () => {
  const e = mk(); ready(e, 1); e.advance(MIN); e.dispatch({ type: 'EJECT_REQUEST', n: 1 }); assert.strictEqual(e.state.d[1].st, 'EJECT_COUNTRY'); e.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'ec', v: 'Франція' });
  assert.strictEqual(e.state.d[1].st, 'RECORD'); const t = e.state.sim; e.advance(1000); assert.strictEqual(e.state.d[1].st, 'REMOVED'); assert.strictEqual(e.state.d[1].last, t + 1000); assert.strictEqual(e.state.d[1].ec, 'Франція');
});
t('CD-03 ejection while moving is rejected', () => { const e = mk(); ready(e, 1); mv(e, true); e.advance(6000); e.dispatch({ type: 'EJECT_REQUEST', n: 1 }); assert.strictEqual(e.state.d[1].st, 'READY'); assert.strictEqual(evs(e, 'EV_CARD_EJECT_REJECTED')[0].reason, 'MOVING'); });
t('CD-04 insertion while the driver activity is DRIVING is allowed and recorded as an event', () => { const e = mk(); mv(e, true); e.advance(6000); e.dispatch({ type: 'CARD_INSERT', n: 2 }); assert.strictEqual(e.state.d[2].st, 'READING'); assert.strictEqual(evs(e, 'EV_CARD_INSERT_WHILE_DRIVING').length, 1); });
t('CD-05 two cards: the second card waits while the first one is in manual entry', () => {
  const e = mkL(T0 - 5 * H, T0 - 5 * H);
  e.dispatch({ type: 'CARD_INSERT', n: 1 }); e.dispatch({ type: 'CARD_INSERT', n: 2 }); e.advance(9000); e.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: true });
  assert.strictEqual(e.state.d[1].st, 'MANUAL_ENTRY'); assert.strictEqual(e.state.d[2].st, 'LAST_WITHDRAWAL'); assert.strictEqual(e.state.d[2].hold, 1);
  e.dispatch({ type: 'MANUAL_PERIOD', n: 1, act: 'BREAK_REST', end: Math.floor(e.state.d[1].ses.in / MIN) * MIN }); e.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'sc', v: 'Польща' }); assert.strictEqual(e.state.d[2].st, 'MANUAL_PROMPT');
});
t('CD-06 ejection country timeout (60 s of simulation time) cancels the request', () => { const e = mk(); ready(e, 1); e.dispatch({ type: 'EJECT_REQUEST', n: 1 }); e.advance(59999); assert.strictEqual(e.state.d[1].st, 'EJECT_COUNTRY'); e.advance(1); assert.strictEqual(e.state.d[1].st, 'READY'); });
t('CD-07 ejection during READING is rejected (BUSY); eject cancel returns to READY', () => { const e = mk(); e.dispatch({ type: 'CARD_INSERT', n: 1 }); e.dispatch({ type: 'EJECT_REQUEST', n: 1 }); assert.strictEqual(evs(e, 'EV_CARD_EJECT_REJECTED')[0].reason, 'BUSY'); e.advance(9000); e.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: false }); e.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'sc', v: 'Польща' }); e.dispatch({ type: 'EJECT_REQUEST', n: 1 }); e.dispatch({ type: 'EJECT_CANCEL', n: 1 }); assert.strictEqual(e.state.d[1].st, 'READY'); });
// ---- MANUAL ENTRY
const gapE = () => { const e = mkL(T0 - 10 * H); e.dispatch({ type: 'CARD_INSERT', n: 1 }); e.advance(9000); return e; };
t('MN-01 manual entry at insertion writes the CARD store (MANUAL_ENTRY), never the VU store', () => {
  const e = gapE(); e.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: true }); const ins = e.state.d[1].man.ins; e.dispatch({ type: 'MANUAL_PERIOD', n: 1, act: 'WORK', end: T0 - 9 * H }); e.dispatch({ type: 'MANUAL_PERIOD', n: 1, act: 'BREAK_REST', end: ins });
  assert.strictEqual(e.state.d[1].st, 'COUNTRY'); e.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'sc', v: 'Польща' });
  const c = e.state.led.card.C1.filter(r => r.src === 'MANUAL_ENTRY'); assert.deepStrictEqual(c.map(r => r.a), ['WORK', 'BREAK_REST']); assert.strictEqual(c[0].s, T0 - 10 * H); assert.strictEqual(c[1].e, ins);
  assert.ok(e.state.led.vu[1].every(r => r.src !== 'MANUAL_ENTRY'));
});
t('MN-02 DRIVING is rejected in manual entry; UNKNOWN is accepted as a real activity', () => { const e = gapE(); e.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: true }); e.dispatch({ type: 'MANUAL_PERIOD', n: 1, act: 'DRIVING', end: T0 - 9 * H }); assert.strictEqual(evs(e, 'EV_INVALID_OPERATION')[0].reason, 'DRIVING_NOT_SELECTABLE'); e.dispatch({ type: 'MANUAL_PERIOD', n: 1, act: 'UNKNOWN', end: e.state.d[1].man.ins }); e.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'sc', v: 'Польща' }); assert.strictEqual(e.state.led.card.C1[0].a, 'UNKNOWN'); });
t('MN-03 declining manual entry writes an UNKNOWN activity for the whole gap (not a boolean flag only)', () => { const e = gapE(); e.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: false }); const r = e.state.led.card.C1[0]; assert.strictEqual(r.a, 'UNKNOWN'); assert.strictEqual(r.s, T0 - 10 * H); assert.strictEqual(r.e, Math.floor(e.state.d[1].ses.in / MIN) * MIN); });
t('MN-04 movement interrupts manual entry: complete periods kept, rest UNKNOWN, card READY (also slot 2)', () => {
  const e = gapE(); e.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: true }); e.dispatch({ type: 'MANUAL_PERIOD', n: 1, act: 'WORK', end: T0 - 8 * H }); mv(e, true); e.advance(5000);
  assert.strictEqual(e.state.d[1].st, 'READY'); const c = e.state.led.card.C1; assert.deepStrictEqual(c.map(r => r.a), ['WORK', 'UNKNOWN']); assert.strictEqual(evs(e, 'EV_MANUAL_INTERRUPT')[0].reason, 'MOTION');
});
t('MN-05 invalid period end is rejected, counted and leaves the session intact', () => { const e = gapE(); e.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: true }); e.dispatch({ type: 'MANUAL_PERIOD', n: 1, act: 'WORK', end: T0 + 99 * H }); assert.strictEqual(e.state.er, 1); assert.strictEqual(e.state.d[1].st, 'MANUAL_ENTRY'); });
t('MN-06 manual-entry timers in simulation time: 30 s prompt, 10 min automatic ejection', () => {
  const e = gapE(); e.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: true }); e.advance(29999); assert.strictEqual(evs(e, 'EV_MANUAL_PLEASE_ENTER').length, 0); e.advance(1); assert.strictEqual(evs(e, 'EV_MANUAL_PLEASE_ENTER').length, 1);
  e.advance(10 * MIN); assert.strictEqual(e.state.d[1].st, 'REMOVED'); assert.strictEqual(evs(e, 'EV_MANUAL_TIMEOUT').length, 1);
});
t('MN-07 manual entry exists only inside the insertion procedure (no command works in READY)', () => { const e = mk(); ready(e, 1); e.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: true }); e.dispatch({ type: 'MANUAL_PERIOD', n: 1, act: 'WORK', end: T0 }); assert.strictEqual(evs(e, 'EV_INVALID_OPERATION').length, 2); });
// ---- EVENTS / LEDGERS / ORDER
t('EV-01 order on one timestamp: internal events first, user command afterwards', () => {
  const e = mk(); align(e); e.dispatch({ type: 'FERRY_BEGIN' }); mv(e, true); e.advance(2 * MIN - 1); const bound = e.state.sim + 1; e.advance(1); e.dispatch({ type: 'ACTIVITY_SELECT', n: 2, act: 'DRIVING' });
  const fe = evs(e, 'EV_FERRY_END')[0], inv = evs(e, 'EV_INVALID_OPERATION')[0]; assert.ok(fe.t <= inv.t && fe.seq < inv.seq); assert.strictEqual(e.state.sim, bound);
});
t('EV-02 EventLedger is append-only with strictly increasing seq', () => { const e = mk(); ready(e, 1); const a = JSON.stringify(e.state.ev); mv(e, true); e.advance(10 * MIN); assert.ok(JSON.stringify(e.state.ev).startsWith(a.slice(0, -1))); const q = e.state.ev.map(x => x.seq); for (let i = 1; i < q.length; i++) assert.ok(q[i] > q[i - 1]); });
t('LG-01..03 ActivityLedger: non-overlapping, minute-aligned, earlier runs immutable (only the tail extends)', () => {
  const e = mk(); mv(e, true); e.advance(10 * MIN); const snap = JSON.stringify(e.state.led.vu[1].slice(0, -1)); mv(e, false); e.advance(10 * MIN); e.dispatch({ type: 'ACTIVITY_SELECT', n: 1, act: 'WORK' }); e.advance(10 * MIN);
  for (const n of [1, 2]) { const r = e.state.led.vu[n]; for (let i = 0; i < r.length; i++) { assert.strictEqual(r[i].s % MIN, 0); assert.strictEqual(r[i].e % MIN, 0); assert.ok(r[i].e > r[i].s); if (i) assert.ok(r[i].s >= r[i - 1].e); } }
  assert.ok(JSON.stringify(e.state.led.vu[1]).startsWith(snap.slice(0, -1)));
});
t('LG-04 CARD store starts at the insertion minute and stops at withdrawal', () => {
  const e = mk(); e.advance(30000); ready(e, 1); const ins = Math.floor(T0 / MIN) * MIN; e.advance(10 * MIN); eject(e, 1); e.advance(10 * MIN); const c = e.state.led.card.C1; assert.ok(c.length && c[0].s >= ins); assert.ok(c[c.length - 1].e <= e.state.d[1].last);
});
t('RS-01 reserved DEFERRED ids/interfaces exist but have no behaviour; unsupported UNC parameter values are rejected', () => {
  const R = require('../engine.js').RESERVED; assert.ok(R.events.includes('EV_MOVEMENT_CONFLICT') && R.interfaces.includes('ferryEffectiveAt'));
  const e = mk(); e.dispatch({ type: 'SET_CFG', key: 'coDriverOnStop', value: 'AVAILABILITY' }); e.dispatch({ type: 'SET_CFG', key: 'minuteNeighborMode', value: 'RECURSIVE' }); assert.strictEqual(evs(e, 'EV_INVALID_OPERATION').length, 2); assert.strictEqual(e.state.cfg.coDriverOnStop, 'KEEP');
});
// ---- ORDER / EQUIVALENCE (Phase 1 TEST 1/2/3 rewritten for REAL movement)
function script1(mode) {
  const e = mk(); ready(e, 1); ready(e, 2); e.advance(T0 + MIN - e.state.sim); const b = e.state.sim; e.dispatch({ type: 'FERRY_BEGIN' });
  runTo(e, mode, b + 10 * MIN); mv(e, true); runTo(e, mode, b + 30 * MIN); mv(e, false); runTo(e, mode, b + 40 * MIN); e.dispatch({ type: 'ACTIVITY_SELECT', n: 1, act: 'WORK' }); runTo(e, mode, b + 60 * MIN); return e;
}
const ref1 = script1('jump');
for (const m of ['x1', 'x60', 'x600', 'step60']) t('TEST 1 (movement): ' + m + ' == +60 min jump', () => assert.strictEqual(script1(m).canonical(), ref1.canonical()));
t('TEST 1 (movement): ferry ends by DRIVING minute at the same simulated moment in every path', () => { for (const m of ['jump', 'x1', 'x60', 'x600']) { const f = evs(script1(m), 'EV_FERRY_END'); assert.strictEqual(f.length, 1); assert.strictEqual(f[0].observedAt, ref1.state.ev.find(x => x.type === 'EV_FERRY_END').observedAt); assert.strictEqual(f[0].reason, 'DRIVING_MINUTE'); } });
function script2(mode) {
  const e = mk(); ready(e, 1); ready(e, 2); e.advance(T0 + MIN - e.state.sim); const b = e.state.sim; eject(e, 1); const ejAt = e.state.sim; e.dispatch({ type: 'FERRY_BEGIN' }); e.advance(b + 10 * MIN - e.state.sim);
  runTo(e, mode, b + H); mv(e, true); runTo(e, mode, b + H + 30 * MIN); mv(e, false); runTo(e, mode, b + 48 * H);
  e.dispatch({ type: 'CARD_INSERT', n: 1 }); e.advance(9000); e.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: true }); e.dispatch({ type: 'MANUAL_PERIOD', n: 1, act: 'BREAK_REST', end: e.state.d[1].man.ins }); e.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'sc', v: 'Польща' }); e.__ej = ejAt; return e;
}
const ref2 = script2('step60');
for (const m of ['x1', 'x60', 'x600', 'jump']) t('TEST 2 (48 h without card): ' + m + ' == small steps', () => assert.strictEqual(script2(m).canonical(), ref2.canonical()));
t('TEST 2: the 48 h result is meaningful', () => {
  const s = ref2.state; assert.strictEqual(s.d[1].st, 'READY'); assert.ok(s.led.card.C1.some(r => r.src === 'MANUAL_ENTRY' && r.a === 'BREAK_REST' && r.s === ref2.__ej)); assert.ok(s.led.vu[1].some(r => r.a === 'DRIVING')); assert.ok(s.led.vu[1].every((r, i, a) => !i || r.s >= a[i - 1].e));
  assert.strictEqual(s.ferry, 0); assert.ok(s.ev.some(x => x.type === 'EV_FERRY_END'));
});
const lineAB = e => { ready(e, 1); e.advance(H); e.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'sc', v: 'Чехія' }); };
t('TEST 3 (movement): A->B->C, rewind to B, D  ==  fresh A->B->D; C does not leak', () => {
  const e = mk(); lineAB(e); const mB = e.mark(); mv(e, true); e.advance(30 * MIN); e.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'sc', v: 'Австрія' });
  assert.ok(e.rewindToMark(mB).ok); assert.strictEqual(e.state.sim, mB.t); assert.strictEqual(e.state.veh.motion, 'STOPPED'); e.dispatch({ type: 'ACTIVITY_SELECT', n: 1, act: 'WORK' }); e.advance(H);
  const f = mk(); lineAB(f); f.dispatch({ type: 'ACTIVITY_SELECT', n: 1, act: 'WORK' }); f.advance(H); assert.strictEqual(e.canonical(), f.canonical()); assert.ok(e.verifyReplay()); assert.strictEqual(e.branches().length, 1);
});
t('TEST 3: rewind in the middle of movement == fresh run to that time (partial replay)', () => {
  const e = mk(); ready(e, 1); mv(e, true); e.advance(40 * MIN); const target = T0 + 9000 + 17 * MIN + 23000; assert.ok(e.rewind(target).ok);
  const f = mk(); ready(f, 1); mv(f, true); f.advance(target - f.state.sim); assert.strictEqual(e.canonical(), f.canonical()); assert.ok(e.verifyReplay());
});
t('TEST 3: rewind before the start of history is refused', () => { const e = mk(); e.advance(H); const r = e.rewind(T0 - H); assert.strictEqual(r.ok, false); assert.strictEqual(e.state.sim, T0 + H); });
t('OR-03 replay fidelity after a complex session (cards, manual entry, ferry, movement, OUT)', () => {
  const e = mkL(T0 - 6 * H); ready(e, 2); e.dispatch({ type: 'CARD_INSERT', n: 1 }); e.advance(9000); e.dispatch({ type: 'MANUAL_ANSWER', n: 1, yes: true }); e.dispatch({ type: 'MANUAL_PERIOD', n: 1, act: 'WORK', end: e.state.d[1].man.ins }); e.dispatch({ type: 'COUNTRY_SET', n: 1, kind: 'sc', v: 'Польща' });
  e.dispatch({ type: 'FERRY_BEGIN' }); e.advance(MIN); mv(e, true); e.advance(7 * MIN); mv(e, false); e.advance(100000); e.dispatch({ type: 'ACTIVITY_SELECT', n: 1, act: 'BREAK_REST' }); e.dispatch({ type: 'OUT_BEGIN' }); e.advance(H); e.dispatch({ type: 'OUT_END' }); eject(e, 1); e.advance(8 * H);
  assert.ok(e.verifyReplay()); const x = JSON.parse(JSON.stringify(e.exportSession())); const g = createEngine(); g.importSession(x); assert.strictEqual(g.canonical(), e.canonical()); assert.ok(g.verifyReplay());
});
t('PUMP: real timer only drives the engine; background gap is not lost; paused clock does not accumulate', () => {
  const e = mk(); e.pump(1000); e.pump(1000 + 3 * H); assert.strictEqual(e.state.sim, T0 + 3 * H);
  const f = mk(); f.pump(0); f.dispatch({ type: 'SET_AUTO', v: 0 }); f.pump(5 * H); f.dispatch({ type: 'SET_AUTO', v: 1 }); f.pump(9 * H); f.pump(9 * H + 1000); assert.strictEqual(f.state.sim, T0 + 1000);
});
t('ENGINE: advance rejects non-integer/negative deltas; long history is compacted and still replays', () => {
  const e = mk(); assert.throws(() => e.advance(-1)); assert.throws(() => e.advance(1.5));
  for (let i = 0; i < 2000; i++) { e.dispatch({ type: 'ACTIVITY_SELECT', n: 2, act: i % 2 ? 'WORK' : 'BREAK_REST' }); e.advance(MIN); } assert.ok(e.info().journal <= 1600); assert.ok(e.verifyReplay());
});
