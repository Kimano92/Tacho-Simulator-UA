/* Tacho Simulator UA — ENGINE (Phase 2: Time + Vehicle + Activity + Card + Ferry + Event + Ledger).
   No DOM, no real timers, no Date.now. The simulation clock (state.sim) is written ONLY in step().
   Module blocks are delimited by "// MODULE:X" ... "// END:X"; each module writes only its own fields (checked by tests/static.test.js).
   Source tags: [R#] = Verification Report rule, [N#] = Architecture Review finding, [UNC] = not confirmed (isolated in cfg). */
(function (root) {
'use strict';
const SCHEMA = 3, MIN = 60000, H = 3600000, DAY = 24 * H, CPE = 6 * H, NEG = -8.64e15;
const MOVE_MS = 5000, RETRO_MS = 120000, EJECT_MS = 60000, MAN_WARN_MS = 30000, MAN_KILL_MS = 600000, MAXJ = 1500, MAXCP = 150;
const clone = o => JSON.parse(JSON.stringify(o));
const L2A = { drive: 'DRIVING', work: 'WORK', avail: 'AVAILABILITY', rest: 'BREAK_REST' };
const A2L = { DRIVING: 'drive', WORK: 'work', AVAILABILITY: 'avail', BREAK_REST: 'rest', UNKNOWN: 'rest' };
const MANUAL_OK = ['WORK', 'AVAILABILITY', 'BREAK_REST', 'UNKNOWN'];                 // [R3][R8] DRIVING is never allowed
/* UNC-defaults are configuration, NOT confirmed VDO behaviour. Timing keys below the line are simulator parameters, not VDO values. */
const CFG0 = { coDriverOnStop: 'KEEP', movementStartTimestampMode: 'DETECTION', minuteFinalizationTimestampMode: 'PARAMETER', minuteNeighborMode: 'PREVIOUS_NEXT_CLASS',
  ferryEndOnEject: 'DRIVER_SLOT_ONLY', ferryBeginRequiresCard: false, retroWindowFinalizationHold: true,
  cardReadMs: 2000, welcomeMs: 3000, lastWithdrawalMs: 4000, recordMs: 1000 };
const CFG_ALLOWED = { coDriverOnStop: ['KEEP'], movementStartTimestampMode: ['DETECTION'], minuteFinalizationTimestampMode: ['PARAMETER'], minuteNeighborMode: ['PREVIOUS_NEXT_CLASS'],
  ferryEndOnEject: ['DRIVER_SLOT_ONLY', 'ANY_SLOT'], ferryBeginRequiresCard: [true, false], retroWindowFinalizationHold: [true, false] };
const RESERVED = { events: ['EV_MOVEMENT_CONFLICT', 'EV_DRIVING_WITHOUT_CARD', 'EV_CARD_NONVALID', 'EV_CARD_CONFLICT', 'EV_TIME_OVERLAP', 'EV_LAST_SESSION_NOT_CLOSED', 'EV_OVERSPEED', 'EV_DRIVING_TIME_WARNING'],
  interfaces: ['gnssMotionInput', 'ferryEffectiveAt', 'warningsEngine', 'printer', 'vdoCounter'] };   // DEFERRED: ids only, no behaviour

// LEGACY:BEGIN  (fixture/migration helpers: write slot fields directly; used only to build a state before it becomes engine-owned)
const slot0 = () => ({ c: 0, mode: 'rest', sc: '', ec: '', last: 0, unk: 0, st: 'REMOVED', cardId: null, due: null, ses: null, act: 'BREAK_REST',
  seg: [{ a: 'BREAK_REST', from: NEG, src: 'INIT' }], fin: null, civ: [], man: null, hold: 0 });
const initial = over => Object.assign({ schema: SCHEMA, sim: Date.UTC(2026, 9, 2, 8, 0), auto: 1, spd: 1, cfg: Object.assign({}, CFG0),
  veh: { input: 0, inSince: null, motion: 'STOPPED', since: null }, retro: null, d: [null, slot0(), slot0()], ferry: 0, fs: 0, finfo: null, out: 0,
  led: { vu: [null, [], []], card: {}, ses: [] }, log: [], er: 0, ev: [], evSeq: 0 }, over || {});
function norm(T) { [1, 2].forEach(n => { if (T.d[n].fin == null) T.d[n].fin = Math.floor(T.sim / MIN); }); return T; }
function fixture(T, n, o) {
  const s = T.d[n];
  if ('mode' in o) { const a = L2A[o.mode] || 'BREAK_REST'; s.act = a; s.mode = A2L[a]; s.seg = [{ a, from: NEG, src: 'FIXTURE' }]; s.fin = Math.floor(T.sim / MIN); }
  if ('c' in o) { s.st = o.c ? 'READY' : 'REMOVED'; s.cardId = o.c ? 'C' + n : null; s.c = o.c ? 2 : 0; s.ses = o.c ? { in: T.sim } : null; s.man = null; s.due = null; s.hold = 0;
    s.civ = o.c ? [{ id: 'C' + n, from: Math.floor(T.sim / MIN) * MIN, to: null }] : []; }
  ['sc', 'ec', 'last', 'unk'].forEach(k => { if (o[k] !== undefined) s[k] = o[k] === 'now' ? T.sim : o[k]; });
}
function presetFerry(T, on) { T.ferry = on ? 1 : 0; T.finfo = on ? { openedAt: T.sim, activityAtBegin: T.d[1].act, msSinceActivityChange: null } : null; }
function legacyStart(st, baseT) {                 // scenario fixture -> engine state (LEGACY adapter, fixtures are data, not history)
  const n = st.rel && baseT ? clone(baseT) : initial({ auto: 0 });
  if (!st.rel) { n.sim = st.sim; n.auto = 0; }
  n.log = []; n.er = 0; n.ev = []; n.evSeq = 0; n.led = { vu: [null, [], []], card: {}, ses: [] }; n.veh = { input: 0, inSince: null, motion: 'STOPPED', since: null }; n.retro = null;
  [1, 2].forEach(i => { n.d[i].fin = Math.floor(n.sim / MIN); const o = Object.assign({}, (st.d || [])[i - 1] || {}); if (o.lastAgo) { o.last = n.sim - o.lastAgo; delete o.lastAgo; } fixture(n, i, o); });
  if ('ferry' in st) { presetFerry(n, st.ferry); n.fs = st.ferry ? 1 : 0; }
  if (st.man) { const s = n.d[1], ins = Math.floor(n.sim / MIN) * MIN; s.st = 'MANUAL_ENTRY'; s.c = 2; s.man = { cur: s.last || ins, ins, per: [], warned: 0, warnAt: n.sim + MAN_WARN_MS, killAt: n.sim + MAN_KILL_MS }; s.due = s.man.warnAt; }
  return norm(n);
}
function fromLegacy(o) {                           // pre-engine save OR Phase-1 engine state (fd seconds / fdMs ignored: the 60 s rule is retired)
  const T = initial(); if (typeof o.sim === 'number') T.sim = o.sim; T.auto = o.auto ? 1 : 0;
  [1, 2].forEach(n => { const s = o.d && o.d[n]; if (s) fixture(T, n, { c: s.c ? 2 : 0, mode: s.mode || 'rest', sc: s.sc || '', ec: s.ec || '', last: s.last || 0, unk: s.unk || 0 }); });
  if (o.ferry) presetFerry(T, 1); T.fs = o.fs || 0;
  T.log = Array.isArray(o.log) ? o.log : []; T.er = o.er || 0; return norm(T);
}
// LEGACY:END

function createEngine(init) {
  let T = norm(initial(init ? clone(init) : null)), J = [], CP = [], BR = [], lastReal = null, replaying = false, cpMark = 0, brSeq = 0;
  const mod = (a, b) => ((a % b) + b) % b;

  // MODULE:EVENT  (owner of T.ev / T.evSeq; append-only EventLedger)
  const EVT = { emit(type, x) { const e = Object.assign({ seq: ++T.evSeq, t: T.sim, type }, x || {}); T.ev.push(e); return e; } };
  // END:EVENT

  // MODULE:LEDGER  (owner of T.led; ActivityLedger = VU store per slot + CARD store per card; runs are only extended at their tail)
  const LED = {
    run(arr, a, s, e, src) { const l = arr[arr.length - 1]; if (l && l.a === a && l.e === s && l.src === src) l.e = e; else arr.push({ a, s, e, src }); },
    vu(n, a, s, e, src) { LED.run(T.led.vu[n], a, s, e, src); },
    card(id, a, s, e, src) { LED.run(T.led.card[id] || (T.led.card[id] = []), a, s, e, src); },
    session(x) { T.led.ses.push(x); }
  };
  // END:LEDGER

  // MODULE:VEHICLE  (owner of T.veh; knows nothing about drivers) [R1]
  const VEH = {
    input(on) { if (on) { if (!T.veh.input) { T.veh.input = 1; T.veh.inSince = T.sim; } } else { T.veh.input = 0; T.veh.inSince = null; } },
    nextDue() { return T.veh.input && T.veh.motion === 'STOPPED' ? Math.max(0, T.veh.inSince + MOVE_MS - T.sim) : Infinity; },
    detect() {
      if (T.veh.motion === 'STOPPED' && T.veh.input && T.sim - T.veh.inSince >= MOVE_MS) { T.veh.motion = 'MOVING'; T.veh.since = T.sim; return 'START'; }   // movementStartTimestampMode=DETECTION [UNC]
      if (T.veh.motion === 'MOVING' && !T.veh.input) { T.veh.motion = 'STOPPED'; T.veh.since = T.sim; return 'STOP'; }                                         // no stop hysteresis [UNC]
      return null;
    }
  };
  // END:VEHICLE

  // MODULE:ACTIVITY  (owner of slot .act/.seg/.fin/.mode and T.retro) [R2][R3][R4][N1-N3]
  const ACT = {
    set(n, a, src) { const s = T.d[n]; if (s.act === a) return false; s.seg.push({ a, from: T.sim, src }); s.act = a; s.mode = A2L[a]; EVT.emit('EV_ACT_CHANGED', { n, a, src }); return true; },
    auto(n, a) { const ch = ACT.set(n, a, 'AUTO'); if (ch) EVT.emit(a === 'DRIVING' ? 'EV_ACT_AUTO_DRIVING' : a === 'AVAILABILITY' ? 'EV_ACT_AUTO_AVAIL' : 'EV_ACT_AUTO_WORK', { n }); return ch; },
    openRetro() { T.retro = { stopAt: T.sim, until: T.sim + RETRO_MS, used: 0 }; },          // window [stopAt, stopAt+120 s) — exclusive end is an implementation choice [UNC]
    clearRetro() { T.retro = null; },
    retroDue() { const r = T.retro; return r && !r.used && T.sim < r.until ? r.until - T.sim : Infinity; },
    select(n, a) {                                                                        // manual selection; returns a reject reason or null
      if (a === 'DRIVING') return 'DRIVING_NOT_SELECTABLE';                               // [R3]
      if (!['WORK', 'AVAILABILITY', 'BREAK_REST'].includes(a)) return 'BAD_ACTIVITY';
      if (T.veh.motion === 'MOVING') return 'MOVING';                                     // [R5]
      const s = T.d[n], r = T.retro;
      if (n === 1 && r && !r.used) {
        r.used = 1;                                                                       // only the FIRST change after the stop may be back-dated [N1]
        if (T.sim < r.until && (a === 'AVAILABILITY' || a === 'BREAK_REST')) {
          const g = s.seg[s.seg.length - 1];
          if (g && g.from === r.stopAt && g.src === 'AUTO' && g.a === 'WORK') { g.a = a; g.src = 'MANUAL_RETRO'; s.act = a; s.mode = A2L[a]; EVT.emit('EV_ACT_RETRO_CORRECTION', { n, a, from: r.stopAt }); return null; }
        }
      }
      ACT.set(n, a, 'MANUAL'); return null;
    },
    class52(s, M) {                                                                       // pure over the timeline [R4/(52)]: longest continuous activity, latest if equal
      const a = M * MIN, b = a + MIN, runs = [];
      for (let i = 0; i < s.seg.length; i++) {
        const g = s.seg[i], f = Math.max(g.from, a), t = Math.min(i + 1 < s.seg.length ? s.seg[i + 1].from : Infinity, b);
        if (t > f) { const l = runs[runs.length - 1]; if (l && l.a === g.a) l.len += t - f; else runs.push({ a: g.a, len: t - f }); }
      }
      let best = null; for (const r of runs) if (!best || r.len >= best.len) best = r; return best ? best.a : s.act;
    },
    classFinal(s, M) { return ACT.class52(s, M - 1) === 'DRIVING' && ACT.class52(s, M + 1) === 'DRIVING' ? 'DRIVING' : ACT.class52(s, M); },   // [R4/(51)] minuteNeighborMode=PREVIOUS_NEXT_CLASS [UNC]
    held(n, M) { const r = T.retro; return n === 1 && T.cfg.retroWindowFinalizationHold && r && !r.used && T.sim < r.until && M >= Math.floor(r.stopAt / MIN) - 1; },
    finalize() {                                                                          // minute M is final only after minute M+1 has elapsed [derived from (51)]
      const out = [];
      for (const n of [1, 2]) {
        const s = T.d[n];
        while ((s.fin + 2) * MIN <= T.sim && !ACT.held(n, s.fin)) {
          const M = s.fin, c = ACT.classFinal(s, M), a = M * MIN;
          LED.vu(n, c, a, a + MIN, 'AUTO');
          for (const v of s.civ) if (v.from <= a && (v.to == null || a + MIN <= v.to)) { LED.card(v.id, c, a, a + MIN, 'AUTO'); break; }
          out.push({ n, M, cls: c }); s.fin++;
          while (s.seg.length > 1 && s.seg[1].from <= (s.fin - 1) * MIN) s.seg.shift();
        }
      }
      return out;
    }
  };
  // END:ACTIVITY

  // MODULE:FERRY  (owner of T.ferry/T.fs/T.finfo/T.out) [R9][R10-R13]
  const FERRY = {
    begin() {
      if (T.out) return 'OUT_OPEN';                                                       // [R9] not while OUT is open
      if (T.ferry) return 'ALREADY_OPEN';
      if (T.cfg.ferryBeginRequiresCard && !(T.d[1].c === 2 || T.d[2].c === 2)) return 'NO_CARD';   // ferryBeginRequiresCard [UNC]
      const g = T.d[1].seg[T.d[1].seg.length - 1];
      T.ferry = 1; T.fs++; T.finfo = { openedAt: T.sim, activityAtBegin: T.d[1].act, msSinceActivityChange: g.from <= NEG ? null : T.sim - g.from };   // data only; "immediately after BREAK/REST" is NOT enforced
      EVT.emit('EV_FERRY_BEGIN', Object.assign({}, T.finfo)); return null;
    },
    end(reason, x) { if (!T.ferry) return false; T.ferry = 0; T.finfo = null; EVT.emit('EV_FERRY_END', Object.assign({ reason, observedAt: T.sim, effectiveAt: null }, x || {})); return true; },   // effectiveAt intentionally null [UNC]
    evaluate(mins) { for (const m of mins) if (T.ferry && m.n === 1 && m.cls === 'DRIVING' && m.M * MIN >= T.finfo.openedAt) FERRY.end('DRIVING_MINUTE', { minute: m.M }); },   // [R9]
    outBegin() { if (T.out) return; T.out = 1; EVT.emit('EV_OUT_BEGIN'); FERRY.end('OUT'); },
    outEnd() { if (!T.out) return; T.out = 0; EVT.emit('EV_OUT_END', { cause: 'MANUAL' }); },
    onCard(kind) { if (T.out) { T.out = 0; EVT.emit('EV_OUT_END', { cause: 'CARD_' + kind }); } },   // [R12] OUT closes on insertion/withdrawal
    onRemoved(n) { const p = T.cfg.ferryEndOnEject; if (T.ferry && (p === 'ANY_SLOT' || n === 1)) FERRY.end('CARD_EJECT', { n }); }   // ferryEndOnEject [UNC]; no auto-resume [R13]
  };
  // END:FERRY

  // MODULE:CARD  (owner of slot .st/.due/.ses/.civ/.cardId/.hold/.man/.c/.sc/.ec/.last/.unk, T.log, T.er) [R6-R8][R14-R16]
  const CARD = {
    proj(n) { const s = T.d[n]; s.c = (s.st === 'REMOVED' || s.st === 'INSERTING') ? 0 : (s.st === 'READING' || s.st === 'WELCOME' || s.st === 'LAST_WITHDRAWAL') ? 1 : 2; },
    go(n, st, due) { const s = T.d[n]; s.st = st; s.due = due == null ? null : due; CARD.proj(n); EVT.emit('EV_CARD_STATE', { n, st }); },
    busyManual(n) { const st = T.d[n].st; return st === 'MANUAL_PROMPT' || st === 'MANUAL_ENTRY' || st === 'COUNTRY'; },
    nextDue() { let m = Infinity; for (const n of [1, 2]) { const d = T.d[n].due; if (d != null && d > T.sim) m = Math.min(m, d - T.sim); } return m; },
    open(n) { if (T.d[n].st !== 'REMOVED') return 'BUSY'; CARD.go(n, 'INSERTING', null); return null; },
    insert(n) {
      const s = T.d[n]; if (s.st !== 'REMOVED' && s.st !== 'INSERTING') return 'BUSY';
      FERRY.onCard('INSERT'); if (T.d[1].act === 'DRIVING') EVT.emit('EV_CARD_INSERT_WHILE_DRIVING', { n, cls: 'EVENT' });   // [N6] trigger is the driver's ACTIVITY, not raw motion
      s.cardId = 'C' + n; s.ses = { in: T.sim }; s.civ.push({ id: s.cardId, from: Math.floor(T.sim / MIN) * MIN, to: null }); s.man = null; s.hold = 0;
      CARD.go(n, 'READING', T.sim + T.cfg.cardReadMs); return null;
    },
    toPrompt(n) { CARD.go(n, 'MANUAL_PROMPT', null); },
    answer(n, yes) {
      const s = T.d[n]; if (s.st !== 'MANUAL_PROMPT') return 'BAD_STATE';
      const ins = Math.floor(s.ses.in / MIN) * MIN; s.ses.ins = ins; const gap = s.last && s.last < ins;
      if (yes && gap) { s.man = { cur: s.last, ins, per: [], warned: 0, warnAt: T.sim + MAN_WARN_MS, killAt: T.sim + MAN_KILL_MS }; EVT.emit('EV_MANUAL_START', { n }); CARD.go(n, 'MANUAL_ENTRY', s.man.warnAt); return null; }
      if (!yes && gap) { LED.card(s.cardId, 'UNKNOWN', s.last, ins, 'MANUAL_ENTRY_DECLINED'); s.unk = 1; EVT.emit('EV_MANUAL_DECLINED', { n }); }   // [R8] undeclared period = UNKNOWN [N4]
      CARD.go(n, 'COUNTRY', null); return null;
    },
    period(n, a, end) {
      const s = T.d[n], m = s.man; if (s.st !== 'MANUAL_ENTRY') return 'BAD_STATE';
      if (a === 'DRIVING') return 'DRIVING_NOT_SELECTABLE'; if (!MANUAL_OK.includes(a)) return 'BAD_ACTIVITY';                // [R3][R8]
      if (!(end > m.cur && end <= m.ins)) { T.er++; return 'INVALID_TIME'; }
      m.per.push({ a, f: m.cur, t: end }); m.cur = end; m.warned = 0; m.warnAt = T.sim + MAN_WARN_MS; m.killAt = T.sim + MAN_KILL_MS; s.due = m.warnAt;
      if (end === m.ins) CARD.go(n, 'COUNTRY', null); return null;
    },
    commit(n) {                                                                           // manual entries are written to the CARD store only [N5]
      const s = T.d[n], m = s.man; if (!m) return;
      for (const p of m.per) { LED.card(s.cardId, p.a, p.f, p.t, 'MANUAL_ENTRY'); if (p.a === 'UNKNOWN') s.unk = 1; else T.log.push({ n, a: A2L[p.a], f: p.f, t: p.t }); }   // T.log = LEGACY projection
      EVT.emit('EV_MANUAL_END', { n }); s.man = null;
    },
    abortManual(n, reason) {
      const s = T.d[n], m = s.man, ins = s.ses ? (s.ses.ins != null ? s.ses.ins : Math.floor(s.ses.in / MIN) * MIN) : 0;
      if (m) { CARD.commit(n); if (m.cur < m.ins) { LED.card(s.cardId, 'UNKNOWN', m.cur, m.ins, 'MANUAL_ENTRY_INTERRUPTED'); s.unk = 1; } }   // rest of period = UNKNOWN [PROP/UNC]
      else if (s.st === 'MANUAL_PROMPT' && s.last && s.last < ins) { LED.card(s.cardId, 'UNKNOWN', s.last, ins, 'MANUAL_ENTRY_INTERRUPTED'); s.unk = 1; }
      EVT.emit('EV_MANUAL_INTERRUPT', { n, reason });
    },
    onMotionStart() { for (const n of [1, 2]) if (CARD.busyManual(n)) { CARD.abortManual(n, 'MOTION'); CARD.go(n, 'READY', null); } },   // [R16] start of journey ends manual entry, also driver 2
    country(n, kind, v) {
      const s = T.d[n];
      if (kind === 'sc') {
        if (s.st === 'COUNTRY') { CARD.commit(n); s.sc = v; EVT.emit('EV_COUNTRY_SET', { n, kind, v }); CARD.go(n, 'READY', null); EVT.emit('EV_CARD_READY', { n }); return null; }
        if (s.st === 'READY') { s.sc = v; EVT.emit('EV_COUNTRY_SET', { n, kind, v }); return null; } return 'BAD_STATE';
      }
      if (kind === 'ec') {
        if (s.st === 'EJECT_COUNTRY') { s.ec = v; EVT.emit('EV_COUNTRY_SET', { n, kind, v }); CARD.go(n, 'RECORD', T.sim + T.cfg.recordMs); return null; }
        if (s.st === 'READY') { s.ec = v; EVT.emit('EV_COUNTRY_SET', { n, kind, v }); return null; } return 'BAD_STATE';
      }
      return 'BAD_KIND';
    },
    eject(n) {                                                                            // [R7][R14][R15]
      const s = T.d[n]; if (T.veh.motion === 'MOVING') return 'MOVING';
      if (s.st === 'REMOVED' || s.st === 'INSERTING') return 'NO_CARD';
      if (['READING', 'WELCOME', 'LAST_WITHDRAWAL', 'RECORD', 'EJECT_COUNTRY'].includes(s.st)) return 'BUSY';
      if (CARD.busyManual(n)) { CARD.abortManual(n, 'EJECT_REQUEST'); }
      CARD.go(n, 'EJECT_COUNTRY', T.sim + EJECT_MS); return null;
    },
    cancel(n) { if (T.d[n].st !== 'EJECT_COUNTRY') return 'BAD_STATE'; CARD.go(n, 'READY', null); EVT.emit('EV_CARD_EJECT_CANCELLED', { n, reason: 'USER' }); return null; },
    removed(n) {
      const s = T.d[n], v = s.civ[s.civ.length - 1]; if (v) v.to = T.sim;
      LED.session({ n, card: s.cardId, in: s.ses && s.ses.in, out: T.sim }); s.last = T.sim; s.cardId = null; s.ses = null; s.man = null;
      CARD.go(n, 'REMOVED', null); EVT.emit('EV_CARD_REMOVED', { n }); FERRY.onCard('REMOVE'); FERRY.onRemoved(n);
    },
    timers() {                                                                            // all timers are SIMULATION time
      let did = false;
      for (const n of [1, 2]) {
        const s = T.d[n];
        if (s.hold) { if (!CARD.busyManual(3 - n)) { s.hold = 0; CARD.toPrompt(n); did = true; } continue; }   // [N9] second card waits for the first card's manual entry
        if (s.due == null || s.due > T.sim) continue;
        const d = s.due; did = true;
        switch (s.st) {
          case 'READING': CARD.go(n, 'WELCOME', d + T.cfg.welcomeMs); break;
          case 'WELCOME': CARD.go(n, 'LAST_WITHDRAWAL', d + T.cfg.lastWithdrawalMs); break;
          case 'LAST_WITHDRAWAL': if (CARD.busyManual(3 - n)) { s.due = null; s.hold = 1; } else CARD.toPrompt(n); break;
          case 'EJECT_COUNTRY': EVT.emit('EV_CARD_EJECT_CANCELLED', { n, reason: 'COUNTRY_TIMEOUT' }); CARD.go(n, 'READY', null); break;   // [R15]
          case 'RECORD': CARD.removed(n); break;
          case 'MANUAL_ENTRY': { const m = s.man;                                           // [R16] 30 s prompt, 10 min eject
            if (!m.warned && d >= m.warnAt) { m.warned = 1; EVT.emit('EV_MANUAL_PLEASE_ENTER', { n, cls: 'OPERATIONAL_NOTE' }); s.due = m.killAt; }
            else { EVT.emit('EV_MANUAL_TIMEOUT', { n }); CARD.abortManual(n, 'TIMEOUT'); CARD.go(n, 'RECORD', T.sim + T.cfg.recordMs); } break; }
          default: s.due = null;
        }
      }
      return did;
    }
  };
  // END:CARD

  // ORCHESTRATOR (no state of its own): fixed order on one timestamp: movement detection -> automatic activity -> minute finalization -> ferry -> card/manual timers
  function process() {
    for (let g = 0; g < 100; g++) {
      let did = false; const m = VEH.detect();
      if (m) {
        did = true; EVT.emit(m === 'START' ? 'EV_VEH_MOTION_START' : 'EV_VEH_MOTION_STOP');
        if (m === 'START') { ACT.clearRetro(); ACT.auto(1, 'DRIVING'); ACT.auto(2, 'AVAILABILITY'); CARD.onMotionStart(); }   // [R2]
        else if (ACT.auto(1, 'WORK')) ACT.openRetro();                                    // [R2] slot 2: coDriverOnStop=KEEP [UNC]
      }
      const fm = ACT.finalize(); if (fm.length) { did = true; FERRY.evaluate(fm); }
      if (CARD.timers()) did = true;
      if (!did) break;
    }
  }
  const BOUNDS = [() => VEH.nextDue(), () => MIN - mod(T.sim, MIN), () => ACT.retroDue(), () => CARD.nextDue(), () => DAY - mod(T.sim, DAY), () => CPE - mod(T.sim, CPE)];
  function checkpoint() { if (replaying) return; CP.push({ t: T.sim, snap: JSON.stringify(T), jlen: J.length }); cpMark = J.length; if (CP.length > MAXCP) CP.splice(1, 1); }
  function jAdv(t0, seg) { const l = J[J.length - 1]; if (l && l.a.type === 'ADVANCE' && J.length > cpMark) l.a.ms += seg; else J.push({ t: t0, a: { type: 'ADVANCE', ms: seg } }); }
  function step(ms, rec) {              // the ONLY code path that moves the clock
    let left = ms;
    while (left > 0) {
      process();
      let seg = left; for (const b of BOUNDS) { const v = b(); if (v < seg) seg = v; } if (seg < 1) seg = 1;
      const t0 = T.sim; T.sim += seg; left -= seg;
      if (rec) jAdv(t0, seg);
      process();
      if (rec && mod(T.sim, CPE) === 0) checkpoint();
    }
  }
  function rej(a, r) { if (r) EVT.emit('EV_INVALID_OPERATION', { op: a.type, n: a.n, reason: r, cls: 'OPERATIONAL_NOTE' }); }
  function apply(a) {
    switch (a.type) {
      case 'VEHICLE_INPUT': VEH.input(!!a.moving); break;
      case 'ACTIVITY_SELECT': rej(a, ACT.select(a.n, a.act)); break;
      case 'FERRY_BEGIN': rej(a, FERRY.begin()); break;
      case 'FERRY_END': if (T.ferry) FERRY.end('MANUAL'); else rej(a, 'NOT_OPEN'); break;
      case 'OUT_BEGIN': FERRY.outBegin(); break;
      case 'OUT_END': FERRY.outEnd(); break;
      case 'CARD_OPEN': rej(a, CARD.open(a.n)); break;
      case 'CARD_INSERT': rej(a, CARD.insert(a.n)); break;
      case 'MANUAL_ANSWER': rej(a, CARD.answer(a.n, !!a.yes)); break;
      case 'MANUAL_PERIOD': rej(a, CARD.period(a.n, a.act, a.end)); break;
      case 'COUNTRY_SET': rej(a, CARD.country(a.n, a.kind, a.v)); break;
      case 'EJECT_REQUEST': { const r = CARD.eject(a.n); if (r) EVT.emit('EV_CARD_EJECT_REJECTED', { n: a.n, reason: r, cls: 'OPERATIONAL_NOTE' }); break; }
      case 'EJECT_CANCEL': rej(a, CARD.cancel(a.n)); break;
      case 'SET_AUTO': T.auto = a.v ? 1 : 0; lastReal = null; break;
      case 'SET_SPEED': T.spd = a.v; lastReal = null; break;
      case 'SET_CFG': if (a.key in CFG0 && (CFG_ALLOWED[a.key] ? CFG_ALLOWED[a.key].includes(a.value) : Number.isFinite(a.value) && a.value >= 0)) T.cfg[a.key] = a.value; else rej(a, 'UNSUPPORTED_PARAM'); break;
      case 'PRESET_DRIVER': fixture(T, a.n, a); break;                                    // LEGACY (practice state builder)
      case 'PRESET_FERRY': presetFerry(T, a.on); break;                                   // LEGACY
      default: throw new Error('unknown action ' + a.type);
    }
    process();
  }
  function compact() {
    if (J.length <= MAXJ) return;
    const m = CP.findIndex(c => c.jlen >= J.length / 2); if (m <= 0) return;
    const cut = CP[m].jlen; J = J.slice(cut); CP = CP.slice(m).map(c => ({ t: c.t, snap: c.snap, jlen: c.jlen - cut })); cpMark = Math.max(0, cpMark - cut);
  }
  function advance(ms) {
    if (!Number.isInteger(ms) || ms < 0) throw new Error('advance: integer ms >= 0 required');
    if (!ms) return []; const n0 = T.ev.length; step(ms, true); compact(); return T.ev.slice(n0);
  }
  function dispatch(a) {
    if (a.type === 'ADVANCE') return advance(a.ms);
    const n0 = T.ev.length, c = clone(a); J.push({ t: T.sim, a: c }); apply(c); compact(); return T.ev.slice(n0);   // apply the JOURNALED copy so live == replay
  }
  function rewind(target, jlimit) {     // jlimit (optional): journal index mark -> commands logged at the same timestamp AFTER the mark are excluded
    if (target >= T.sim && jlimit == null) return { ok: false, reason: 'not-past', events: [] };
    let k = -1; for (let i = 0; i < CP.length; i++) if (CP[i].t <= target && (jlimit == null || CP[i].jlen <= jlimit)) k = i;
    if (k < 0) return { ok: false, reason: 'before-horizon', events: [] };
    const cp = CP[k], old = J.slice(cp.jlen), done = []; let tail = [];
    T = JSON.parse(cp.snap); replaying = true;
    try {
      for (let i = 0; i < old.length; i++) {
        const e = old[i]; if (e.t > target || (jlimit != null && cp.jlen + i >= jlimit)) { tail = old.slice(i); break; }
        if (e.a.type === 'ADVANCE') {
          const m = Math.min(e.a.ms, target - e.t); if (m > 0) { step(m, false); done.push({ t: e.t, a: { type: 'ADVANCE', ms: m } }); }
          if (m < e.a.ms) { tail = [{ t: e.t + m, a: { type: 'ADVANCE', ms: e.a.ms - m } }].concat(old.slice(i + 1)); break; }
        } else { apply(e.a); done.push(e); }
      }
    } finally { replaying = false; }
    J = J.slice(0, cp.jlen).concat(done); CP.length = k + 1; cpMark = cp.jlen; lastReal = null;
    BR.push({ id: ++brSeq, at: target, journal: tail }); if (BR.length > 5) BR.shift();
    return { ok: true, events: [] };
  }
  function jumpTo(target) { if (target > T.sim) return { ok: true, events: advance(target - T.sim) }; if (target < T.sim) return rewind(target); return { ok: true, events: [] }; }
  const timed = () => [1, 2].some(n => ['READING', 'WELCOME', 'LAST_WITHDRAWAL', 'RECORD', 'EJECT_COUNTRY'].includes(T.d[n].st));
  function pump(realNow, opts) {        // the real timer only DRIVES the engine; delta comes from the real-clock difference (background gaps are not lost)
    if (lastReal === null) { lastReal = realNow; return []; }
    const dr = realNow - lastReal; lastReal = realNow; if (dr <= 0) return [];
    if (T.auto) return advance(Math.round(dr * T.spd));
    if (opts && opts.procedure && timed()) return advance(Math.round(dr));              // LEGACY UI aid: card procedure runs while the clock is paused (scenarios)
    return [];
  }
  function verifyReplay() {
    const keep = T; T = JSON.parse(CP[0].snap); replaying = true;
    try { for (const e of J.slice(CP[0].jlen)) { if (e.a.type === 'ADVANCE') step(e.a.ms, false); else apply(e.a); } return JSON.stringify(T) === JSON.stringify(keep); }
    finally { T = keep; replaying = false; }
  }
  function load(tech) { T = norm(initial(tech ? clone(tech) : null)); T.schema = SCHEMA; J = []; CP = []; BR = []; lastReal = null; cpMark = 0; checkpoint(); }
  function importSession(x) { if (!x || !x.T || x.T.schema !== SCHEMA) throw new Error('unsupported session schema'); T = x.T; J = x.J; CP = x.CP; BR = x.BR || []; cpMark = J.length; lastReal = null; if (!CP.length) checkpoint(); }
  load(init);
  return {
    get state() { return T; }, snapshot: () => clone(T),
    canonical() { const c = clone(T); delete c.spd; delete c.auto; return JSON.stringify(c); },
    advance, dispatch, jumpTo, rewind, pump, verifyReplay, load, importSession,
    exportSession: () => ({ T, J, CP, BR }), info: () => ({ journal: J.length, checkpoints: CP.length, branches: BR.length }),
    branches: () => BR.slice(), checkpoint0: () => JSON.parse(CP[0].snap), mark: () => ({ t: T.sim, j: J.length }), rewindToMark: m => rewind(m.t, m.j), classMinute: (n, M) => ACT.classFinal(T.d[n], M)
  };
}
const api = { createEngine, legacyStart, fromLegacy, initial, SCHEMA, A2L, L2A, CFG0, RESERVED };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TachoEngine = api;
})(typeof self !== 'undefined' ? self : this);
