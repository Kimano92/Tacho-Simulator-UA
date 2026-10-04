// Ported legacy UI journeys (were /tmp/sim3.js and /tmp/sim4.js in Phase 0/earlier stages). Group C: they drive the real UI handlers
// (key/dkey/pointer events) with fake timers; they are NOT scenario "exp" rows.
const { loadApp } = require('./harness.js'), { add } = require('./lib.js');
module.exports = async function () {
  const A = loadApp(), els = A.els, mk = A.mk;
  for (const q of ['#cdt', '#cdr', '#ccd', '#cac', '#ccn']) els[q] = els[q] || mk();
  const L = [], ok = (n, v) => add('C. legacy UI journeys (ported)', n, !!v);
  const rep = A.rep, G = () => A.S, k = A.key, M = () => A.man, H = () => els['#scr'].innerHTML, SS = A.startScn, EX = A.exitScn, dk = A.dkey, SH = A.shift, RE = A.reset, RA = A.resetAll, CH = A.chk, SO = A.sol, WH = A.what, MKS = A.mkState;
  const SC = A.SC, NC = () => SC.length, SCL = () => SC, ERL = () => A.ER, EMl = () => A.EM, EV = () => A.evalScn(SC.find(x => x.id === G().scn)), MS = () => els['#ms'].innerHTML;
  const ks = (...a) => a.forEach(x => k(x)), sl = ms => { A.FT(ms); return Promise.resolve(); };
  const d = n => G().d[n], all = () => EV().every(x => x[1]);
  const ins = async n => { els['#d' + n].onpointerdown(); els['#d' + n].onpointerup(); await sl(3700); };
  const go = (j, v) => { let g = 0; while (M().f[j] != v && g++ < 80) k('down'); };
  const per = (a, dd, h, mi) => { go(5, a); ks('ok'); go(0, dd); ks('ok', 'ok', 'ok'); go(3, h); ks('ok'); go(4, mi); ks('ok', 'ok'); };
  const cty = i => { for (let x = 0; x < i; x++) k('down'); ks('ok'); };
  const CN_ = null;

ok('scenarios >=12',NC()>=12);
SH(3600000);ok('+1h shifts clock',G().sim==Date.UTC(2026,9,2,9,0));SH(-3600000);
SS('s1');ok('s1 started, isolated',G().scn=='s1'&&G().auto==0);ok('s1 not done initially',!all());
await ins(1);ks('ok');ks('down','ok');ks('ok');cty(21);ok('s1 solved (Польща)',all());
SS('s3');ok('repeat resets state',d(1).c==0&&d(1).sc==''&&G().log.length==0);
await ins(1);ks('ok','ok');ok('s3 manual starts at activity, period from last eject',G().scr=='manual'&&M().s==0&&M().cur==Date.UTC(2026,9,2,18,30));
ks('ok','ok','ok','ok','ok','ok','ok');ok('country step',M().s==7);cty(19);ok('s3 done: rest Fri→Mon, Німеччина',all()&&d(1).unk==0);
SS('s4');await ins(1);ks('ok','ok');per(1,2,18,30);ok('after period1 loops to activity',M().s==0&&M().cur==Date.UTC(2026,9,2,18,30));per(2,2,19,0);per(3,3,7,0);ok('reached now -> country',M().s==7);cty(21);ok('s4 3 periods ok',all());
SS('s5');await ins(1);ks('ok','ok');per(3,4,7,0);ok('wrong (single rest) fails s5',M().s==7);cty(21);ok('s5 fails when not split',!all());
SS('s9');ok('s9 ? on home',G().d[1].unk==1&&/M9 9a3/.test(H()));ks('ok','down','ok','ok');ok('menu → manual',G().scr=='fn');ks('down','down','ok');ok('manual from menu',G().scr=='manual');ks('ok','ok','ok','ok','ok','ok','ok');cty(21);ok('s9 solved, ? cleared',all()&&!/M9 9a3/.test(H()));
SS('s7');els['#d1'].onpointerdown();await sl(2300);els['#d1'].onpointerup();ks('ok');cty(19);ok('s7 solved',all());
SS('s10');ks('ok','down','ok','down','down','ok','ok','ok');ok('ferry started',G().ferry==1);ks('ok','down','ok','down','down','ok','ok','down','ok');ok('s10 solved',all());
SS('s11');els['#d1'].onpointerdown();els['#d1'].onpointerup();go2();function go2(){while(G().i!=3)k('down')}ks('ok');els['#d2'].onpointerdown();els['#d2'].onpointerup();while(G().i!=0)k('down');ks('ok');ok('s11 solved',all());
CH();ok('result modal',/Ситуацію завершено/.test(MS()));SO();ok('solution modal',/<ol>/.test(MS()));
ks('ok','down','ok');EX();ok('exit restores free practice',G().scn==0&&G().d[1].c==0);
RA();ok('reset all',G().scn==0&&G().log.length==0);
ok('no emoji on display',!/[\u{1F000}-\u{1FFFF}]/u.test(H()));

  RA();

const sc=SCL();ok('scenario count >=39 ('+sc.length+')',sc.length>=39);ok('unique ids',new Set(sc.map(x=>x.id)).size==sc.length);
ok('every scenario has cat,task,why,sol',sc.every(x=>x.cat&&x.task&&x.why&&x.sol&&x.start&&x.exp));
ok('every error maps to a scenario',EMl().length==ERL().length&&EMl().every(i=>sc.find(x=>x.id==i)));
// s27 combined
SS('s27');await ins(1);ks('ok','ok');per(1,3,18,30);per(3,5,7,0);ok('s27 country step',M().s==7);cty(0);ok('s27 periods+country done',G().scr=='home'&&d(1).sc=='Польща');
ks('ok','down','ok','ok','down','ok');ok('menu → end country',G().scr=='country'&&G().kind=='cend');cty(19);
els['#d1'].onpointerdown();els['#d1'].onpointerup();ks('down','down','ok');ok('s27 solved',all());
// s17 wrong time
SS('s17');await ins(1);ks('ok','ok');go(5,3);ks('ok');ks('ok','ok','ok');go(3,12);ks('ok','ok','ok');ok('invalid end warns, back to fields',G().er==1&&M().s==1);
ks('ok','ok','ok');go(3,7);ks('ok','ok','ok');ok('corrected -> country',M().s==7);cty(21);ok('s17 solved incl. warning seen',all());
// s20 ferry + drive + time shift
SS('s20');ks('ok','down','ok','down','down','ok','ok','ok');ok('ferry on',G().ferry==1);els['#d1'].onpointerdown();els['#d1'].onpointerup();ks('up','ok');ok('d1 drives',d(1).mode=='drive');SH(3600000);ok('ferry auto-ended after driving + time shift',G().ferry==0);ok('s20 solved',all());
// s21 eject during ferry
SS('s21');ok('s21 ferry active at start',G().ferry==1);dk(1,1);ks('ok');cty(30);ok('s21 solved',all()&&d(1).c==0);
// s22 driver 2
SS('s22');await ins(2);ks('ok','ok');ok('d2 manual',M().n==2&&M().s==0);per(3,3,8,0);cty(32);els['#d2'].onpointerdown();els['#d2'].onpointerup();ks('down','ok');ok('s22 solved (separate drivers)',all()&&d(1).mode=='rest'&&d(2).sc=='Чехія'&&d(1).sc=='Польща');
// s23
SS('s23');dk(1,1);ks('ok');cty(21);els['#d2'].onpointerdown();els['#d2'].onpointerup();ks('up','up','up','ok');ok('s23 solved',all());
// s14 not closed country
SS('s14');await ins(1);ks('ok','ok');per(3,5,7,0);cty(0);ks('ok','down','ok','ok','down','ok');cty(19);ok('s14 solved',all());
// errors created in place from free practice
RA();ks('ok');dk(1,0);await sl(3700);ks('ok','down','ok');ks('ok');ok('free practice has card 1',d(1).c==2);
SS('e2');ok('e2 in place: ? shown, card kept',G().scn=='e2'&&d(1).unk==1&&d(1).c==2&&/M9 9a3/.test(H()));ok('e2 not solved yet',!all());
ks('ok','down','ok','ok','down','down','ok');ks('ok','ok','ok','ok','ok','ok','ok');if(M()&&M().s==7){cty(0)}else{ks('ok')}
ok('e2 solved by fix attempt',all());EX();ok('exit restores earlier free practice',G().scn==0&&d(1).c==2&&d(1).unk==0);
SS('e4');ok('e4: manual open on confirm with wrong year',G().scr=='manual'&&M().s==6);ks('ok');ok('e4 warning counted',G().er==1);
SS('e1');ok('e1 no country',d(1).sc=='');ks('ok','ok','ok','down','down','ok');
SS('e3');ok('e3 ferry active',G().ferry==1);ok('error check explains',(CH(),/Є моменти/.test(MS())&&/Навчальна симуляція/.test(MS())));
SS('w1');CH();ok('what-if check is observation + disclaimer',/спостереження/.test(MS())&&/Навчальна симуляція/.test(MS()));WH();ok('"Що сталося?" modal',/Тахограф працює/.test(MS()));
// state builder
EX();els['#cdt'].value='2026-10-03T20:00';els['#cdr'].value='2';els['#ccd'].value='2';els['#cac'].value='work';els['#ccn'].value='Чехія';MKS();
ok('mkState: date/time/driver/card/activity/country',G().sim==Date.UTC(2026,9,3,20,0)&&d(2).c==2&&d(2).mode=='work'&&d(2).sc=='Чехія'&&d(1).sc=='');
els['#ccd'].value='0';MKS();ok('mkState: card removed sets last eject',d(2).c==0&&d(2).last==G().sim);
SH(864e5);ok('time shift in free practice',G().sim==Date.UTC(2026,9,4,20,0));
SS('s1');rep();ok('repeat restores start',d(1).c==0&&G().log.length==0&&G().scn=='s1');RE();ok('reset scenario = repeat',G().scn=='s1');
ok('no emoji on display',!/[\u{1F000}-\u{1FFFF}]/u.test(H()));

  ok('journal replay reproduces the exact final state after the whole UI journey (no hidden state mutation)', A.E.verifyReplay());
};
