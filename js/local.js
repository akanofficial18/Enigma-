/* local.js - in-browser version of server/app.py + server/scorer.py, used when no data server is reachable.
   Replays the embedded cleaned Kaggle rows and scores them with a moving-average forecaster
   (the Hugging Face model needs the Python server). The result looks exactly like /api/next. */
(function () {
  'use strict';
  var SV = window.SV, D = window.SV_DATA;
  var ACT = { rest: 6, walk: 42, run: 86 };
  var SM = { hr: .35, ox: .35, st: .15, sp: .06, sl: .06, act: .3 };
  var FLOOR = { hr: 5, ox: .8, st: 2 }, CH = ['hr', 'ox', 'st'];
  var NAME = { hr: 'Heart rate', ox: 'SpO2', st: 'Stress' }, UNIT = { hr: ' bpm', ox: '%', st: '/10' };
  var SEV1 = 4.5, SEV2 = 8, HOLD = 2;
  var seed = 11, S, sc;

  function rng() { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function uni(a, b) { return a + (b - a) * rng(); }
  function reset() {
    S = { i: 0, mode: 'auto', act: 'rest', block: 0, scenario: 'normal', ptr: { rest: 0, walk: 0, run: 0 }, v: null, hold: 0, base: null, off: null };
    sc = { hist: [], lvl: null, scale: { hr: FLOOR.hr * 1.5, ox: FLOOR.ox * 1.5, st: FLOOR.st * 1.5 }, hold: 0 };
  }
  function pick() {
    if (S.mode !== 'auto') S.act = S.mode;
    else if (S.block <= 0) { var r = rng(); S.act = r < .6 ? 'rest' : r < .88 ? 'walk' : 'run'; S.block = 8 + Math.floor(rng() * 13); }
    S.block--;
    var p = D[S.act], row = p[S.ptr[S.act]++ % p.length];
    return { hr: row[0], ox: row[1], st: row[2], sp: row[3], sl: row[4], user: row[5] };
  }

  function score(x) {            /* x: {hr, ox, st(1..10)} */
    var m = { model: 'in-browser moving-average forecaster', engine: 'fallback' };
    var vals = CH.map(function (c) { return x[c]; });
    if (!sc.lvl) sc.lvl = vals.slice();
    if (sc.hist.length < 20) {
      sc.hist.push(vals); sc.lvl = sc.lvl.map(function (l, i) { return .94 * l + .06 * vals[i]; });
      return Object.assign({ level: 0, score: 0, z: {}, m: [], msg: '', warming: true }, m);
    }
    var f = sc.lvl, z = {}, w = [];
    CH.forEach(function (c, i) {
      z[c] = (vals[i] - f[i]) / sc.scale[c];
      var r = Math.abs(vals[i] - f[i]);
      if (Math.abs(z[c]) < 3) sc.scale[c] = Math.max(FLOOR[c], .97 * sc.scale[c] + .03 * r * 1.25);
      w.push(f[i] + Math.max(-4 * sc.scale[c], Math.min(4 * sc.scale[c], vals[i] - f[i])));
    });
    sc.hist.push(w); if (sc.hist.length > 512) sc.hist.shift();
    sc.lvl = sc.lvl.map(function (l, i) { return .94 * l + .06 * w[i]; });
    var bad = {}, idx = {};
    CH.forEach(function (c, i) { idx[c] = i; });
    ['hr', 'ox'].forEach(function (c) { if (Math.abs(z[c]) >= SEV1 * .7) bad[c] = z[c]; });
    if (Math.abs(z.st) >= SEV1 * .7 && Object.keys(bad).length) bad.st = z.st;
    var joint = ['hr', 'ox'].filter(function (c) { return Math.abs(z[c]) >= 4; }).length >= 2;
    var top = Math.max(Math.abs(z.hr), Math.abs(z.ox)), comb = Math.sqrt(z.hr * z.hr + z.ox * z.ox);
    var s = Math.max(top, joint ? comb * .8 : 0);
    sc.hold = s >= SEV1 ? sc.hold + 1 : 0;
    var level = s >= SEV2 ? 2 : (sc.hold >= HOLD ? 1 : 0), msg = '';
    if (level) {
      var parts = [];
      CH.forEach(function (c) {
        if (bad[c] === undefined) return;
        parts.push(NAME[c] + ' ' + vals[idx[c]].toFixed(0) + UNIT[c] + ' is ' + Math.abs(z[c]).toFixed(1) + 'x its usual swing ' + (z[c] > 0 ? 'above' : 'below') + ' the model forecast (' + f[idx[c]].toFixed(0) + UNIT[c] + ')');
      });
      msg = (joint ? 'Multiple signals moved together: ' : '') + parts.join('; ') + '.';
    }
    var mm = Object.keys(bad);
    return Object.assign({ level: level, score: Math.round(s * 100) / 100, z: z, m: mm, msg: msg, joint: joint, warming: false }, m);
  }

  /* Same physiology model as server/app.py: activity effect on top of the CSV values, slow easing, micro-jitter. */
  var OFF_HR = { rest: 0, walk: 15, run: 55 }, OFF_OX = { rest: 0, walk: -.3, run: -.8 }, RANK = { rest: 0, walk: 1, run: 2 };
  var HR_MED = 75.3, OX_MED = 98, SHRINK = .5, EASE = { hr: .22, ox: .18, st: .10, sp: .04, sl: .04 };
  function jit(a) { return uni(-a, a); }

  function next() {
    S.i++;
    var k, inj = S.scenario === 'spike' || S.scenario === 'warn';
    if (!S.hold || S.hold <= 0) { S.row = pick(); S.hold = 6 + Math.floor(rng() * 9); }
    S.hold--;
    var row = S.row, tgt = { hr: HR_MED + SHRINK * (row.hr - HR_MED), ox: OX_MED + SHRINK * (row.ox - OX_MED), st: row.st * 10, sp: row.sp, sl: row.sl };
    if (inj) {
      S.act = 'rest';
      var sp = S.scenario === 'spike';
      tgt.hr = (sp ? 160 : 108) + jit(3); tgt.ox = (sp ? 88 : 93.5) + jit(.4); tgt.st = sp ? 90 : 62;
    }
    var b = S.base;
    if (!b) b = Object.assign({}, tgt);
    else for (k in EASE) b[k] = (inj && (k === 'hr' || k === 'ox' || k === 'st')) ? tgt[k] : b[k] + (tgt[k] - b[k]) * EASE[k];
    S.base = b;
    var off = S.off || (S.off = { hr: 0, ox: 0, act: 6 });
    [['hr', OFF_HR], ['ox', OFF_OX]].forEach(function (p) {
      var t = inj ? 0 : p[1][S.act];
      off[p[0]] += (t - off[p[0]]) * (Math.abs(t) > Math.abs(off[p[0]]) ? .15 : .22);
    });
    off.act += ((inj ? 5 : ACT[S.act]) - off.act) * .25;
    var implied = off.hr > 35 ? 'run' : off.hr > 8 ? 'walk' : 'rest';
    var eff = RANK[S.act] >= RANK[implied] ? S.act : implied;
    var v = { hr: b.hr + off.hr + jit(1.2), ox: Math.min(100, b.ox + off.ox + jit(.12)), st: b.st + jit(1), sp: b.sp, sl: b.sl, act: off.act };
    var ml = score({ hr: b.hr + jit(1.2), ox: Math.min(100, b.ox + jit(.12)), st: v.st / 10 });
    S.v = v;
    return { i: S.i, v: v, activity: eff, scenario: S.scenario, ml: ml,
      raw: { hr: row.hr, ox: row.ox, user: row.user, label: 'embedded dataset' }, model: { model: ml.model, state: 'fallback', detail: 'standalone HTML' } };
  }
  function control(j) {
    if (j.scenario) S.scenario = (j.scenario === 'spike' || j.scenario === 'warn') ? j.scenario : 'normal';
    if (j.activity) { S.mode = j.activity; S.scenario = 'normal'; S.hold = 0; }
    if (j.reset) reset();
  }
  reset();
  SV.Local = { next: next, control: control };
})();
