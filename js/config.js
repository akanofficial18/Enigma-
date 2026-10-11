/* config.js - shared constants and helpers (loaded by both the app and the watch) */
(function () {
  'use strict';
  var SV = (window.SV = window.SV || {});

  /* The six radar axes, clockwise from the top. lo/hi map a reading onto 0..1 for plotting. */
  SV.AXES = [
    { k: 'hr',  name: 'Heart rate', unit: 'bpm',  lo: 40, hi: 180, d: 0 },
    { k: 'ox',  name: 'SpO₂',       unit: '%',    lo: 80, hi: 100, d: 0 },
    { k: 'sp',  name: 'Steps/day',  unit: 'steps', lo: 0, hi: 20000, d: 0 },
    { k: 'act', name: 'Activity',   unit: '/100', lo: 0,  hi: 100, d: 0 },
    { k: 'sl',  name: 'Sleep',      unit: 'h',    lo: 0,  hi: 12,  d: 1 },
    { k: 'st',  name: 'Stress',     unit: '/100', lo: 0,  hi: 100, d: 0 }
  ];
  SV.AX = {};
  SV.AXES.forEach(function (a) { SV.AX[a.k] = a; });

  /* Reference readings used before the personal baseline has learned anything. */
  SV.REF = { hr: 75, ox: 98, sp: 5000, act: 6, sl: 6.5, st: 55 };
  SV.LEARN = ['hr', 'ox', 'st'];

  SV.LABEL = { rest: 'Resting', walk: 'Walking', run: 'Running' };
  SV.STATUS = ['normal', 'warning', 'critical'];
  SV.STATUS_TEXT = ['Normal', 'Warning', 'Critical'];

  SV.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  SV.esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  SV.fmt = function (ms) {
    return new Date(ms).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  };
  SV.hhmm = function (ms) {
    return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  SV.hhmmss = function (ms) {
    return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  /* Round a vitals object the way it is shown and checked by the rules. */
  SV.round = function (v) {
    return {
      hr: Math.round(v.hr), ox: Math.round(v.ox), sp: Math.round(v.sp / 10) * 10,
      act: Math.round(v.act || 0), sl: Math.round(v.sl * 10) / 10, st: Math.round(v.st)
    };
  };
  /* Vitals -> six 0..1 values for the radar. */
  SV.norm = function (v) {
    return SV.AXES.map(function (a) { return SV.clamp((v[a.k] - a.lo) / (a.hi - a.lo), 0, 1); });
  };
  SV.valText = function (v, k) {
    var a = SV.AX[k], x = +v[k];
    return a.d ? x.toFixed(a.d) : String(Math.round(x));
  };
  SV.withUnit = function (v, k) {
    var t = SV.valText(v, k);
    return { hr: t + ' bpm', ox: t + '%', sp: Number(t).toLocaleString('en-IN'), sl: t + ' h', act: t, st: t }[k];
  };
})();
