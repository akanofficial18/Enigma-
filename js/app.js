/* app.js - the phone / laptop app. Draws everything from the shared state (see sync.js)
   and sends user actions back as commands, so the watch always shows the same data. */
(function () {
  'use strict';
  var SV = window.SV;
  var $ = function (id) { return document.getElementById(id); };
  var esc = SV.esc;

  var ST = null;            /* latest shared state */
  var msgEvt = null;        /* event the doctor message is built from */
  var lastAlertT = 0;
  var reminders = [], remId = 0, clearArm = 0, clearH = null;
  var TILES = [
    { k: 'hr', lbl: 'Heart rate', unit: 'bpm', color: 'var(--hr)', lo: 40, hi: 180 },
    { k: 'ox', lbl: 'SpO₂', unit: '%', color: 'var(--ox)', lo: 85, hi: 100 },
    { k: 'sp', lbl: 'Steps today', unit: 'steps', color: 'var(--tp)', lo: 0, hi: 20000 },
    { k: 'act', lbl: 'Activity', unit: '/100', color: 'var(--muted)', lo: 0, hi: 100 },
    { k: 'sl', lbl: 'Sleep', unit: 'h', color: 'var(--accent)', lo: 0, hi: 12 },
    { k: 'st', lbl: 'Stress', unit: '/100', color: 'var(--avg)', lo: 0, hi: 100 }
  ];

  function toast(t) {
    var el = $('toast'); el.textContent = t; el.classList.add('on');
    clearTimeout(toast.h); toast.h = setTimeout(function () { el.classList.remove('on'); }, 2200);
  }
  function sevFor(k) {
    var s = 0;
    ST.reasons.forEach(function (x) { if (x.m.indexOf(k) > -1 && x.sev > s) s = x.sev; });
    return s;
  }

  /* ---------- sections ---------- */
  function renderBanner() {
    $('app').setAttribute('data-status', SV.STATUS[ST.status]);
    var r = SV.round(ST.v), t = $('bnTitle'), sub = $('bnSub');
    if (ST.status === 0) {
      t.textContent = 'Normal';
      sub.textContent = 'All readings are within your usual pattern for ' + SV.LABEL[ST.activity].toLowerCase() + '.';
      $('bnList').innerHTML = ''; $('bnAct').hidden = true;
    } else {
      t.textContent = ST.status === 2 ? 'Critical alert' : 'Warning';
      sub.textContent = 'Heart rate ' + r.hr + ' bpm · SpO₂ ' + r.ox + '% · stress ' + r.st + '/100 · ' + SV.LABEL[ST.activity].toLowerCase();
      $('bnList').innerHTML = ST.reasons.map(function (x) { return '<li>' + esc(x.msg) + '</li>'; }).join('');
      $('bnAct').hidden = false;
    }
  }

  function renderHero() {
    SV.Radar.render($('mainRadar'), ST, {});
    var now = SV.round(ST.v), avg = SV.round(ST.avg), base = SV.round(ST.base);
    base.act = SV.REF.act;
    $('axisBody').innerHTML = SV.AXES.map(function (a) {
      var s = sevFor(a.k);
      var chip = a.k === 'act' ? '<span class="chip info">' + SV.LABEL[ST.activity] + '</span>'
        : '<span class="chip ' + SV.STATUS[s] + '">' + ['Normal', 'Check', 'Critical'][s] + '</span>';
      return '<tr><td><b>' + a.name + '</b></td><td class="n">' + SV.withUnit(now, a.k) + '</td><td class="n">' +
        SV.withUnit(avg, a.k) + '</td><td class="n">' + SV.withUnit(base, a.k) + '</td><td>' + chip + '</td></tr>';
    }).join('');

    var peers = SV.Sync.peers(), w = peers.watch;
    var rows = [
      ['Overall status', SV.STATUS_TEXT[ST.status]],
      ['Activity', SV.LABEL[ST.activity] + (ST.scenario !== 'normal' ? ' · injected: ' + (ST.scenario === 'spike' ? 'emergency spike' : 'warning demo') : '')],
      ['Data source', ST.link === 'live' ? 'Kaggle smartwatch CSV (cleaned)' + (ST.raw ? ', row of user ' + ST.raw.user : '') : ST.link === 'offline' ? 'OFFLINE' : 'Connecting...'],
      ['AI model', (ST.ml && ST.ml.model ? ST.ml.model : '-') + ' · ' + (ST.ml && ST.ml.engine === 'huggingface' ? 'Hugging Face, live' : 'fallback forecaster') + (ST.ml && ST.ml.warming ? ' · warming up' : '') + (ST.ml ? ' · score ' + ST.ml.score : '')],
      ['Smartwatch', w ? 'Connected and showing this data' : 'Not open (open the watch page to sync)'],
      ['Feed runs on', SV.Sync.isLeader() ? 'this app' : 'the smartwatch page'],
      ['Last reading', SV.hhmmss(ST.t || Date.now())],
      ['Baseline', ST.base.n >= ST.base.target ? 'Established' : 'Learning ' + ST.base.n + '/' + ST.base.target]
    ];
    $('heroMeta').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
    var chip = $('syncChip');
    chip.className = 'chip ' + (w ? 'ok' : 'info');
    chip.textContent = w ? 'Synced with watch' : 'Watch not open';
    $('watchLink').hidden = false;
    $('liveClock').textContent = SV.hhmmss(Date.now());

    SV.Radar.render($('mirrorRadar'), ST, { compact: true });
    $('mTime').textContent = SV.hhmm(Date.now());
    $('mAlert').textContent = ST.status === 2 ? 'Alert · open app' : ST.status === 1 ? 'Warning · open app' : '';
  }

  function clampPt(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function spark(k, lo, hi, color) {
    var vals = ST.hist.map(function (x) { return x[k]; }), n = vals.length, W = 120, H = 30;
    if (n < 2) return '';
    var pts = vals.map(function (v, i) {
      return ((i + 60 - n) / 59 * W).toFixed(1) + ',' + (H - 2 - (clampPt(v, lo, hi) - lo) / (hi - lo) * (H - 4)).toFixed(1);
    }).join(' ');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>';
  }
  function buildTiles() {
    $('tiles').innerHTML = TILES.map(function (t) {
      return '<div class="tile" id="tile-' + t.k + '"><div class="t-top"><span class="lbl">' + t.lbl + '</span><span class="chip" data-chip></span></div>' +
        '<div class="val"><span data-val></span><small>' + t.unit + '</small></div><div data-spark></div><div class="dl" data-dl></div></div>';
    }).join('');
  }
  function renderTiles() {
    var r = SV.round(ST.v), b = SV.round(ST.base);
    TILES.forEach(function (t) {
      var el = $('tile-' + t.k);
      el.querySelector('[data-val]').textContent = t.k === 'sl' ? r.sl.toFixed(1) : t.k === 'sp' ? r.sp.toLocaleString('en-IN') : r[t.k];
      el.querySelector('[data-spark]').innerHTML = spark(t.k, t.lo, t.hi, t.color);
      var ch = el.querySelector('[data-chip]'), dl = el.querySelector('[data-dl]');
      if (t.k === 'act') { ch.className = 'chip'; ch.textContent = SV.LABEL[ST.activity]; dl.textContent = 'movement index'; return; }
      var s = sevFor(t.k);
      ch.className = 'chip ' + SV.STATUS[s]; ch.textContent = ['Normal', 'Check', 'Critical'][s];
      var d = r[t.k] - b[t.k];
      dl.textContent = (t.k === 'sp' || t.k === 'sl') ? 'daily figure from the dataset' : (d >= 0 ? '+' : '') + Math.round(d) + ' vs baseline';
    });
  }
  function hrChart() {
    var W = 640, H = 220, l = 38, rr = 12, t = 10, b = 22, w = W - l - rr, h = H - t - b, lo = 40, hi = 180;
    var vals = ST.hist.map(function (x) { return x.hr; }), n = vals.length;
    var X = function (i) { return l + ((i + 60 - n) / 59) * w; };
    var Y = function (v) { return t + h - (clampPt(v, lo, hi) - lo) / (hi - lo) * h; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Heart rate over the last 60 seconds">';
    [60, 100, 140, 180].forEach(function (g) {
      s += '<line class="grid-l" x1="' + l + '" x2="' + (W - rr) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text class="axis-t" x="' + (l - 6) + '" y="' + (Y(g) + 3) + '" text-anchor="end">' + g + '</text>';
    });
    s += '<line x1="' + l + '" x2="' + (W - rr) + '" y1="' + Y(ST.base.hr) + '" y2="' + Y(ST.base.hr) + '" stroke="var(--muted)" stroke-dasharray="5 4" stroke-width="1.5"/>';
    if (n > 1) {
      var pts = vals.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
      s += '<polygon points="' + X(0).toFixed(1) + ',' + (t + h) + ' ' + pts + ' ' + X(n - 1).toFixed(1) + ',' + (t + h) + '" fill="var(--hr)" fill-opacity=".12"/>';
      s += '<polyline points="' + pts + '" fill="none" stroke="var(--hr)" stroke-width="2" stroke-linejoin="round"/>';
      s += '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(vals[n - 1]).toFixed(1) + '" r="5" fill="var(--st)" stroke="var(--surface)" stroke-width="2"/>';
    }
    s += '<text class="axis-t" x="' + l + '" y="' + (H - 6) + '">60 s ago</text><text class="axis-t" x="' + (W - rr) + '" y="' + (H - 6) + '" text-anchor="end">now</text>';
    s += '<text class="axis-t" x="' + (l + 4) + '" y="' + (t + 10) + '">bpm</text></svg>';
    $('hrChart').innerHTML = s;
  }
  function renderRules() {
    $('rules').innerHTML = SV.Rules.LIST.map(function (R, i) {
      var sv = ST.rules[i] || 0;
      var msg = '';
      ST.reasons.forEach(function (x) { if (x.id === R.id) msg = x.msg; });
      return '<li><div class="rn">' + R.name + ' <span class="chip">' + R.kind + '</span></div><div class="rd">' + esc(sv ? msg : R.desc) +
        '</div><div class="rs"><span class="chip ' + SV.STATUS[sv] + '">' + ['Clear', 'Warning', 'Critical'][sv] + '</span></div></li>';
    }).join('');
  }
  function renderBase() {
    var b = ST.base, p = Math.min(1, b.n / b.target), done = b.n >= b.target;
    $('baseFill').style.width = Math.round(p * 100) + '%';
    $('baseBar').setAttribute('aria-valuenow', Math.round(p * 100));
    $('baseChip').textContent = done ? 'Established' : 'Learning';
    $('baseChip').className = 'chip ' + (done ? 'ok' : 'info');
    var paused = !done && (ST.activity !== 'rest' || ST.scenario !== 'normal' || ST.status !== 0);
    $('baseTxt').textContent = done ? 'Baseline is set and keeps adjusting slowly to your resting readings.'
      : paused ? 'Learning paused: it only learns from calm, normal readings at rest.'
      : 'Learning from resting readings: ' + b.n + ' of ' + b.target + ' samples (demo speed, a real watch would take days).';
    $('baseKv').innerHTML =
      '<span class="k">Resting HR</span><span class="v">' + Math.round(b.hr) + ' bpm</span><span class="r">usual ' + Math.round(b.hr - 10) + '–' + Math.round(b.hr + 10) + '</span>' +
      '<span class="k">SpO₂</span><span class="v">' + Math.round(b.ox) + '%</span><span class="r">usual ' + Math.round(b.ox - 2) + '–100</span>' +
      '<span class="k">Stress</span><span class="v">' + Math.round(b.st) + '</span><span class="r">usual ' + Math.round(b.st - 12) + '–' + Math.round(b.st + 12) + '</span>';
  }
  function renderLog() {
    $('logEmpty').hidden = ST.events.length > 0;
    $('logBody').innerHTML = ST.events.map(function (e) {
      var cls = (e.type === 'Reminder' || e.type === 'Notification') ? 'info' : SV.STATUS[e.status];
      var lab = e.type === 'Alert' ? SV.STATUS_TEXT[e.status] : e.type;
      return '<tr><td class="n">' + SV.fmt(e.t) + '</td><td><span class="chip ' + cls + '">' + esc(lab) + '</span></td><td>' + esc(e.text) +
        '</td><td class="n">' + e.r.hr + '</td><td class="n">' + e.r.ox + '%</td><td class="n">' + e.r.st + '</td></tr>';
    }).join('');
  }
  function syncActButtons() {
    Array.prototype.forEach.call($('actSeg').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-a') === (ST.mode || 'auto') && ST.scenario === 'normal'));
    });
  }

  /* ---------- doctor message ---------- */
  function snapshot() {
    return {
      t: Date.now(), status: ST.status, activity: ST.activity, r: SV.round(ST.v), base: SV.round(ST.base),
      text: ST.reasons.length ? ST.reasons.map(function (x) { return x.msg; }).join(' ') : 'All readings are within the personal baseline.'
    };
  }
  function buildMsg(e) {
    var nm = $('ptName').value.trim() || 'Patient';
    var st = SV.STATUS_TEXT[e.status].toUpperCase();
    $('msg').value = [
      (e.status ? 'HEALTH ALERT - ' + st : 'HEALTH STATUS - NORMAL') + ' (auto-generated draft, Sentinel Vitals - not yet delivered)',
      'Patient: ' + nm,
      'Event time: ' + SV.fmt(e.t),
      'Status: ' + st,
      'Activity: ' + SV.LABEL[e.activity],
      'Readings: heart rate ' + e.r.hr + ' bpm (personal baseline ' + e.base.hr + '), SpO2 ' + e.r.ox + '% (baseline ' + e.base.ox + '), stress index ' + e.r.st + '/100 (baseline ' + e.base.st + '), steps today ' + e.r.sp + ', last sleep ' + e.r.sl.toFixed(1) + ' h',
      'Detected by: ' + (ST.ml && ST.ml.model ? ST.ml.model + (ST.ml.engine === 'huggingface' ? ' (Hugging Face)' : ' (fallback forecaster)') : 'rule engine') + ' + personal-baseline rules',
      'Reason: ' + (e.text || 'No unusual readings.'),
      e.status === 2 ? 'Requested action: please contact the patient now and advise on emergency care.'
        : e.status === 1 ? 'Requested action: please review when possible and advise if follow-up is needed.'
        : 'Requested action: none.'
    ].join('\n');
  }

  /* ---------- reminders ---------- */
  function renderRem() {
    var now = Date.now();
    $('remList').innerHTML = reminders.map(function (m) {
      var due = now >= m.at;
      return '<li class="' + (due ? 'due' : '') + '" data-id="' + m.id + '"><span>' + esc(m.label) + '</span><span class="row"><span class="cd" data-cd></span>' +
        '<button type="button" class="btn sm" data-del="' + m.id + '">' + (due ? 'Done' : 'Remove') + '</button></span></li>';
    }).join('') || '<li class="muted small">No reminders. Add one below.</li>';
    tickRem();
  }
  function tickRem() {
    var now = Date.now(), changed = false;
    reminders.forEach(function (m) {
      var li = document.querySelector('#remList li[data-id="' + m.id + '"]');
      var left = Math.round((m.at - now) / 1000);
      if (left <= 0 && !m.fired) {
        m.fired = true; changed = true; toast('Reminder: ' + m.label);
        SV.Sync.command({ type: 'event', etype: 'Reminder', text: 'Reminder due: ' + m.label });
      }
      if (li) li.querySelector('[data-cd]').textContent = left > 0 ? 'in ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : 'due now';
    });
    if (changed) renderRem();
  }

  /* ---------- main render, called once per second with the shared state ---------- */
  function onState(st) {
    var first = !ST;
    ST = st;
    var top = ST.events[0];
    if (top && top.type === 'Alert' && top.t !== lastAlertT) { lastAlertT = top.t; msgEvt = top; buildMsg(top); }
    if (first && !msgEvt) { msgEvt = snapshot(); buildMsg(msgEvt); }
    renderBanner(); renderHero(); renderTiles(); hrChart(); renderRules(); renderBase(); renderLog(); syncActButtons(); tickRem();
  }

  /* ---------- controls ---------- */
  function copyText(text, el) {
    var done = function () { toast('Copied'); };
    var fb = function () {
      try { el.focus(); el.select(); if (document.execCommand && document.execCommand('copy')) done(); else toast('Press Ctrl/Cmd+C to copy the selected text'); }
      catch (e) { toast('Select the text and copy it'); }
    };
    try { navigator.clipboard.writeText(text).then(done, fb); } catch (e) { fb(); }
  }
  function csv() {
    var q = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
    var rows = ['time,type,status,heart_rate_bpm,spo2_pct,stress,steps_today,sleep_h,activity,details'];
    ST.events.slice().reverse().forEach(function (e) {
      rows.push([q(SV.fmt(e.t)), q(e.type), q(SV.STATUS_TEXT[e.status]), e.r.hr, e.r.ox, e.r.st, e.r.sp, e.r.sl.toFixed(1), q(SV.LABEL[e.activity]), q(e.text)].join(','));
    });
    return rows.join('\n');
  }
  function download(name, text) {
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {}
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button'); if (!t) return;
    var sc = t.getAttribute('data-sc');
    if (sc) {
      SV.Sync.command({ type: 'scenario', v: sc });
      toast(sc === 'spike' ? 'Emergency spike started' : sc === 'warn' ? 'Warning demo started' : 'Back to normal readings');
      return;
    }
    var del = t.getAttribute('data-del');
    if (del) { reminders = reminders.filter(function (m) { return String(m.id) !== del; }); renderRem(); }
  });
  $('actSeg').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    SV.Sync.command({ type: 'activity', v: b.getAttribute('data-a') });
  });
  $('bnBtn').addEventListener('click', function () { if (SV.Tabs) SV.Tabs.show('doctor'); var c = $('cDoc'); if (c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('btnRelearn').addEventListener('click', function () { SV.Sync.command({ type: 'relearn' }); toast('Baseline learning restarted'); });
  $('btnCopy').addEventListener('click', function () { copyText($('msg').value, $('msg')); });
  $('btnRegen').addEventListener('click', function () { msgEvt = snapshot(); buildMsg(msgEvt); toast('Message updated with current readings'); });
  $('ptName').addEventListener('input', function () { if (msgEvt) buildMsg(msgEvt); });
  $('btnSend').addEventListener('click', function () {
    SV.Sync.command({ type: 'event', etype: 'Notification', text: 'Doctor message marked as sent (simulated, nothing was delivered).' });
    toast('Logged as sent (simulated)');
  });
  $('btnClear').addEventListener('click', function () {
    var b = $('btnClear');
    if (!clearArm) {
      clearArm = 1; b.textContent = 'Click again to confirm'; b.className = 'btn sm danger';
      clearTimeout(clearH); clearH = setTimeout(function () { clearArm = 0; b.textContent = 'Clear history'; b.className = 'btn sm'; }, 4000);
      return;
    }
    clearTimeout(clearH); clearArm = 0; b.textContent = 'Clear history'; b.className = 'btn sm';
    SV.Sync.command({ type: 'clearEvents' }); toast('History cleared');
  });
  $('btnCsv').addEventListener('click', function () {
    var text = csv(); $('csvText').value = text; $('csvPanel').hidden = false;
    download('sentinel-vitals-events.csv', text); toast('CSV ready');
  });
  $('btnCsvClose').addEventListener('click', function () { $('csvPanel').hidden = true; });
  $('btnCsvCopy').addEventListener('click', function () { $('csvText').value = csv(); copyText($('csvText').value, $('csvText')); });
  $('remForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var l = $('remLabel').value.trim(), m = parseInt($('remMin').value, 10);
    if (!l) { toast('Type what to be reminded about'); return; }
    if (!(m > 0)) { toast('Enter minutes from now'); return; }
    reminders.push({ id: ++remId, label: l, at: Date.now() + m * 60000, fired: false });
    $('remLabel').value = ''; renderRem(); toast('Reminder added');
  });

  /* ---------- boot ---------- */
  buildTiles();
  reminders = [
    { id: ++remId, label: 'Drink a glass of water', at: Date.now() + 2 * 60000, fired: false },
    { id: ++remId, label: 'Resting check-in (sit for 5 min)', at: Date.now() + 6 * 60000, fired: false }
  ];
  renderRem();
  setInterval(tickRem, 1000);
  SV.Sync.start({ role: 'app', onState: onState });
})();
