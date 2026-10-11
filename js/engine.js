/* engine.js - the wearable feed. Pulls one real reading per second from the data server (cleaned Kaggle
   smartwatch CSV, scored by a Hugging Face model), learns the personal baseline, runs the rules and keeps the event log.
   Only ONE page runs the engine at a time (the "leader"); see sync.js. */
(function () {
  'use strict';
  var SV = window.SV;
  var LONG = 300;            /* 5 minutes of 1-second readings, used for the 5-minute average */
  var S = null, long = [];

  function rnd(a) { return (Math.random() * 2 - 1) * a; }

  function loadEvents() {
    try { return JSON.parse(localStorage.getItem('sv-events') || '[]'); } catch (e) { return []; }
  }
  function saveEvents() {
    try { localStorage.setItem('sv-events', JSON.stringify(S.events)); } catch (e) {}
  }

  function fresh() {
    var base = Object.assign({}, SV.REF, { n: 0, target: 30, sum: { hr: 0, ox: 0, st: 0 } });
    return {
      activity: 'rest', scenario: 'normal', mode: 'auto',
      v: Object.assign({}, SV.REF),
      base: base, status: 0, reasons: [], rules: [], sig: '0', events: loadEvents(),
      ml: { level: 0, score: 0, model: '', engine: 'offline', warming: true }, link: 'connecting', raw: null, cand: 0, candN: 0
    };
  }

  /* One reading from the data server. Replaces the old random simulator. */
  var remote = null;        /* null = not tried yet, true = Python server found, false = use the in-browser feed */
  function take(d, done) {
    S.v = d.v; S.activity = d.activity; S.scenario = d.scenario; S.ml = d.ml; S.raw = d.raw; S.model = d.model;
    S.link = 'live';
    long.push(Object.assign({}, S.v)); if (long.length > LONG) long.shift();
    done(true);
  }
  function pull(done) {
    function local() { remote = false; if (SV.Local) take(SV.Local.next(), done); else { S.link = 'offline'; done(false); } }
    if (remote === false) return local();
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 2500);
    fetch('api/next', { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) { clearTimeout(to); remote = true; take(d, done); })
      .catch(function () { clearTimeout(to); if (remote === true) { S.link = 'offline'; done(false); } else local(); });
  }

  function evaluate() {
    var R = SV.Rules.evaluate(SV.round(S.v), S.base, S.activity, S.ml);
    S.reasons = R.reasons;
    S.rules = R.rules.map(function (x) { return x.sev; });
    /* Anti-fatigue: a status may only go UP after 2 consecutive readings (a lone blip is ignored).
       Critical from the AI model or the combined rule is immediate. Going down is immediate. */
    var cand = R.status, immediate = R.reasons.some(function (x) { return x.sev === 2 && (x.id === 'ml-forecast' || x.id.indexOf('combo') === 0); });
    if (cand > S.status) {
      S.candN = (S.cand === cand ? S.candN : 0) + 1; S.cand = cand;
      if (immediate || S.candN >= 2) S.status = cand;
    } else { S.status = cand; S.cand = 0; S.candN = 0; }
    if (S.status === 0) S.reasons = []; else S.reasons = S.reasons.filter(function (x) { return x.sev > 0; });
  }

  /* Personal baseline: learns only from calm, normal readings at rest. */
  function learn() {
    if (S.activity !== 'rest' || S.scenario !== 'normal' || S.status !== 0) return;
    var b = S.base;
    if (b.n < b.target) {
      b.n++;
      SV.LEARN.forEach(function (k) {
        b.sum[k] += S.v[k];
        b[k] = (SV.REF[k] * 5 + b.sum[k]) / (5 + b.n);
      });
    } else {
      SV.LEARN.forEach(function (k) { b[k] += (S.v[k] - b[k]) * 0.02; });
    }
  }

  function addEvent(type, status, text) {
    var e = {
      t: Date.now(), type: type, status: status, text: text, activity: S.activity,
      r: SV.round(S.v), base: SV.round(S.base)
    };
    S.events.unshift(e);
    if (S.events.length > 200) S.events.pop();
    saveEvents();
    return e;
  }

  /* Log an alert once when the overall status changes (normal -> warning -> critical, or back),
     not every time a different rule fires at the same level. */
  function checkEvents() {
    var sig = String(S.status);
    if (sig === S.sig) return;
    var prev = +S.sig;
    if (S.status > 0) {
      addEvent('Alert', S.status, S.reasons.map(function (x) { return x.msg; }).join(' '));
    } else if (prev > 0) {
      addEvent('Recovered', 0, 'Readings are back within your normal range.');
    }
    S.sig = sig;
  }

  function avg() {
    var out = {}, n = long.length || 1;
    SV.AXES.forEach(function (a) {
      var s = 0;
      long.forEach(function (x) { s += x[a.k]; });
      out[a.k] = long.length ? s / n : S.v[a.k];
    });
    return out;
  }

  function init(saved) {
    var i;
    if (saved) {
      S = JSON.parse(JSON.stringify(saved));
      long = S.hist || [];
      delete S.hist; delete S.avg; delete S.t;
    } else {
      S = fresh(); long = [];
    }
    evaluate();
  }

  var busy = false;
  function tick(cb) {
    if (busy) { cb && cb(); return; }
    busy = true;
    pull(function () { busy = false; evaluate(); learn(); checkEvents(); cb && cb(); });
  }

  function post(body) {
    if (remote === false) { if (SV.Local) SV.Local.control(body); return; }
    try { fetch('api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) {}
  }

  /* Commands come from either page (the follower sends them to the leader). */
  function apply(cmd) {
    if (cmd.type === 'scenario') {
      S.scenario = cmd.v;
      if (cmd.v !== 'normal') S.activity = 'rest';
      post({ scenario: cmd.v });
    } else if (cmd.type === 'activity') {
      S.mode = cmd.v; if (cmd.v !== 'auto') S.activity = cmd.v; S.scenario = 'normal';
      post({ activity: cmd.v });
    } else if (cmd.type === 'relearn') {
      S.base = Object.assign({}, SV.REF, { n: 0, target: 30, sum: { hr: 0, ox: 0, st: 0 } });
    } else if (cmd.type === 'clearEvents') {
      S.events = []; saveEvents();
    } else if (cmd.type === 'event') {
      addEvent(cmd.etype, S.status, cmd.text);
    }
    evaluate(); checkEvents();
  }

  /* The state that is shared with the other page. */
  function publicState() {
    return Object.assign({}, S, { hist: long.slice(-60), avg: avg(), t: Date.now() });
  }

  SV.Engine = { init: init, tick: tick, apply: apply, publicState: publicState };
})();
