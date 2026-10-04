# Tests — run: `node tests/run.js` (Node >= 18, no dependencies)

Reported in three groups; do not mix them.

**A. Existing scenario assertions** (`app.test.js`, group A) — the 39 scenarios and their **97 `exp` rows** (what `evalScn` checks).
These are scenario expectations, **not unit tests**. Phase 2 proves only that they were not weakened: every scenario's `exp` and `start`
hash and row count are compared with `scenario-baseline.json` (generated from the pre-engine Phase 0 code). Scenarios that contradict the confirmed
model are NOT edited; they are marked `legacy` (INVALID-MODEL / PREMISE-UNC / TEXT-ONLY) in `app.js`.

**B. New engine tests** (`engine.test.js`, `static.test.js`, `app.test.js` group B) — Vehicle (VM), Activity (AC), Ferry/OUT (FE), Card (CD), Manual entry (MN),
Events/Ledgers/Order (EV/LG/OR), TEST 1 (NORMAL/60x/600x/+60 min with REAL movement), TEST 2 (48 h), TEST 3 (rewind/branch), TEST 4 (static clock + module ownership),
TEST 5 (practice via engine), TEST 6 (scenario start via engine; 7 scenarios additionally solved by pure engine command sequences), migration, pump/background.
Tests tagged `[UNC-pinned]` assert the CURRENT value of an unconfirmed parameter; they are not evidence of VDO behaviour.

**C. UI journeys** (`ui-journeys.js`) — real key/pointer handlers; all time passes through the engine (fake timers only for UI press duration).

`tests/obsolete/` holds the Phase 1 UI-journey and app tests that encode the retired model (manual "Driving", 60 s ferry rule, real-timer card logic). They are NOT run.
NOT TESTED: real browser, Android, PWA install/offline.
