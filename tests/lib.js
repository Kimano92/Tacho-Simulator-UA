// Minimal test library (no dependencies). Results are grouped: A = existing scenario assertions, B = new engine tests, C = legacy UI journeys (ported).
const R = []; let grp = '?';
exports.group = g => { grp = g; };
exports.t = (name, fn) => { try { const r = fn(); R.push({ grp, name, ok: r !== false }); } catch (e) { R.push({ grp, name, ok: false, err: e.message }); } };
exports.add = (g, name, ok, err) => R.push({ grp: g, name, ok, err });
exports.results = R;
