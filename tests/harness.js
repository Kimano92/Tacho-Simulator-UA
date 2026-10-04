// Loads app.js in a Node vm with a mocked DOM, fake timers and a fake Date.now. Nothing here touches the engine's clock.
const fs = require('fs'), path = require('path'), vm = require('vm');
exports.loadApp = function (opts) {
  opts = opts || {};
  const els = {}, ls = Object.assign({}, opts.storage || {}), timers = []; let now = 0, seq = 0, realNow = 1e9;
  const mk = () => ({ options: [], textContent: '', innerHTML: '', value: '', style: {}, className: '', classList: { toggle() {}, add() {}, remove() {} }, dataset: {} });
  const FD = function (...a) { return new Date(...a); }; FD.UTC = Date.UTC; FD.parse = Date.parse; FD.now = () => realNow;
  const sb = {
    console, Math, JSON, Promise, Date: FD, Number, Infinity, Error,
    localStorage: new Proxy(ls, { get: (t, k) => k === 'removeItem' ? (x => { delete t[x]; }) : t[k], set: (t, k, v) => { t[k] = v; return true; } }),
    document: { querySelector: s => els[s] || (els[s] = mk()), querySelectorAll: () => [], documentElement: { dataset: {} } },
    navigator: {}, window: {}, confirm: () => true, alert: () => {},
    setTimeout: (f, ms) => { timers.push({ f, at: now + ms, id: ++seq }); return seq; },
    clearTimeout: id => { const i = timers.findIndex(x => x.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: () => 0, TachoEngine: require('../engine.js')
  };
  vm.createContext(sb);
  const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8') +
    `;this.__api={get S(){return S},E,key,dkey,startScn,evalScn,SC,shift,jump,mkSit,mkState,setT,reset,resetAll,exitScn,tick,expl,chk,sol,what,startMan,rep,veh,syncUI,get man(){return man},render,tog,spd,eject,insert,ER,EM,notify,save}`;
  vm.runInContext(code, sb, { filename: 'app.js' });
  const FT = ms => { const target = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at || a.id - b.id); const t = timers[0]; if (!t || t.at > target) break; timers.shift(); now = Math.max(now, t.at); t.f(); } now = target; };
  // keep getters live (Object.assign would freeze S / man at copy time)
  const R = Object.defineProperties({}, Object.getOwnPropertyDescriptors(sb.__api));
  return Object.assign(R, { els, ls, FT, mk, setReal: v => { realNow = v; }, getReal: () => realNow });
};
